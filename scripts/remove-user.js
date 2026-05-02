#!/usr/bin/env node

/**
 * CLI script to remove a user, their container, and optionally their volume
 *
 * Usage:
 *   node scripts/remove-user.js <username>              # Keeps volume for backup
 *   node scripts/remove-user.js <username> --delete-volume  # Deletes everything
 *
 * The script will:
 * 1. Look up user ID from database
 * 2. Stop and remove user's container
 * 3. Optionally remove user's volume
 * 4. Remove user from database
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';

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
const DB_PATH = process.env.DATABASE_PATH ||
                (process.env.HOME ? join(process.env.HOME, '.cloudcli/auth.db') : join(__dirname, '../server/database/auth.db'));
const VOLUME_PREFIX = 'cloudcli-data';
const CONTAINER_PREFIX = 'cloudcli-user';

function getUserFromDatabase(username) {
  const db = new Database(DB_PATH);

  try {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!user) {
      return null;
    }
    return user;
  } finally {
    db.close();
  }
}

function removeUserFromDatabase(username) {
  const db = new Database(DB_PATH);

  try {
    const result = db.prepare('DELETE FROM users WHERE username = ?').run(username);
    if (result.changes > 0) {
      log.success(`Removed user '${username}' from database`);
    } else {
      log.warn(`User '${username}' not found in database`);
    }
  } finally {
    db.close();
  }
}

function stopAndRemoveContainer(userId) {
  const containerName = `${CONTAINER_PREFIX}-${userId}`;

  try {
    // Check if container exists
    const containers = execSync(`podman ps -a --filter name=${containerName} --format json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const containerList = JSON.parse(containers);
    if (!containerList || containerList.length === 0) {
      log.info(`Container '${containerName}' does not exist`);
      return;
    }

    // Stop container if running
    try {
      execSync(`podman stop ${containerName}`, { encoding: 'utf-8', stdio: 'inherit' });
      log.success(`Stopped container '${containerName}'`);
    } catch (error) {
      log.info(`Container '${containerName}' was not running`);
    }

    // Remove container
    execSync(`podman rm ${containerName}`, { encoding: 'utf-8', stdio: 'inherit' });
    log.success(`Removed container '${containerName}'`);
  } catch (error) {
    log.error(`Failed to remove container: ${error.message}`);
    throw error;
  }
}

function removeVolume(userId) {
  const volumeName = `${VOLUME_PREFIX}-user-${userId}`;

  try {
    // Check if volume exists
    const volumes = execSync(`podman volume ls --filter name=${volumeName} --format json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const volumeList = JSON.parse(volumes);
    if (!volumeList || volumeList.length === 0) {
      log.info(`Volume '${volumeName}' does not exist`);
      return;
    }

    // Remove volume
    execSync(`podman volume rm ${volumeName}`, { encoding: 'utf-8', stdio: 'inherit' });
    log.success(`Removed volume '${volumeName}'`);
  } catch (error) {
    log.error(`Failed to remove volume: ${error.message}`);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bright}Usage:${colors.reset}
  node scripts/remove-user.js <username>
  node scripts/remove-user.js <username> --delete-volume

${colors.bright}Examples:${colors.reset}
  node scripts/remove-user.js alice               # Keep volume for backup
  node scripts/remove-user.js alice --delete-volume  # Delete everything

${colors.bright}Options:${colors.reset}
  --delete-volume   Also remove the user's persistent volume (WARNING: data loss!)
  --help, -h        Show this help message

${colors.bright}What gets removed:${colors.reset}
  - User container (always)
  - User from database (always)
  - User volume (only with --delete-volume)

${colors.bright}Environment Variables:${colors.reset}
  DATABASE_PATH     Path to auth.db (default: ~/.cloudcli/auth.db)
    `);
    process.exit(0);
  }

  const username = args[0];
  const deleteVolume = args.includes('--delete-volume');

  if (!username) {
    log.error('Username is required');
    process.exit(1);
  }

  try {
    log.info(`Removing user: ${username}`);

    // Get user ID
    const user = getUserFromDatabase(username);
    if (!user) {
      log.error(`User '${username}' not found in database`);
      process.exit(1);
    }

    const userId = user.id;
    log.info(`Found user '${username}' with ID ${userId}`);

    // Stop and remove container
    stopAndRemoveContainer(userId);

    // Remove volume if requested
    if (deleteVolume) {
      log.warn('Deleting user volume - all data will be lost!');
      removeVolume(userId);
    } else {
      log.info(`Volume '${VOLUME_PREFIX}-user-${userId}' preserved for backup`);
      log.info(`To remove it later: podman volume rm ${VOLUME_PREFIX}-user-${userId}`);
    }

    // Remove from database
    removeUserFromDatabase(username);

    log.success(`User '${username}' removed successfully!`);
    if (!deleteVolume) {
      log.info(`Volume preserved. To restore: node scripts/add-user.js ${username} <password>`);
    }

  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }
}

main();
