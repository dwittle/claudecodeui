#!/usr/bin/env node

/**
 * CLI script to manage user credentials in the CloudCLI database
 *
 * Usage:
 *   node scripts/manage-credentials.js list <username>
 *   node scripts/manage-credentials.js add <username> <name> <type> <value> [description]
 *   node scripts/manage-credentials.js get <username> <name>
 *   node scripts/manage-credentials.js delete <username> <name>
 *   node scripts/manage-credentials.js export <username> [output-file]
 *   node scripts/manage-credentials.js import <username> <input-file>
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import fs from 'fs';

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

  decrypt(encrypted, iv, authTag, userId) {
    const key = this.deriveUserKey(userId);
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
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

function listCredentials(username) {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    const userId = getUserId(username);

    const credentials = db.prepare(`
      SELECT
        credential_name,
        credential_type,
        description,
        created_at,
        updated_at
      FROM user_credentials
      WHERE user_id = ? AND is_active = 1
      ORDER BY credential_type, credential_name
    `).all(userId);

    if (credentials.length === 0) {
      log.info(`No credentials found for user '${username}'`);
      return;
    }

    console.log(`\n${colors.bright}Credentials for ${username}:${colors.reset}`);
    console.log('─'.repeat(80));

    let currentType = null;
    credentials.forEach(cred => {
      if (cred.credential_type !== currentType) {
        currentType = cred.credential_type;
        console.log(`\n${colors.bright}${currentType.toUpperCase()}:${colors.reset}`);
      }

      console.log(`  ${colors.cyan}${cred.credential_name}${colors.reset}`);
      if (cred.description) {
        console.log(`    ${colors.dim}${cred.description}${colors.reset}`);
      }
      console.log(`    ${colors.dim}Created: ${cred.created_at}${colors.reset}`);
    });

    console.log();
  } finally {
    db.close();
  }
}

function addCredential(username, name, type, value, description = null) {
  const db = new Database(DB_PATH);

  try {
    const userId = getUserId(username);

    // Check if credential already exists
    const existing = db.prepare(`
      SELECT id FROM user_credentials
      WHERE user_id = ? AND credential_name = ?
    `).get(userId, name);

    if (existing) {
      throw new Error(`Credential '${name}' already exists for user '${username}'`);
    }

    // Encrypt the value
    const { encrypted, iv, authTag } = encryption.encrypt(value, userId);

    // Insert into database
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

    stmt.run(userId, name, type, encrypted, iv, authTag, description);

    log.success(`Added credential '${name}' for user '${username}'`);
  } finally {
    db.close();
  }
}

function getCredential(username, name, showValue = true) {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    const userId = getUserId(username);

    const cred = db.prepare(`
      SELECT
        credential_name,
        credential_type,
        credential_value,
        encryption_iv,
        auth_tag,
        description,
        created_at,
        updated_at
      FROM user_credentials
      WHERE user_id = ? AND credential_name = ? AND is_active = 1
    `).get(userId, name);

    if (!cred) {
      throw new Error(`Credential '${name}' not found for user '${username}'`);
    }

    console.log(`\n${colors.bright}Credential Details:${colors.reset}`);
    console.log('─'.repeat(80));
    console.log(`${colors.bright}Name:${colors.reset}        ${cred.credential_name}`);
    console.log(`${colors.bright}Type:${colors.reset}        ${cred.credential_type}`);
    console.log(`${colors.bright}Description:${colors.reset} ${cred.description || colors.dim + 'none' + colors.reset}`);
    console.log(`${colors.bright}Created:${colors.reset}     ${cred.created_at}`);
    console.log(`${colors.bright}Updated:${colors.reset}     ${cred.updated_at}`);

    if (showValue) {
      try {
        const decrypted = encryption.decrypt(
          cred.credential_value,
          cred.encryption_iv,
          cred.auth_tag,
          userId
        );
        console.log(`${colors.bright}Value:${colors.reset}       ${colors.yellow}${decrypted}${colors.reset}`);
      } catch (error) {
        console.log(`${colors.bright}Value:${colors.reset}       ${colors.red}[Decryption failed]${colors.reset}`);
        log.error(`Failed to decrypt: ${error.message}`);
      }
    } else {
      console.log(`${colors.bright}Value:${colors.reset}       ${colors.dim}[encrypted]${colors.reset}`);
    }

    console.log();
  } finally {
    db.close();
  }
}

function deleteCredential(username, name) {
  const db = new Database(DB_PATH);

  try {
    const userId = getUserId(username);

    // Check if credential exists
    const existing = db.prepare(`
      SELECT id FROM user_credentials
      WHERE user_id = ? AND credential_name = ? AND is_active = 1
    `).get(userId, name);

    if (!existing) {
      throw new Error(`Credential '${name}' not found for user '${username}'`);
    }

    // Soft delete (set is_active = 0)
    const stmt = db.prepare(`
      UPDATE user_credentials
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND credential_name = ?
    `);

    stmt.run(userId, name);

    log.success(`Deleted credential '${name}' for user '${username}'`);
  } finally {
    db.close();
  }
}

function exportCredentials(username, outputFile = null) {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    const userId = getUserId(username);

    const credentials = db.prepare(`
      SELECT
        credential_name,
        credential_type,
        credential_value,
        encryption_iv,
        auth_tag,
        description
      FROM user_credentials
      WHERE user_id = ? AND is_active = 1
      ORDER BY credential_type, credential_name
    `).all(userId);

    if (credentials.length === 0) {
      log.info(`No credentials to export for user '${username}'`);
      return;
    }

    // Decrypt all credentials
    const decrypted = credentials.map(cred => {
      try {
        const value = encryption.decrypt(
          cred.credential_value,
          cred.encryption_iv,
          cred.auth_tag,
          userId
        );

        return {
          name: cred.credential_name,
          type: cred.credential_type,
          value: value,
          description: cred.description
        };
      } catch (error) {
        log.warn(`Failed to decrypt '${cred.credential_name}': ${error.message}`);
        return null;
      }
    }).filter(c => c !== null);

    const exportData = {
      username: username,
      exported_at: new Date().toISOString(),
      credentials: decrypted
    };

    const json = JSON.stringify(exportData, null, 2);

    if (outputFile) {
      fs.writeFileSync(outputFile, json, 'utf8');
      log.success(`Exported ${decrypted.length} credentials to ${outputFile}`);
      log.warn(`File contains plaintext credentials - keep it secure!`);
    } else {
      console.log(json);
    }
  } finally {
    db.close();
  }
}

function importCredentials(username, inputFile) {
  if (!fs.existsSync(inputFile)) {
    throw new Error(`File not found: ${inputFile}`);
  }

  const json = fs.readFileSync(inputFile, 'utf8');
  const data = JSON.parse(json);

  if (!data.credentials || !Array.isArray(data.credentials)) {
    throw new Error('Invalid import file format');
  }

  const db = new Database(DB_PATH);

  try {
    const userId = getUserId(username);

    let imported = 0;
    let skipped = 0;

    for (const cred of data.credentials) {
      // Check if credential already exists
      const existing = db.prepare(`
        SELECT id FROM user_credentials
        WHERE user_id = ? AND credential_name = ?
      `).get(userId, cred.name);

      if (existing) {
        log.warn(`Skipping existing credential: ${cred.name}`);
        skipped++;
        continue;
      }

      // Encrypt and insert
      const { encrypted, iv, authTag } = encryption.encrypt(cred.value, userId);

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
        cred.name,
        cred.type,
        encrypted,
        iv,
        authTag,
        cred.description || null
      );

      imported++;
    }

    log.success(`Imported ${imported} credentials for user '${username}'`);
    if (skipped > 0) {
      log.info(`Skipped ${skipped} existing credentials`);
    }
  } finally {
    db.close();
  }
}

function showHelp() {
  console.log(`
${colors.bright}CloudCLI Credential Management${colors.reset}

${colors.bright}Usage:${colors.reset}
  node scripts/manage-credentials.js <command> [arguments]

${colors.bright}Commands:${colors.reset}
  ${colors.cyan}list${colors.reset} <username>
      List all credentials for a user (names and types only)
      Example: node scripts/manage-credentials.js list alice

  ${colors.cyan}add${colors.reset} <username> <name> <type> <value> [description]
      Add a new encrypted credential
      Types: env_var, api_key, token, password, ssh_key, certificate, other
      Example: node scripts/manage-credentials.js add alice MY_API_KEY api_key abc123 "Production API"

  ${colors.cyan}get${colors.reset} <username> <name>
      Show credential details including decrypted value
      ${colors.yellow}WARNING: Displays plaintext credential value${colors.reset}
      Example: node scripts/manage-credentials.js get alice MY_API_KEY

  ${colors.cyan}delete${colors.reset} <username> <name>
      Delete a credential (soft delete - remains in database)
      Example: node scripts/manage-credentials.js delete alice MY_API_KEY

  ${colors.cyan}export${colors.reset} <username> [output-file]
      Export all credentials as JSON (decrypted)
      ${colors.yellow}WARNING: Creates file with plaintext credentials${colors.reset}
      Example: node scripts/manage-credentials.js export alice credentials.json

  ${colors.cyan}import${colors.reset} <username> <input-file>
      Import credentials from JSON file
      Example: node scripts/manage-credentials.js import alice credentials.json

  ${colors.cyan}help${colors.reset}
      Show this help message

${colors.bright}Environment Variables:${colors.reset}
  ENCRYPTION_MASTER_KEY      Required - Master key for encryption/decryption
  DATABASE_PATH              Custom database location (default: ~/.cloudcli/auth.db)

${colors.bright}Credential Types:${colors.reset}
  env_var       Environment variables
  api_key       API keys and tokens
  token         OAuth tokens, JWT tokens
  password      Passwords
  ssh_key       SSH private keys
  certificate   TLS/SSL certificates
  other         Other credential types

${colors.bright}Security Notes:${colors.reset}
  - All credentials are encrypted with AES-256-GCM
  - Each user has a unique encryption key derived from the master key
  - Export files contain plaintext credentials - keep them secure
  - ENCRYPTION_MASTER_KEY must match the server's configuration

${colors.bright}Examples:${colors.reset}
  # List credentials
  node scripts/manage-credentials.js list bob

  # Add API key
  node scripts/manage-credentials.js add bob GITHUB_TOKEN api_key ghp_abc123 "GitHub PAT"

  # Add environment variable
  node scripts/manage-credentials.js add bob DATABASE_URL env_var "postgres://..."

  # View credential
  node scripts/manage-credentials.js get bob GITHUB_TOKEN

  # Export for backup
  node scripts/manage-credentials.js export bob backup.json

  # Delete credential
  node scripts/manage-credentials.js delete bob OLD_TOKEN
`);
}

// Main CLI handler
async function main() {
  const [,, command, ...args] = process.argv;

  try {
    // Verify encryption is configured (except for help command)
    if (command !== 'help' && command !== '--help' && command !== '-h') {
      encryption.getMasterKey();
    }

    switch (command) {
      case 'list':
        if (args.length < 1) {
          log.error('Usage: manage-credentials.js list <username>');
          process.exit(1);
        }
        listCredentials(args[0]);
        break;

      case 'add':
        if (args.length < 4) {
          log.error('Usage: manage-credentials.js add <username> <name> <type> <value> [description]');
          process.exit(1);
        }
        addCredential(args[0], args[1], args[2], args[3], args[4]);
        break;

      case 'get':
        if (args.length < 2) {
          log.error('Usage: manage-credentials.js get <username> <name>');
          process.exit(1);
        }
        getCredential(args[0], args[1]);
        break;

      case 'delete':
        if (args.length < 2) {
          log.error('Usage: manage-credentials.js delete <username> <name>');
          process.exit(1);
        }
        deleteCredential(args[0], args[1]);
        break;

      case 'export':
        if (args.length < 1) {
          log.error('Usage: manage-credentials.js export <username> [output-file]');
          process.exit(1);
        }
        exportCredentials(args[0], args[1]);
        break;

      case 'import':
        if (args.length < 2) {
          log.error('Usage: manage-credentials.js import <username> <input-file>');
          process.exit(1);
        }
        importCredentials(args[0], args[1]);
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      default:
        log.error(`Unknown command: ${command}`);
        console.log('Run "node scripts/manage-credentials.js help" for usage information');
        process.exit(1);
    }
  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }
}

main();
