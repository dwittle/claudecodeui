# Multi-User Architecture — Implementation Plan

> **Self-contained.** Read this file cold. No prior conversation context required.

**Repository:** `claudecodeui` (a fork of `@cloudcli-ai/cloudcli`)
**Branch:** `feature/multi-user-container-architecture`
**Plan written against commit:** `05de8e2afa05f0151669afa2ab319844fabb412b`
**Deployment target:** Linux + Podman or Docker (no other targets in scope)

If the codebase has moved on since the pinned commit, run `git diff 05de8e2 -- server/middleware/auth.js server/middleware/proxy.js server/container/manager.js server/container/config.js docker/worker/` to see what's changed and adjust accordingly.

---

## 0. TL;DR

We want a single web frontend where each authenticated user gets their own isolated Claude Code instance running in a per-user Podman/Docker container. The current branch has a partially working implementation that fails at auth because the worker containers run a different copy of the code (the published npm package) than the gateway (this repo's source). The fix is to make the worker run *this* repo's code via `tsx`, then enable the existing-but-currently-dead "worker trust" auth branch.

Six phases below. Each is independently verifiable and committable.

---

## 1. Architecture (target state)

```
Browser ──JWT──> Gateway (this repo, port 3333)
                   1. authenticateToken — validates JWT, looks up user in gateway DB
                   2. ensureRunning(userId) — start container if needed
                   3. proxy with X-CloudCLI-User-ID header
                   ▼
                Worker container (this repo, port 4001+)
                   auth.js sees process.env.USER_ID + X-CloudCLI-User-ID header
                   → trusts gateway, sets req.user, skips DB lookup
                   ▼
                Claude Code session (per user, isolated volume)
```

**Single-codebase design.** Gateway and worker run the same Node code. Mode is determined at runtime: `process.env.USER_ID` is set only on workers (in `server/container/manager.js` envVars). Auth middleware branches on that.

**Per-user persistence.** Each user gets a Podman/Docker volume `cloudcli-data-user-{id}` mounted at `/home/agent` in their worker. State (sessions, settings, project list) survives container restarts.

**Trust model.** Gateway-set header is trusted on faith. This is acceptable because the deployment target is a trusted single-tenant server. Hardening (signed headers, network policy enforcement) is post-MVP and out of scope here.

---

## 2. Why the current state doesn't work

The repo's `package.json` declares `"name": "@cloudcli-ai/cloudcli"` — i.e., **this repo IS the upstream package**, forked. But `docker/worker/Dockerfile.simple` does:

```dockerfile
RUN npm install -g @cloudcli-ai/cloudcli
```

That installs the *public upstream* copy. Result: the worker container runs different code than the gateway. Source edits in this repo to `server/middleware/auth.js` never reach the running worker — Node loads the npm-installed compiled artifact under `/usr/local/lib/node_modules/@cloudcli-ai/cloudcli/dist-server/...` instead.

The workaround attempted before (`IS_PLATFORM=true` env var) is wrong on two counts: (a) `server/constants/config.js` reads `VITE_IS_PLATFORM`, not `IS_PLATFORM`, so the local code path doesn't trigger; (b) even if it did trigger, platform mode returns `userDb.getFirstUser()` for any request, which is a security bypass — fine in trusted env but not actual auth.

Phase 1 dissolves the entire problem by building the worker from this repo's source.

---

## 3. Phases

Each phase below contains: goal, files touched, exact changes (with code), verification commands, and rollback notes. Phases are sequential — finish and commit one before starting the next.

### Phase 1 — Build the worker from this repo

**Goal:** A worker image whose code IS this repo. Runs in dev mode via `tsx`.

**Files:**
- `docker/worker/Dockerfile` — rewrite
- `docker/worker/Dockerfile.simple` — delete
- `docker/worker/Dockerfile.local` — delete
- `server/container/config.js` — change default image

**Dockerfile rewrite (target contents):**

The base image is `docker/sandbox-templates:claude-code` (Docker's published Claude Code sandbox template). It already includes Node, the `agent` user, and the `claude` CLI that the UI shells out to. We add build toolchain for native modules and copy the repo source.

```dockerfile
FROM docker/sandbox-templates:claude-code

USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3 python3-setuptools \
      curl git sudo jq ripgrep sqlite3 zip unzip tree vim-tiny \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/cloudcli && chown -R agent:agent /opt/cloudcli

USER agent
WORKDIR /opt/cloudcli

COPY --chown=agent:agent package.json package-lock.json ./
COPY --chown=agent:agent scripts/ scripts/
RUN npm install --legacy-peer-deps

COPY --chown=agent:agent . .

WORKDIR /home/agent
RUN mkdir -p /home/agent/workspace

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${SERVER_PORT:-4001}/api/health || exit 1

CMD ["sh", "-c", "cd /opt/cloudcli && npx tsx --tsconfig server/tsconfig.json server/index.js"]
```

**Build context must be the repo root** (so `COPY package.json` etc. resolve):
```bash
podman build -t claudecodeui/worker:dev -f docker/worker/Dockerfile .
```

**Config change (`server/container/config.js` line 14):**

```js
BASE_IMAGE: process.env.CONTAINER_BASE_IMAGE || 'claudecodeui/worker:dev',
```

**Verification:**
```bash
# Start a throwaway container and hit the health endpoint
podman run --rm -d --name worker-smoke -p 4099:4099 \
  -e SERVER_PORT=4099 -e USER_ID=999 -e JWT_SECRET=test-secret \
  claudecodeui/worker:dev
sleep 20  # tsx + first-time module resolution is slow
curl -f http://localhost:4099/api/health
podman rm -f worker-smoke
```

Expected: `{"status":"healthy",...}` or similar 2xx response.

**Risks / watch-outs:**
- `node-pty` and `better-sqlite3` need build toolchain — included above.
- The `postinstall` script (`scripts/fix-node-pty.js`) runs during `npm install`.
- `tsx` is in `devDependencies`; `npm install` (no `--production`) keeps it.
- The worker only needs the API; it doesn't serve the Vite frontend (gateway does). If `tsx server/index.js` tries to bundle the frontend on startup, fall back to running a prebuilt `dist-server/server/index.js` and check `package.json` `prebuild:server`/`build:server` scripts.
- The base image `docker/sandbox-templates:claude-code` is Docker Inc's published agent sandbox template; pull it ahead of build if behind a restricted registry.

**Commit message:** `feat(worker): build worker image from local repo via tsx`

---

### Phase 2 — Remove the IS_PLATFORM bypass and source-mount hacks

**Goal:** Now that the worker IS this code, the existing "worker trust" branch in `auth.js` lines 39–52 will execute. Remove the dead workarounds.

**File:** `server/container/manager.js`

**Current state (in `createUserContainer`, around lines 149–179):**
```js
const envVars = [
  `SERVER_PORT=${port}`,
  `USER_ID=${userId}`,
  `AGENT_TYPE=${agentType}`,
  `JWT_SECRET=${jwtSecret}`,
  `IS_PLATFORM=true`,  // ← DELETE this line
];
// ...
const hostConfig = {
  NetworkMode: networkName,
  Binds: [
    `${volumeName}:/home/agent`,
    // ↓ DELETE these two lines ↓
    `${APP_ROOT}/server/middleware/auth.js:/usr/local/lib/node_modules/@cloudcli-ai/cloudcli/server/middleware/auth.js:ro`,
    `${APP_ROOT}/server/middleware/auth.js:/usr/local/lib/node_modules/@cloudcli-ai/cloudcli/dist-server/server/middleware/auth.js:ro`
  ],
  // ...
};
```

**Target:**
```js
const envVars = [
  `SERVER_PORT=${port}`,
  `USER_ID=${userId}`,
  `AGENT_TYPE=${agentType}`,
  `JWT_SECRET=${jwtSecret}`,
];
// ...
const hostConfig = {
  NetworkMode: networkName,
  Binds: [
    `${volumeName}:/home/agent`,
  ],
  // ...
};
```

**Verification:**

After Phase 3 (DB seeding), end-to-end smoke from the gateway:
```bash
TOKEN=$(node -e "const jwt=require('jsonwebtoken'); const Database=require('better-sqlite3'); \
  const db=new Database(process.env.HOME+'/.cloudcli/auth.db'); \
  const secret=db.prepare(\"SELECT value FROM app_config WHERE key='jwt_secret'\").get().value; \
  console.log(jwt.sign({userId:1}, secret, {expiresIn:'1h'}));")
curl -H "Authorization: Bearer $TOKEN" http://localhost:3333/api/projects
```

Expected: JSON array. **Not** `{"error":"Invalid token. User not found."}`.

**Commit message:** `refactor(container): drop IS_PLATFORM bypass and dead source mounts`

---

### Phase 3 — Seed the user row in the worker's DB

**Goal:** Even though `auth.js` worker-trust mode populates `req.user` from the header without a DB lookup, downstream handlers (project listing, sessions, settings) likely query the local `users` table by id. We seed one row matching the gateway's user.

**Schema reference** (`server/database/schema.js` lines 45–55):
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_active BOOLEAN DEFAULT 1,
  git_name TEXT,
  git_email TEXT,
  has_completed_onboarding BOOLEAN DEFAULT 0
);
```

**File:** `server/container/manager.js`

**Add a method to `ContainerManager` class:**

```js
/**
 * Seed the gateway user record into the worker's local DB so handlers
 * that look up the user by id succeed. Idempotent.
 * @private
 */
async seedWorkerUser(containerId, userId) {
  const { userDb } = await import('../database/db.js');
  const user = userDb.getUserById(userId);
  if (!user) {
    throw new Error(`Cannot seed worker: user ${userId} not in gateway DB`);
  }

  // Wait for the worker to create the auth.db file (happens on first server boot)
  // The DB is at /home/agent/.cloudcli/auth.db inside the container.
  const dbPath = '/home/agent/.cloudcli/auth.db';
  const script = `
    const Database = require('better-sqlite3');
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(path.dirname('${dbPath}'), { recursive: true });
    const db = new Database('${dbPath}');
    db.exec(\`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        is_active BOOLEAN DEFAULT 1,
        git_name TEXT,
        git_email TEXT,
        has_completed_onboarding BOOLEAN DEFAULT 0
      );
    \`);
    db.prepare('INSERT OR IGNORE INTO users (id, username, password_hash, is_active) VALUES (?, ?, ?, 1)')
      .run(${userId}, ${JSON.stringify(user.username)}, '');
    console.log('User seeded:', ${userId});
  `;

  const container = this.runtime.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ['node', '-e', script],
    AttachStdout: true,
    AttachStderr: true,
    User: 'agent',
    WorkingDir: '/opt/cloudcli', // so node can resolve better-sqlite3
  });
  await exec.start({ hijack: true, stdin: false });
  console.log(`[ContainerManager] Seeded user ${userId} into worker DB`);
}
```

**Call it after the container is healthy.** Best place: in `startUserContainer`, after `await this.waitForHealthy(...)`:

```js
await this.waitForHealthy(container, CONTAINER_CONFIG.STARTUP_TIMEOUT);

// Seed user record (idempotent)
try {
  await this.seedWorkerUser(containerInfo.container_id, userId);
} catch (err) {
  console.error(`[ContainerManager] User seed failed for ${userId}:`, err.message);
  // Don't fail startup — first request may still succeed via header-trust auth
}
```

**Verification:**
```bash
podman exec cloudcli-user-1 sqlite3 /home/agent/.cloudcli/auth.db "SELECT id, username FROM users;"
# Expected: row with the gateway user's id and username
```

**Risks / watch-outs:**
- The worker may not have created `auth.db` yet on the *very* first start. The seed creates the file and the table itself — safe.
- `better-sqlite3` is bundled with the worker code (in `/opt/cloudcli/node_modules`), so `WorkingDir: '/opt/cloudcli'` lets `require('better-sqlite3')` resolve.

**Commit message:** `feat(container): seed gateway user row into worker DB on start`

---

### Phase 4 — Header-trust for WebSocket auth

**Goal:** WebSocket connections through the gateway also need to bypass the worker's JWT/user-DB check.

**Current state:** `authenticateWebSocket(token)` in `server/middleware/auth.js` lines 107–139 takes only `token` and looks up the user in the local DB. Call sites in `server/index.js` lines 228 and 245 pass only token.

**File:** `server/middleware/auth.js`

**Change the function to accept the request (or headers):**

```js
const authenticateWebSocket = (token, req) => {
  // Worker container mode: trust gateway header
  const gatewayUserId = req?.headers?.['x-cloudcli-user-id'];
  const isWorker = process.env.USER_ID !== undefined;
  if (isWorker && gatewayUserId) {
    const id = parseInt(gatewayUserId, 10);
    return { id, userId: id, username: `user-${id}` };
  }

  // Platform mode: bypass token validation, return first user
  if (IS_PLATFORM) {
    try {
      const user = userDb.getFirstUser();
      if (user) return { id: user.id, userId: user.id, username: user.username };
      return null;
    } catch (error) {
      console.error('Platform mode WebSocket error:', error);
      return null;
    }
  }

  // Normal OSS JWT validation
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = userDb.getUserById(decoded.userId);
    if (!user) return null;
    return { userId: user.id, username: user.username };
  } catch (error) {
    console.error('WebSocket token verification error:', error);
    return null;
  }
};
```

**File:** `server/index.js`

Update both call sites (lines 228 and 245) to pass `info.req`:

```js
// Line 228 (platform mode branch — req available as info.req)
const user = authenticateWebSocket(null, info.req);

// Line 245 (normal branch)
const user = authenticateWebSocket(token, info.req);
```

**Verification:**
- Open the web UI, navigate to a project, open the terminal panel.
- Browser DevTools → Network → WS — connection should succeed (101 Switching Protocols), not 401.
- Worker container logs (`podman logs cloudcli-user-1`) should not show WebSocket auth failures.

**Commit message:** `feat(auth): trust gateway header for WebSocket auth in worker mode`

---

### Phase 5 — End-to-end verification

**Goal:** Confirm the full flow works in a clean environment.

**Reset to clean state:**
```bash
# Stop gateway dev server (find your process)
pkill -f "npm run dev" || true
pkill -f "tsx.*server/index.js" || true

# Remove all managed containers
podman rm -f $(podman ps -aq --filter "label=cloudcli.managed=true") 2>/dev/null || true

# Clear container tracking from gateway DB
sqlite3 ~/.cloudcli/auth.db "DELETE FROM user_containers; DELETE FROM container_ports;"

# Optional: also remove volumes if you want a true cold start
# podman volume rm $(podman volume ls -q --filter "label=cloudcli.managed=true") 2>/dev/null || true
```

**Build and start:**
```bash
podman build -t claudecodeui/worker:dev -f docker/worker/Dockerfile .

# Make sure .env has MULTI_USER_MODE=true
grep MULTI_USER_MODE .env || echo "MULTI_USER_MODE=true" >> .env

npm run dev
```

**Smoke test in browser:**
1. Open `http://localhost:5173`.
2. Log in.
3. Wait ~30s for first container start (tsx cold start).
4. Sidebar should populate with projects (no blank page).
5. Open a project, start a Claude session, send a message.
6. Open DevTools → Console — no 401s, no `projects.map is not a function`.

**Smoke test from CLI:**
```bash
TOKEN=$(node -e "const jwt=require('jsonwebtoken'); const Database=require('better-sqlite3'); \
  const db=new Database(process.env.HOME+'/.cloudcli/auth.db'); \
  const secret=db.prepare(\"SELECT value FROM app_config WHERE key='jwt_secret'\").get().value; \
  const u=db.prepare('SELECT id FROM users LIMIT 1').get(); \
  console.log(jwt.sign({userId:u.id}, secret, {expiresIn:'1h'}));")

# Should return JSON, not an error
curl -H "Authorization: Bearer $TOKEN" http://localhost:3333/api/projects | head -c 200

# Container should be running
podman ps --filter "label=cloudcli.managed=true"

# User should be seeded
podman exec cloudcli-user-1 sqlite3 /home/agent/.cloudcli/auth.db \
  "SELECT id, username FROM users;"
```

**Commit message:** `chore: verify multi-user end-to-end flow`

---

### Phase 6 — Cleanup

**Files to delete (all in repo root, prior LLM session leftovers):**
- `FINAL_STATUS.md`
- `FOR_NEXT_LLM.md`
- `HANDOFF.md`
- `MULTI_USER_COMPLETE.md`
- `MULTI_USER_DIAGNOSTIC.md`
- `MULTI_USER_FIX_SUMMARY.md`
- `MULTI_USER_TEST_RESULTS.md`
- `README_MULTIUSER.md`
- `notes.txt`
- `logs/` (entire directory)
- `test-multiuser.js`
- `test-multi-user.sh`
- `test-multiuser-simple.sh`
- `START_MULTIUSER.sh`

**Add to `.gitignore`:**
```
logs/
*.log
notes.txt
```

This file (`docs/MULTI_USER_PLAN.md`) is the canonical doc going forward.

**Commit message:** `chore: remove obsolete handoff docs and scratch files`

---

## 4. Decisions locked in

| Question | Decision | Reason |
|---|---|---|
| Worker source | Built from this repo | This repo IS `@cloudcli-ai/cloudcli` (forked) |
| Build mode | Dev (`tsx`), not `npm run build` | Faster iteration during development |
| User data isolation | Per-user persistent volume; isolated SQLite per worker | Simpler than shared DB; survives container restart |
| Worker DB seeding | `podman exec` after container healthy | Simple; idempotent; no race conditions |
| Worker auth | Trust `X-CloudCLI-User-ID` header from gateway | Gateway already validates JWT; trusted env |
| WebSocket auth | Same header-trust mechanism | Consistency with HTTP path |
| Security hardening | Deferred (post-MVP) | Trusted single-tenant deployment |
| Frontend bundling in worker | None — gateway serves frontend | Worker is API-only |

---

## 5. Files in flight (this branch)

| File | Phase | Action |
|---|---|---|
| `docker/worker/Dockerfile` | 1 | Rewrite |
| `docker/worker/Dockerfile.simple` | 1 | Delete |
| `docker/worker/Dockerfile.local` | 1 | Delete |
| `server/container/config.js` | 1 | Update default `BASE_IMAGE` |
| `server/container/manager.js` | 2, 3 | Remove env/binds; add `seedWorkerUser` |
| `server/middleware/auth.js` | 4 | Update `authenticateWebSocket` signature |
| `server/index.js` | 4 | Pass `info.req` to `authenticateWebSocket` |
| `server/middleware/proxy.js` | none | Already correct |
| `.gitignore` | 6 | Add `logs/`, `*.log`, `notes.txt` |
| Various `*.md`, `logs/`, `test-multi*` | 6 | Delete |

---

## 6. How to resume after interruption

1. Read this file end-to-end.
2. `git log --oneline -10` — see what's been committed since plan was written.
3. `git diff 05de8e2 -- server/middleware/auth.js server/middleware/proxy.js server/container/manager.js server/container/config.js docker/worker/` — see what's changed.
4. Compare the file changes against the "Files in flight" table to identify the next pending phase.
5. If TaskList is available in the harness, run it and align task statuses with reality. Tasks may have been recreated; rely on git/files as ground truth.
6. Continue from the lowest unfinished phase.

**Recovery from a broken state:**
- If a phase commit is half-done, `git stash` and re-read this doc's exact-changes blocks for that phase.
- If the worker image is broken, `podman rmi claudecodeui/worker:dev` and rebuild from Phase 1.
- If the gateway DB is corrupted, the user table can be recreated by deleting `~/.cloudcli/auth.db` and restarting the gateway (you'll need to re-register).
- If a worker container won't start, `podman logs cloudcli-user-{id}` is the first place to look. Then `podman rm -f cloudcli-user-{id}` and `DELETE FROM user_containers WHERE user_id={id}` in the gateway DB to force recreation.

---

## 7. Out of scope (record for future)

- Signed/HMAC `X-CloudCLI-User-ID` header
- Network policy enforcement (only gateway can reach worker ports)
- Production build pipeline (`npm run build` instead of `tsx`)
- Resource limits in rootless Podman (currently disabled)
- Container idle timeout / auto-stop after N minutes
- Multi-tenant security review
- Migrating per-worker SQLite to shared gateway DB
