#!/usr/bin/env node

/**
 * CLI script to manage users in the CloudCLI database
 *
 * Usage:
 *   node scripts/manage-users.js list
 *   node scripts/manage-users.js add <username> <password>
 *   node scripts/manage-users.js password <username> <new-password>
 *   node scripts/manage-users.js activate <username>
 *   node scripts/manage-users.js deactivate <username>
 *   node scripts/manage-users.js delete <username>
 *   node scripts/manage-users.js info <username>
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  error: (msg) => console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  warn: (msg) => console.warn(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
};

// Get database path from environment or use default
const DB_PATH = process.env.DATABASE_PATH ||
                (process.env.HOME ? join(process.env.HOME, '.cloudcli/auth.db') : join(__dirname, '../server/database/auth.db'));
const DISABLE_PASSWORD_HASHING = process.env.DISABLE_PASSWORD_HASHING === 'true';
const TEMPLATE_DIR = join(__dirname, '../user-template');
const VOLUME_PREFIX = 'cloudcli-data';

async function hashPassword(password) {
  if (DISABLE_PASSWORD_HASHING) {
    log.warn('WARNING: Password hashing disabled - storing plaintext password!');
    return password;
  }
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

function createUserVolume(userId) {
  const volumeName = `${VOLUME_PREFIX}-user-${userId}`;

  try {
    // Check if volume exists
    const volumes = execSync(`podman volume ls -q --filter name=${volumeName}`, { encoding: 'utf8' }).trim();
    if (volumes) {
      log.info(`Volume '${volumeName}' already exists`);
      return volumeName;
    }

    // Create volume
    execSync(`podman volume create ${volumeName}`, { stdio: 'inherit' });
    log.success(`Created volume '${volumeName}'`);

    // Get volume mount path
    const volumeInfo = execSync(`podman volume inspect ${volumeName} --format '{{.Mountpoint}}'`, { encoding: 'utf8' }).trim();
    log.info(`Volume path: ${volumeInfo}`);

    // Copy template files to volume
    if (TEMPLATE_DIR) {
      log.info(`Copying template files to volume...`);
      execSync(`podman unshare sh -c 'cp -a "${TEMPLATE_DIR}/." "${volumeInfo}/" && chown -R 1000:1000 "${volumeInfo}"'`, { stdio: 'inherit' });
      log.success(`Template files copied to ${volumeName}`);
    }

    return volumeName;
  } catch (error) {
    log.error(`Failed to create volume: ${error.message}`);
    throw error;
  }
}

function listUsers() {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    const users = db.prepare(`
      SELECT
        u.id,
        u.username,
        u.is_active,
        u.created_at,
        u.last_login,
        uc.container_name,
        uc.status as container_status
      FROM users u
      LEFT JOIN user_containers uc ON u.id = uc.user_id
      ORDER BY u.id
    `).all();

    if (users.length === 0) {
      log.info('No users found');
      return;
    }

    console.log(`\n${colors.bright}Users:${colors.reset}`);
    console.log('─'.repeat(100));

    users.forEach(user => {
      const active = user.is_active ? `${colors.green}active${colors.reset}` : `${colors.red}inactive${colors.reset}`;
      const container = user.container_name ? `${user.container_name} (${user.container_status})` : `${colors.dim}none${colors.reset}`;

      console.log(`${colors.bright}ID:${colors.reset} ${user.id}`);
      console.log(`  Username:  ${user.username}`);
      console.log(`  Status:    ${active}`);
      console.log(`  Created:   ${user.created_at}`);
      console.log(`  Last Login: ${user.last_login || `${colors.dim}never${colors.reset}`}`);
      console.log(`  Container: ${container}`);
      console.log();
    });
  } finally {
    db.close();
  }
}

async function addUser(username, password, createVolume = true) {
  const db = new Database(DB_PATH);

  try {
    // Check if user exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      throw new Error(`User '${username}' already exists`);
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
    const result = stmt.run(username, passwordHash);
    const userId = result.lastInsertRowid;

    log.success(`Created user '${username}' with ID ${userId}`);

    // Create volume if requested
    if (createVolume) {
      createUserVolume(userId);
    }

    return userId;
  } finally {
    db.close();
  }
}

async function changePassword(username, newPassword) {
  const db = new Database(DB_PATH);

  try {
    // Check if user exists
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!user) {
      throw new Error(`User '${username}' not found`);
    }

    // Update password
    const passwordHash = await hashPassword(newPassword);
    const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE username = ?');
    stmt.run(passwordHash, username);

    log.success(`Updated password for user '${username}'`);
  } finally {
    db.close();
  }
}

function setUserActive(username, isActive) {
  const db = new Database(DB_PATH);

  try {
    // Check if user exists
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!user) {
      throw new Error(`User '${username}' not found`);
    }

    // Update status
    const stmt = db.prepare('UPDATE users SET is_active = ? WHERE username = ?');
    stmt.run(isActive ? 1 : 0, username);

    const status = isActive ? 'activated' : 'deactivated';
    log.success(`User '${username}' ${status}`);
  } finally {
    db.close();
  }
}

function deleteUser(username) {
  const db = new Database(DB_PATH);

  try {
    // Get user info
    const user = db.prepare(`
      SELECT u.id, u.username, uc.container_name, uc.volume_name
      FROM users u
      LEFT JOIN user_containers uc ON u.id = uc.user_id
      WHERE u.username = ?
    `).get(username);

    if (!user) {
      throw new Error(`User '${username}' not found`);
    }

    // Warn about container/volume
    if (user.container_name) {
      log.warn(`User has container: ${user.container_name}`);
      log.warn(`User has volume: ${user.volume_name}`);
      log.warn('Use ./scripts/manage.sh to clean up containers and volumes');
    }

    // Delete user (cascade will delete related records)
    const stmt = db.prepare('DELETE FROM users WHERE username = ?');
    stmt.run(username);

    log.success(`Deleted user '${username}' (ID: ${user.id})`);
  } finally {
    db.close();
  }
}

function showUserInfo(username) {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    // Get user with all related info
    const user = db.prepare(`
      SELECT
        u.*,
        uc.container_id,
        uc.container_name,
        uc.internal_port,
        uc.volume_name,
        uc.network_name,
        uc.status as container_status,
        uc.agent_type,
        COUNT(DISTINCT cred.id) as credential_count
      FROM users u
      LEFT JOIN user_containers uc ON u.id = uc.user_id
      LEFT JOIN user_credentials cred ON u.id = cred.user_id AND cred.is_active = 1
      WHERE u.username = ?
      GROUP BY u.id
    `).get(username);

    if (!user) {
      throw new Error(`User '${username}' not found`);
    }

    console.log(`\n${colors.bright}User Details:${colors.reset}`);
    console.log('─'.repeat(80));
    console.log(`${colors.bright}ID:${colors.reset}           ${user.id}`);
    console.log(`${colors.bright}Username:${colors.reset}     ${user.username}`);
    console.log(`${colors.bright}Status:${colors.reset}       ${user.is_active ? `${colors.green}active${colors.reset}` : `${colors.red}inactive${colors.reset}`}`);
    console.log(`${colors.bright}Created:${colors.reset}      ${user.created_at}`);
    console.log(`${colors.bright}Last Login:${colors.reset}   ${user.last_login || `${colors.dim}never${colors.reset}`}`);
    console.log(`${colors.bright}Credentials:${colors.reset}  ${user.credential_count}`);

    if (user.container_name) {
      console.log(`\n${colors.bright}Container:${colors.reset}`);
      console.log(`  Name:    ${user.container_name}`);
      console.log(`  ID:      ${user.container_id}`);
      console.log(`  Status:  ${user.container_status}`);
      console.log(`  Port:    ${user.internal_port}`);
      console.log(`  Agent:   ${user.agent_type}`);
      console.log(`  Volume:  ${user.volume_name}`);
      console.log(`  Network: ${user.network_name}`);
    } else {
      console.log(`\n${colors.bright}Container:${colors.reset} ${colors.dim}none${colors.reset}`);
    }

    // Show credentials (encrypted values)
    const credentials = db.prepare(`
      SELECT credential_name, credential_type, description, created_at
      FROM user_credentials
      WHERE user_id = ? AND is_active = 1
      ORDER BY credential_name
    `).all(user.id);

    if (credentials.length > 0) {
      console.log(`\n${colors.bright}Credentials:${colors.reset}`);
      credentials.forEach(cred => {
        console.log(`  • ${cred.credential_name} (${cred.credential_type})`);
        if (cred.description) {
          console.log(`    ${colors.dim}${cred.description}${colors.reset}`);
        }
      });
    }

    console.log();
  } finally {
    db.close();
  }
}

function showHelp() {
  console.log(`
${colors.bright}CloudCLI User Management${colors.reset}

${colors.bright}Usage:${colors.reset}
  node scripts/manage-users.js <command> [arguments]

${colors.bright}Commands:${colors.reset}
  ${colors.cyan}list${colors.reset}
      List all users with their status and containers

  ${colors.cyan}add${colors.reset} <username> <password>
      Create a new user with a persistent volume
      Example: node scripts/manage-users.js add alice secretpass123

  ${colors.cyan}password${colors.reset} <username> <new-password>
      Change a user's password
      Example: node scripts/manage-users.js password alice newpass456

  ${colors.cyan}activate${colors.reset} <username>
      Activate a user account
      Example: node scripts/manage-users.js activate alice

  ${colors.cyan}deactivate${colors.reset} <username>
      Deactivate a user account (prevents login)
      Example: node scripts/manage-users.js deactivate alice

  ${colors.cyan}delete${colors.reset} <username>
      Delete a user from the database
      ${colors.yellow}Warning: Does not remove containers/volumes${colors.reset}
      Example: node scripts/manage-users.js delete alice

  ${colors.cyan}info${colors.reset} <username>
      Show detailed information about a user
      Example: node scripts/manage-users.js info alice

  ${colors.cyan}help${colors.reset}
      Show this help message

${colors.bright}Environment Variables:${colors.reset}
  DATABASE_PATH              Custom database location
  DISABLE_PASSWORD_HASHING   Store passwords as plaintext (testing only)

${colors.bright}Examples:${colors.reset}
  # List all users
  node scripts/manage-users.js list

  # Add a new user
  node scripts/manage-users.js add bob password123

  # View user details
  node scripts/manage-users.js info bob

  # Change password
  node scripts/manage-users.js password bob newpass456

  # Deactivate user
  node scripts/manage-users.js deactivate bob

  # Clean up everything (use manage.sh)
  ./scripts/manage.sh db-delete
`);
}

// Main CLI handler
async function main() {
  const [,, command, ...args] = process.argv;

  try {
    switch (command) {
      case 'list':
        listUsers();
        break;

      case 'add':
        if (args.length < 2) {
          log.error('Usage: manage-users.js add <username> <password>');
          process.exit(1);
        }
        await addUser(args[0], args[1]);
        break;

      case 'password':
        if (args.length < 2) {
          log.error('Usage: manage-users.js password <username> <new-password>');
          process.exit(1);
        }
        await changePassword(args[0], args[1]);
        break;

      case 'activate':
        if (args.length < 1) {
          log.error('Usage: manage-users.js activate <username>');
          process.exit(1);
        }
        setUserActive(args[0], true);
        break;

      case 'deactivate':
        if (args.length < 1) {
          log.error('Usage: manage-users.js deactivate <username>');
          process.exit(1);
        }
        setUserActive(args[0], false);
        break;

      case 'delete':
        if (args.length < 1) {
          log.error('Usage: manage-users.js delete <username>');
          process.exit(1);
        }
        deleteUser(args[0]);
        break;

      case 'info':
        if (args.length < 1) {
          log.error('Usage: manage-users.js info <username>');
          process.exit(1);
        }
        showUserInfo(args[0]);
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      default:
        log.error(`Unknown command: ${command}`);
        console.log('Run "node scripts/manage-users.js help" for usage information');
        process.exit(1);
    }
  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }
}

main();
