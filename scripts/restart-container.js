#!/usr/bin/env node
/**
 * Restart a user's container
 * Usage: node scripts/restart-container.js <userId>
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get DATABASE_PATH from environment or use default
const DATABASE_PATH = process.env.DATABASE_PATH || join(homedir(), '.cloudcli', 'auth.db');

const userId = parseInt(process.argv[2]);

if (!userId || isNaN(userId)) {
  console.error('Usage: node scripts/restart-container.js <userId>');
  process.exit(1);
}

console.log(`Restarting container for user ID: ${userId}`);
console.log(`Database: ${DATABASE_PATH}`);

try {
  // Open database
  const db = new Database(DATABASE_PATH);

  // Get container info
  const row = db.prepare('SELECT container_name, container_id, status FROM user_containers WHERE user_id = ?').get(userId);

  if (!row) {
    console.error(`No container found for user ID ${userId}`);
    db.close();
    process.exit(1);
  }

  console.log(`Container: ${row.container_name}, Status: ${row.status}`);

  // Stop and remove the container if it exists
  if (row.container_id) {
    try {
      console.log(`Stopping container ${row.container_name}...`);
      execSync(`podman stop ${row.container_name}`, { stdio: 'inherit' });

      console.log(`Removing container ${row.container_name}...`);
      execSync(`podman rm ${row.container_name}`, { stdio: 'inherit' });
    } catch (err) {
      console.log('Container may already be stopped/removed');
    }
  }

  // Update database to mark as stopped
  console.log('Updating database...');
  db.prepare('UPDATE user_containers SET status = ?, stopped_at = datetime(\'now\'), container_id = NULL WHERE user_id = ?')
    .run('stopped', userId);

  console.log('✓ Container stopped and database updated');
  console.log('✓ Container will be recreated on next user login');

  db.close();
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
