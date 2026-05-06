#!/usr/bin/env node

/**
 * Import environment variables from the host environment as user credentials
 *
 * Usage:
 *   # Import for specific user
 *   node scripts/import-env.js <username>
 *
 *   # Import for all active users
 *   node scripts/import-env.js --all
 *
 *   # Update existing credentials (default is to skip)
 *   node scripts/import-env.js <username> --force
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';
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

// Encryption constants (must match server/services/encryption.js)
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const SALT = 'cloudcli-credential-encryption-v1';

// Environment variables to import (with descriptions)
const ENV_VARS_TO_IMPORT = [
  // PAN-OS Firewall
  { name: 'PANOS_USERNAME', type: 'env_var', description: 'PAN-OS admin username' },
  { name: 'PANOS_PASSWORD', type: 'env_var', description: 'PAN-OS admin password' },
  { name: 'PANOS_BASTION_HOST', type: 'env_var', description: 'PAN-OS bastion host' },

  // Network Switch
  { name: 'NETSWITCH_USERNAME', type: 'env_var', description: 'Network switch username' },
  { name: 'NETSWITCH_PASSWORD', type: 'env_var', description: 'Network switch password' },
  { name: 'NETSWITCH_ENABLE_PASSWORD', type: 'env_var', description: 'Network switch enable password' },

  // AKiPS Monitoring
  { name: 'AKIPS_API_PASSWORD', type: 'env_var', description: 'AKiPS API password' },
  { name: 'AKIPS_SERVER', type: 'env_var', description: 'AKiPS server hostname' },
  { name: 'AKIPS_USERNAME', type: 'env_var', description: 'AKiPS username' },
  { name: 'AKIPS_VERIFY_SSL', type: 'env_var', description: 'AKiPS SSL verification flag' },
];

class EncryptionService {
  constructor() {
    this.masterKey = null;
  }

  getMasterKey() {
    if (this.masterKey) {
      return this.masterKey;
    }

    const key = process.env.ENCRYPTION_MASTER_KEY;
    if (!key) {
      throw new Error(
        'ENCRYPTION_MASTER_KEY environment variable must be set.\n' +
        'Generate one with: openssl rand -hex 32'
      );
    }

    this.masterKey = crypto.scryptSync(key, SALT, KEY_LENGTH);
    return this.masterKey;
  }

  deriveUserKey(userId) {
    const userSalt = crypto.createHash('sha256')
      .update(`${userId}`)
      .digest();

    const masterKey = this.getMasterKey();
    return crypto.hkdfSync('sha256', masterKey, userSalt, 'credential-key', KEY_LENGTH);
  }

  encrypt(plaintext, userId) {
    const key = this.deriveUserKey(userId);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }
}

const encryption = new EncryptionService();

function getUserId(username) {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!user) {
      throw new Error(`User '${username}' not found`);
    }
    return user.id;
  } finally {
    db.close();
  }
}

function getAllActiveUsers() {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const users = db.prepare('SELECT id, username FROM users WHERE is_active = 1').all();
    return users;
  } finally {
    db.close();
  }
}

function importEnvVarsForUser(username, force = false) {
  const db = new Database(DB_PATH);

  try {
    const userId = getUserId(username);

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let missing = 0;

    console.log(`\n${colors.bright}Importing environment variables for user: ${username}${colors.reset}`);
    console.log('─'.repeat(80));

    for (const envVar of ENV_VARS_TO_IMPORT) {
      const value = process.env[envVar.name];

      if (!value) {
        log.warn(`${envVar.name} not set in environment - skipping`);
        missing++;
        continue;
      }

      // Check if credential already exists
      const existing = db.prepare(`
        SELECT id, is_active FROM user_credentials
        WHERE user_id = ? AND credential_name = ?
      `).get(userId, envVar.name);

      if (existing) {
        if (!force) {
          log.info(`${envVar.name} already exists - use --force to update`);
          skipped++;
          continue;
        }

        // Delete existing credential
        db.prepare('DELETE FROM user_credentials WHERE id = ?').run(existing.id);
        log.info(`Updating ${envVar.name}...`);
      } else {
        log.info(`Adding ${envVar.name}...`);
      }

      // Encrypt and insert
      const { encrypted, iv, authTag } = encryption.encrypt(value, userId);

      const stmt = db.prepare(`
        INSERT INTO user_credentials (
          user_id,
          credential_name,
          credential_type,
          credential_value,
          encryption_iv,
          auth_tag,
          description
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        userId,
        envVar.name,
        envVar.type,
        encrypted,
        iv,
        authTag,
        envVar.description
      );

      if (existing) {
        updated++;
      } else {
        imported++;
      }
    }

    console.log();
    log.success(`Completed for user '${username}':`);
    console.log(`  ${colors.green}✓${colors.reset} Imported: ${imported}`);
    if (updated > 0) {
      console.log(`  ${colors.green}✓${colors.reset} Updated: ${updated}`);
    }
    if (skipped > 0) {
      console.log(`  ${colors.yellow}○${colors.reset} Skipped: ${skipped} (use --force to update)`);
    }
    if (missing > 0) {
      console.log(`  ${colors.red}✗${colors.reset} Missing: ${missing} (not set in environment)`);
    }
    console.log();

    return { imported, updated, skipped, missing };
  } finally {
    db.close();
  }
}

function showHelp() {
  console.log(`
${colors.bright}CloudCLI Environment Variable Import${colors.reset}

${colors.bright}Description:${colors.reset}
  Import environment variables from your shell environment (e.g., ~/.bash_profile)
  into the CloudCLI credential store. Variables are encrypted and injected into
  worker containers at runtime.

${colors.bright}Usage:${colors.reset}
  node scripts/import-env.js <username> [--force]
  node scripts/import-env.js --all [--force]

${colors.bright}Options:${colors.reset}
  ${colors.cyan}--force${colors.reset}    Update existing credentials (default: skip existing)
  ${colors.cyan}--all${colors.reset}      Import for all active users

${colors.bright}Environment Variables:${colors.reset}
  The following variables will be imported if set in your environment:

  ${colors.bright}PAN-OS Firewall:${colors.reset}
    PANOS_USERNAME             Admin username
    PANOS_PASSWORD             Admin password
    PANOS_BASTION_HOST         Bastion host for SSH access

  ${colors.bright}Network Switch:${colors.reset}
    NETSWITCH_USERNAME         Switch username
    NETSWITCH_PASSWORD         Switch password
    NETSWITCH_ENABLE_PASSWORD  Enable mode password

  ${colors.bright}AKiPS Monitoring:${colors.reset}
    AKIPS_API_PASSWORD         API password
    AKIPS_SERVER               Server hostname
    AKIPS_USERNAME             API username
    AKIPS_VERIFY_SSL           SSL verification (true/false)

${colors.bright}Requirements:${colors.reset}
  - ENCRYPTION_MASTER_KEY environment variable must be set
  - Environment variables must be sourced in your current shell
  - Variables are stored encrypted in the database

${colors.bright}Setup Instructions:${colors.reset}
  1. Add variables to ~/.bash_profile:
     ${colors.dim}export PANOS_USERNAME='admin'
     export PANOS_PASSWORD='your-password'
     # ... etc${colors.reset}

  2. Source your profile:
     ${colors.dim}source ~/.bash_profile${colors.reset}

  3. Run this script:
     ${colors.dim}node scripts/import-env.js alice${colors.reset}

  4. Restart user's container to apply:
     ${colors.dim}# Container will be restarted automatically on next login${colors.reset}

${colors.bright}Examples:${colors.reset}
  # Import for specific user
  node scripts/import-env.js alice

  # Update existing credentials
  node scripts/import-env.js alice --force

  # Import for all users
  node scripts/import-env.js --all

  # Import with all variables set
  source ~/.bash_profile && node scripts/import-env.js bob

${colors.bright}Notes:${colors.reset}
  - Variables are only imported if they are set in your environment
  - Existing credentials are skipped unless --force is used
  - Containers must be restarted for changes to take effect
  - To add custom variables, edit the ENV_VARS_TO_IMPORT array in this script
`);
}

// Main CLI handler
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  try {
    // Verify encryption is configured
    encryption.getMasterKey();

    const force = args.includes('--force');
    const all = args.includes('--all');

    if (all) {
      const users = getAllActiveUsers();

      if (users.length === 0) {
        log.warn('No active users found');
        return;
      }

      console.log(`\n${colors.bright}Importing for ${users.length} active user(s)${colors.reset}`);

      let totalImported = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;
      let totalMissing = 0;

      for (const user of users) {
        const result = importEnvVarsForUser(user.username, force);
        totalImported += result.imported;
        totalUpdated += result.updated;
        totalSkipped += result.skipped;
        totalMissing += result.missing;
      }

      console.log(`${colors.bright}Overall Summary:${colors.reset}`);
      console.log(`  Imported: ${totalImported}`);
      console.log(`  Updated: ${totalUpdated}`);
      console.log(`  Skipped: ${totalSkipped}`);
      console.log(`  Missing: ${totalMissing}`);
      console.log();

    } else {
      const username = args.find(arg => !arg.startsWith('--'));

      if (!username) {
        log.error('Username required. Use --help for usage information.');
        process.exit(1);
      }

      importEnvVarsForUser(username, force);
    }

    log.info('Remember to restart containers for changes to take effect');
    log.info('Containers will be restarted automatically on next user login');

  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }
}

main();
