#!/usr/bin/env node

/**
 * Test script for multi-user container mode
 * Tests the full flow: Login → API Request → Container Creation → Proxy
 */

import sqlite3 from 'sqlite3';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const GATEWAY_URL = 'http://localhost:3333';
const DB_PATH = `${process.env.HOME}/.cloudcli/auth.db`;

// ANSI colors
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, symbol, message) {
  console.log(`${colors[color]}${symbol} ${message}${colors.reset}`);
}

async function getJwtSecret() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.get("SELECT value FROM app_config WHERE key='jwt_secret'", (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row?.value);
    });
  });
}

async function getUserId() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.get("SELECT id FROM users LIMIT 1", (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row?.id);
    });
  });
}

async function checkContainer() {
  try {
    const { stdout } = await execAsync('podman ps --format json');
    const containers = JSON.parse(stdout);
    return containers.filter(c => c.Names && c.Names.includes('cloudcli-user'));
  } catch (error) {
    return [];
  }
}

async function main() {
  console.log('\n' + '='.repeat(50));
  console.log('Multi-User Container Mode Test');
  console.log('='.repeat(50) + '\n');

  try {
    // Step 1: Check gateway health
    log('blue', '1️⃣ ', 'Checking gateway health...');
    const healthRes = await fetch(`${GATEWAY_URL}/api/health`);
    if (healthRes.ok || healthRes.status === 302) {
      log('green', '✓', 'Gateway is running');
    } else {
      throw new Error('Gateway not responding');
    }

    // Step 2: Get JWT secret and create token
    log('blue', '\n2️⃣ ', 'Getting JWT secret from database...');
    const jwtSecret = await getJwtSecret();
    if (!jwtSecret) {
      throw new Error('No JWT secret found');
    }
    log('green', '✓', `JWT secret found: ${jwtSecret.substring(0, 20)}...`);

    // Step 3: Get user ID
    log('blue', '\n3️⃣ ', 'Getting user ID...');
    const userId = await getUserId();
    if (!userId) {
      throw new Error('No users found in database');
    }
    log('green', '✓', `User ID: ${userId}`);

    // Step 4: Create JWT token
    log('blue', '\n4️⃣ ', 'Creating JWT token...');
    const token = jwt.sign({ userId }, jwtSecret, { expiresIn: '1h' });
    log('green', '✓', `Token created: ${token.substring(0, 30)}...`);

    // Step 5: Check containers before request
    log('blue', '\n5️⃣ ', 'Checking containers before API request...');
    let containersBefore = await checkContainer();
    log('yellow', 'ℹ', `Containers running: ${containersBefore.length}`);
    if (containersBefore.length > 0) {
      containersBefore.forEach(c => {
        log('yellow', '  ', `- ${c.Names[0]} (${c.State})`);
      });
    }

    // Step 6: Make API request that should trigger container creation
    log('blue', '\n6️⃣ ', 'Making API request to trigger container...');
    const apiRes = await fetch(`${GATEWAY_URL}/api/projects`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`   Response status: ${apiRes.status}`);

    if (!apiRes.ok) {
      const errorText = await apiRes.text();
      log('yellow', '⚠', `Response: ${errorText.substring(0, 200)}`);
    } else {
      const data = await apiRes.json();
      log('green', '✓', `API request successful!`);
      console.log(`   Projects returned: ${Array.isArray(data) ? data.length : 'N/A'}`);
    }

    // Step 7: Wait for container to start
    log('blue', '\n7️⃣ ', 'Waiting for container to start...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 8: Check containers after request
    log('blue', '\n8️⃣ ', 'Checking containers after API request...');
    let containersAfter = await checkContainer();
    log('yellow', 'ℹ', `Containers running: ${containersAfter.length}`);

    if (containersAfter.length > 0) {
      containersAfter.forEach(c => {
        log('green', '  ', `- ${c.Names[0]} (${c.State}) - Port: ${c.Ports || 'N/A'}`);
      });

      // Check if new container was created
      if (containersAfter.length > containersBefore.length) {
        log('green', '✓', 'NEW CONTAINER CREATED!');
      }
    } else {
      log('yellow', '⚠', 'No containers found - multi-user mode may not have triggered');
    }

    // Step 9: Test direct container access
    if (containersAfter.length > 0) {
      log('blue', '\n9️⃣ ', 'Testing direct container access...');
      const containerPort = containersAfter[0].Ports?.[0]?.hostPort || 4001;
      try {
        const containerRes = await fetch(`http://localhost:${containerPort}/api/health`);
        if (containerRes.ok || containerRes.status === 302) {
          log('green', '✓', `Container responding on port ${containerPort}`);
        }
      } catch (error) {
        log('red', '✗', `Container not accessible: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(50));
    log('green', '✓', 'Multi-user mode test complete!');
    console.log('='.repeat(50) + '\n');

  } catch (error) {
    log('red', '✗', `Test failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
