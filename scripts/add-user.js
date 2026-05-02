#!/usr/bin/env node

/**
 * CLI script to add a new user with initialized home directory from template
 *
 * Usage:
 *   node scripts/add-user.js <username> <password>
 *   node scripts/add-user.js --template-only <username>
 *
 * The script will:
 * 1. Create user in database
 * 2. Create persistent volume for user
 * 3. Copy template files to user's home directory
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  error: (msg) => console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  warn: (msg) => console.warn(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
};

// Get database path from environment or use default
// Default path matches the production location used by the server
const DB_PATH = process.env.DATABASE_PATH ||
                (process.env.HOME ? join(process.env.HOME, '.cloudcli/auth.db') : join(__dirname, '../server/database/auth.db'));
const TEMPLATE_DIR = join(__dirname, '../user-template');
const VOLUME_PREFIX = 'cloudcli-data';

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function createUserInDatabase(username, password) {
  const db = new Database(DB_PATH);

  try {
    // Check if user exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      throw new Error(`User '${username}' already exists`);
    }

    // Create user
    const passwordHash = hashPassword(password);
    const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
    const result = stmt.run(username, passwordHash);

    log.success(`Created user '${username}' with ID ${result.lastInsertRowid}`);
    return result.lastInsertRowid;
  } finally {
    db.close();
  }
}

function createUserVolume(userId) {
  const volumeName = `${VOLUME_PREFIX}-user-${userId}`;

  try {
    // Check if volume exists
    const volumes = execSync(`podman volume ls --filter name=${volumeName} --format json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const volumeList = JSON.parse(volumes);
    if (volumeList && volumeList.length > 0) {
      log.info(`Volume '${volumeName}' already exists`);
      return volumeName;
    }

    // Create volume
    execSync(`podman volume create ${volumeName}`, { encoding: 'utf-8' });
    log.success(`Created volume '${volumeName}'`);
    return volumeName;
  } catch (error) {
    throw new Error(`Failed to create volume: ${error.message}`);
  }
}

function getVolumePath(volumeName) {
  try {
    const inspect = execSync(`podman volume inspect ${volumeName} --format json`, {
      encoding: 'utf-8'
    });
    const volumeInfo = JSON.parse(inspect);
    return volumeInfo[0].Mountpoint;
  } catch (error) {
    throw new Error(`Failed to get volume path: ${error.message}`);
  }
}

function copyTemplateToVolume(volumePath) {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    log.warn(`Template directory not found at ${TEMPLATE_DIR}`);
    log.warn('Skipping template copy. Volume will use defaults from container image.');
    return;
  }

  try {
    // Copy all files from template to volume
    // Use rsync if available for better handling of permissions and symlinks
    try {
      execSync(`rsync -av "${TEMPLATE_DIR}/" "${volumePath}/"`, {
        encoding: 'utf-8',
        stdio: 'inherit'
      });
      log.success('Copied template files using rsync');
    } catch {
      // Fallback to cp if rsync not available
      execSync(`cp -a "${TEMPLATE_DIR}/." "${volumePath}/"`, {
        encoding: 'utf-8',
        stdio: 'inherit'
      });
      log.success('Copied template files using cp');
    }

    // Set ownership to container user (UID 100999 by default for rootless podman)
    // This matches the 'agent' user in the container
    try {
      execSync(`chown -R 100999:100999 "${volumePath}"`, { encoding: 'utf-8' });
      log.success('Set ownership to container user (UID 100999)');
    } catch (error) {
      log.warn('Could not set ownership (you may need sudo). Files will use current ownership.');
    }
  } catch (error) {
    throw new Error(`Failed to copy template: ${error.message}`);
  }
}

function initializeVolumeFromTemplate(userId) {
  const volumeName = `${VOLUME_PREFIX}-user-${userId}`;
  const volumePath = getVolumePath(volumeName);

  log.info(`Volume path: ${volumePath}`);
  copyTemplateToVolume(volumePath);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bright}Usage:${colors.reset}
  node scripts/add-user.js <username> <password>
  node scripts/add-user.js --template-only <username>

${colors.bright}Examples:${colors.reset}
  node scripts/add-user.js alice password123
  node scripts/add-user.js --template-only alice

${colors.bright}Options:${colors.reset}
  --template-only   Only copy template to existing user (don't create user)
  --help, -h        Show this help message

${colors.bright}Template Directory:${colors.reset}
  ${TEMPLATE_DIR}

${colors.bright}Environment Variables:${colors.reset}
  DATABASE_PATH     Path to auth.db (default: server/database/auth.db)
    `);
    process.exit(0);
  }

  const templateOnly = args[0] === '--template-only';
  const username = templateOnly ? args[1] : args[0];
  const password = templateOnly ? null : args[1];

  if (!username) {
    log.error('Username is required');
    process.exit(1);
  }

  if (!templateOnly && !password) {
    log.error('Password is required');
    process.exit(1);
  }

  try {
    log.info(`${templateOnly ? 'Initializing template for' : 'Adding new'} user: ${username}`);

    let userId;

    if (templateOnly) {
      // Get existing user ID
      const db = new Database(DB_PATH);
      try {
        const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (!user) {
          throw new Error(`User '${username}' not found`);
        }
        userId = user.id;
        log.info(`Found user '${username}' with ID ${userId}`);
      } finally {
        db.close();
      }
    } else {
      // Create new user
      userId = createUserInDatabase(username, password);
    }

    // Create volume
    const volumeName = createUserVolume(userId);

    // Copy template
    initializeVolumeFromTemplate(userId);

    log.success(`User '${username}' is ready!`);
    log.info(`Volume: ${volumeName}`);
    log.info(`User ID: ${userId}`);

  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }
}

main();
