#!/usr/bin/env node
/**
 * Stop all CloudCLI processes and update container state in the database.
 *
 * Usage:
 *   node scripts/stop.js [--no-server] [--no-containers]
 *
 * Options:
 *   --no-server      Skip killing the server/Vite processes
 *   --no-containers  Skip stopping containers (DB still updated)
 *
 * Environment variables honoured:
 *   DATABASE_PATH      Path to auth.db
 *   CONTAINER_RUNTIME  'podman' | 'docker' | 'auto' (default: auto-detect)
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ─── Colours ────────────────────────────────────────────────────────────────

const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  grey:    '\x1b[90m',
};
const ok   = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`);
const info = (msg) => console.log(`${c.cyan}→${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}⚠${c.reset}  ${msg}`);
const fail = (msg) => console.log(`${c.red}✗${c.reset} ${msg}`);
const sep  = ()    => console.log(`${c.grey}${'─'.repeat(56)}${c.reset}`);

// ─── Args ────────────────────────────────────────────────────────────────────

const args        = process.argv.slice(2);
const stopServer     = !args.includes('--no-server');
const stopContainers = !args.includes('--no-containers');

// ─── Load .env ───────────────────────────────────────────────────────────────

function loadDotenv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return {};
  const vars = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    vars[key] = val;
  }
  return vars;
}

const env = loadDotenv();

const DATABASE_PATH = process.env.DATABASE_PATH
  || env.DATABASE_PATH
  || join(homedir(), '.cloudcli', 'auth.db');

const CONTAINER_RUNTIME = process.env.CONTAINER_RUNTIME
  || env.CONTAINER_RUNTIME
  || 'auto';

// ─── Detect container runtime ─────────────────────────────────────────────────

function detectRuntime() {
  if (CONTAINER_RUNTIME === 'podman') return 'podman';
  if (CONTAINER_RUNTIME === 'docker') return 'docker';

  // auto-detect
  for (const rt of ['podman', 'docker']) {
    const r = spawnSync(rt, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return rt;
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd, { silent = false } = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' });
  } catch {
    return null;
  }
}

function pkillPattern(pattern) {
  // pkill -f on Linux; fallback to kill via pgrep
  const result = spawnSync('pkill', ['-f', pattern], { encoding: 'utf8' });
  return result.status === 0;
}

// ─── 1. Stop server processes ────────────────────────────────────────────────

if (stopServer) {
  sep();
  console.log(`${c.bold}Stopping server processes${c.reset}`);
  sep();

  const patterns = [
    'server/index.js',   // tsx / node server
    'vite',              // Vite dev client
    'concurrently',      // npm run dev wrapper
  ];

  let killed = false;
  for (const pat of patterns) {
    if (pkillPattern(pat)) {
      ok(`Killed processes matching "${pat}"`);
      killed = true;
    }
  }

  if (!killed) {
    info('No server processes found (already stopped)');
  }
}

// ─── 2. Stop containers ───────────────────────────────────────────────────────

const runtime = detectRuntime();

if (stopContainers) {
  sep();
  console.log(`${c.bold}Stopping containers${c.reset}`);
  sep();

  if (!runtime) {
    warn('No container runtime found (podman/docker). Skipping container stop.');
  } else {
    info(`Using runtime: ${runtime}`);

    // List all cloudcli-user-* containers (running or stopped)
    const raw = run(
      `${runtime} ps -a --filter "name=cloudcli-user" --format "{{.Names}}\t{{.Status}}"`,
      { silent: true }
    );

    const containers = (raw || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => { const [name, ...rest] = l.split('\t'); return { name, status: rest.join(' ') }; });

    if (containers.length === 0) {
      info('No CloudCLI containers found');
    } else {
      for (const { name, status } of containers) {
        if (status.toLowerCase().startsWith('up')) {
          info(`Stopping ${name} (${status})`);
          const stopped = run(`${runtime} stop ${name}`, { silent: true });
          if (stopped !== null) {
            ok(`Stopped ${name}`);
          } else {
            fail(`Failed to stop ${name}`);
          }
        } else {
          info(`${name} already stopped (${status})`);
        }
      }
    }
  }
}

// ─── 3. Update database ───────────────────────────────────────────────────────

sep();
console.log(`${c.bold}Updating database${c.reset}`);
sep();
info(`Database: ${DATABASE_PATH}`);

if (!existsSync(DATABASE_PATH)) {
  warn('Database file not found — nothing to update');
} else {
  try {
    const db = new Database(DATABASE_PATH);

    // Mark all running/starting/error containers as stopped
    const result = db.prepare(`
      UPDATE user_containers
      SET status = 'stopped',
          stopped_at = datetime('now')
      WHERE status IN ('running', 'starting', 'error', 'creating')
    `).run();

    if (result.changes > 0) {
      ok(`Marked ${result.changes} container(s) as stopped`);
    } else {
      info('All containers already marked as stopped in DB');
    }

    // Report final state
    const rows = db.prepare(
      `SELECT u.username, c.container_name, c.status, c.internal_port
       FROM user_containers c
       JOIN users u ON u.id = c.user_id
       ORDER BY u.username`
    ).all();

    if (rows.length > 0) {
      sep();
      console.log(`${c.bold}Container state after stop:${c.reset}`);
      for (const r of rows) {
        console.log(`  ${c.grey}${r.username.padEnd(16)}${c.reset} ${r.container_name.padEnd(28)} ${c.yellow}${r.status}${c.reset}  port ${r.internal_port}`);
      }
    }

    db.close();
  } catch (err) {
    fail(`Database update failed: ${err.message}`);
    process.exit(1);
  }
}

sep();
ok('Done — run `npm run dev` (or `npm start`) to restart cleanly');
sep();
