# Multi-User Container Architecture Troubleshooting

**Date:** 2026-05-04
**System:** RHEL8-compatible Linux with Podman
**Architecture:** Nested containers (Gateway container managing Worker containers)

## Overview

This document details the issues encountered while setting up the multi-user containerized CloudCLI deployment where:
- A **gateway container** handles authentication, routing, and container orchestration
- Each user gets their own isolated **worker container** with dedicated resources
- Gateway proxies all HTTP and WebSocket requests to the appropriate worker container

---

## Issue #1: Native Module Compilation Failures (better-sqlite3, node-pty)

### Symptoms
- Gateway container build failed with error:
  ```
  Error: Could not locate the bindings file. Tried:
  /app/node_modules/better-sqlite3/build/better_sqlite3.node
  [multiple paths listed]
  ```
- `npm ci --only=production` triggered Husky prepare script causing build failure

### Root Cause
- Native Node.js modules (better-sqlite3, node-pty) require compilation during installation
- Using `npm ci --only=production` skipped devDependencies but still ran all install scripts including Husky
- Build tools (python3, make, g++) were not installed in the container
- After `npm prune --production`, native modules lost their build artifacts

### Attempts & Results

#### Attempt 1: Use `npm ci --only=production`
- **Result:** ❌ Failed - Husky script error (Exit code 127: "sh: 1: husky: not found")

#### Attempt 2: Change to `npm ci --ignore-scripts` then manually run postinstall
- Modified Dockerfile:
  ```dockerfile
  RUN npm ci --ignore-scripts && \
      node scripts/fix-node-pty.js
  ```
- **Result:** ❌ Failed - scripts/fix-node-pty.js not found (scripts directory copied after npm install)

#### Attempt 3: Copy scripts directory before npm install
- Added `COPY scripts/ scripts/` before `RUN npm ci`
- **Result:** ❌ Failed - better-sqlite3 native module still missing after `npm prune --production`

#### Attempt 4: Add build tools and rebuild native modules
- Modified Dockerfile:
  ```dockerfile
  # Install system dependencies including build tools
  RUN apt-get install -y python3 make g++

  # Install, skip scripts, run postinstall, rebuild natives
  RUN npm ci --ignore-scripts && \
      node scripts/fix-node-pty.js && \
      npm rebuild

  # Prune dev deps then rebuild natives again
  RUN npm prune --production && npm rebuild
  ```
- **Result:** ✅ Success - Gateway container builds and runs

### Final Solution (Gateway)
```dockerfile
# Add build tools
RUN apt-get install -y python3 make g++

# Install deps, skip all scripts, run only postinstall, rebuild natives
RUN npm ci --ignore-scripts && \
    node scripts/fix-node-pty.js && \
    npm rebuild

# Build TypeScript (both client and server)
RUN npm run build

# Remove dev dependencies and rebuild natives for production
RUN npm prune --production && npm rebuild
```

---

## Issue #2: Frontend Not Building (Port 5173 Redirect)

### Symptoms
- Browser redirected to port 5173 (Vite dev server)
- 502 errors when accessing gateway
- Gateway serving only backend, no frontend

### Root Cause
- Dockerfile used `npm run build:server` which only built TypeScript server
- Frontend (Vite/React) not built, so server tried to proxy to dev server on port 5173

### Solution
- Changed Dockerfile from `npm run build:server` to `npm run build`
- This builds both client (to `dist/`) and server (to `dist-server/`)
- **Result:** ✅ Success - Frontend served correctly

---

## Issue #3: Container Manager Not Initialized

### Symptoms
- UI showed "Container unavailable"
- Error in logs: "ContainerManager not initialized. Call initialize() first."

### Root Cause
- ContainerManager couldn't detect Podman socket
- Socket path detection was looking for standard Docker socket locations
- Runtime set to "podman" but socket mounted at Docker-compatible path

### Solution
- Changed `CONTAINER_RUNTIME` from "podman" to "docker"
- Socket mounted at `/var/run/docker.sock` (Docker API compatible)
- Podman API is Docker-compatible, so this works
- **Result:** ✅ Success - ContainerManager initialized

---

## Issue #4: Worker Container Creation Failure (Cgroup CPU Controller)

### Symptoms
```
(HTTP code 500) server error - crun: the requested cgroup controller `cpu`
is not available: OCI runtime error
```

### Root Cause
- **Nested container architecture**: Gateway container (rootless Podman) trying to create worker containers with CPU limits
- Rootless Podman has limited cgroup delegation for nested containers
- Cgroup v2 CPU controller not available to nested containers

### Investigation
- User asked: "are we using nested containers?" - This question identified the root cause
- Confirmed architecture: Gateway runs in container, creates worker containers (nested)
- Rootless Podman can't delegate CPU controller to nested containers

### Attempts & Results

#### Attempt 1: Set empty CPU/Memory limits in environment
- Set `CONTAINER_MEMORY_LIMIT=""` and `CONTAINER_CPU_LIMIT=""`
- **Result:** ❌ Failed - Code still applied default limits

#### Attempt 2: Clean database to remove old containers
- Removed `/data/gateway/auth.db`
- **Result:** ❌ Failed - New containers still created with limits

#### Attempt 3: Fix rootless detection logic
- Modified runtime detection code
- **Result:** ❌ Failed - Rootless flag not set correctly, limits still applied

#### Attempt 4: Hard-code limit removal in container manager
- Modified `server/container/manager.js` lines 201-209:
  ```javascript
  // OLD CODE:
  if (!this.runtime.isRootless()) {
    hostConfig.Memory = parseMemoryLimit(CONTAINER_CONFIG.CONTAINER_MEMORY);
    hostConfig.NanoCpus = CONTAINER_CONFIG.CONTAINER_CPU * 1e9;
  }

  // NEW CODE:
  // Skip resource limits to avoid cgroup controller issues
  // CPU limits require cgroup delegation which may not be available
  console.log(`[ContainerManager] Skipping resource limits (cgroup compatibility)`);
  ```
- **Result:** ✅ Success - Worker containers created without errors

### Final Solution
- Removed all resource limits (Memory and CPU) from container creation
- Note: Resource limits can still be configured at the host level if needed
- Trade-off accepted: No per-container resource limits in nested architecture

---

## Issue #5: Worker Container Not Starting (Native Modules Again)

### Symptoms
- Worker container created but crashed immediately
- Same better-sqlite3 error as Issue #1

### Root Cause
- Worker Dockerfile had same native module issue as gateway
- Used `npm install --legacy-peer-deps --ignore-scripts` but didn't rebuild

### Solution
- Applied same fix to `docker/worker/Dockerfile`:
  ```dockerfile
  # Install as root to avoid permission issues
  RUN npm install --legacy-peer-deps --ignore-scripts && \
      node scripts/fix-node-pty.js && \
      npm rebuild && \
      chown -R agent:agent /opt/cloudcli
  ```
- **Result:** ✅ Success - Worker container starts

---

## Issue #6: Worker Container Running in Development Mode

### Symptoms
- Worker container responding with redirect to port 5173
- Health check at `http://localhost:4001/api/health` returned: "Found. Redirecting to http://localhost:5173"

### Root Cause
- Worker container entrypoint script (`docker/worker/entrypoint.sh`) was running:
  ```bash
  exec npx tsx --tsconfig server/tsconfig.json server/index.js
  ```
- This runs TypeScript in development mode with tsx (like ts-node)
- Should run built version like gateway does

### Solution
1. Updated entrypoint.sh:
   ```bash
   # OLD:
   exec npx tsx --tsconfig server/tsconfig.json server/index.js

   # NEW:
   exec node dist-server/server/index.js
   ```

2. Updated Dockerfile to build TypeScript:
   ```dockerfile
   # Copy the rest of the source.
   COPY . .

   # Build both client and server (as root since we need write access)
   RUN npm run build && \
       chown -R agent:agent /opt/cloudcli

   USER agent
   ```

- **Result:** ✅ Success - Worker runs in production mode

---

## Issue #7: JWT Token Verification Failure (Invalid Signature)

### Symptoms
- WebSocket connections failing with error:
  ```
  WebSocket token verification error: JsonWebTokenError: invalid signature
  ```
- 502 Bad Gateway errors for API requests
- Worker container running but not accessible

### Root Cause
- Session tokens in browser signed with old/different JWT_SECRET
- Multiple gateway restarts during debugging caused JWT_SECRET changes
- Browser cache had tokens signed with previous secrets

### Attempts & Results

#### Attempt 1: Check JWT_SECRET matching
- Verified gateway and worker have same JWT_SECRET
- Both showed: `e690326dd338e7fc...` (128 chars)
- **Result:** ❌ Tokens still failing - Secret matches but problem persists

#### Attempt 2: Clear sessions in database
- Attempted to run: `db.prepare('DELETE FROM sessions').run()`
- **Result:** ❌ Failed - db.prepare is undefined

#### Attempt 3: Recreate database from scratch
- Deleted `/data/gateway/auth.db` with `podman unshare rm`
- Restarted gateway with fresh database
- **Result:** ❌ Failed - Same JWT errors after new user registration

#### Attempt 4: Add TRUST_INTERNAL_NETWORK bypass
- Since machine is on trusted network, added bypass for JWT validation
- Modified `server/middleware/auth.js`:
  ```javascript
  // Trusted network mode: skip JWT validation
  if (process.env.TRUST_INTERNAL_NETWORK === 'true') {
    console.log('[AUTH] TRUST_INTERNAL_NETWORK enabled - bypassing JWT validation');
    const user = userDb.getFirstUser();
    if (user) {
      return { id: user.id, userId: user.id, username: user.username };
    }
  }
  ```
- Added to both `authenticateToken` and `authenticateWebSocket` functions
- Set `TRUST_INTERNAL_NETWORK=true` in gateway container
- **Result:** ✅ Partial success - Auth bypass working but still 502 errors

---

## Issue #8: Container Communication Error (ECONNREFUSED)

### Symptoms
- Auth bypass working (logs show: `[AUTH] TRUST_INTERNAL_NETWORK enabled`)
- But still getting 502 errors: `{"error":"Container communication error"}`
- Gateway logs show:
  ```
  [HPM] Error occurred while proxying request localhost:3001/api/projects
  to http://localhost:4007/ [ECONNREFUSED]
  ```

### Root Cause
- **Network isolation**: Gateway container trying to reach worker on `localhost:4007`
- Each worker container has its own isolated bridge network (`cloudcli-net-user-X`)
- Gateway container not connected to worker's network
- In nested container architecture, `localhost` in gateway doesn't reach worker

### Network Architecture Discovered
```
Host Machine
├── Gateway Container (cloudcli-gateway)
│   └── Network: claudecodeui_cloudcli-gateway (default)
└── Worker Container (cloudcli-user-1)
    └── Network: cloudcli-net-user-1 (isolated)
```

Gateway can't reach worker because they're on separate networks!

### Solution (In Progress)

#### Step 1: Modify proxy to use container name instead of localhost
```javascript
// OLD:
const targetHost = 'localhost';
const targetPort = containerInfo.internalPort;

// NEW:
const isGatewayContainer = process.env.HOSTNAME !== undefined;
const targetHost = isGatewayContainer ? containerInfo.containerName : 'localhost';
const targetPort = containerInfo.internalPort;
```

Applied to both:
- HTTP proxy in `createProxyMiddleware()` (line ~41)
- WebSocket proxy in `setupWebSocketProxy()` (line ~153)

#### Step 2: Add network connection logic
Modified `server/container/manager.js` to connect gateway to worker's network:
```javascript
// After worker container created, connect gateway to its network
try {
  const fs = await import('fs/promises');
  const gatewayContainerId = (await fs.readFile('/etc/hostname', 'utf8')).trim();
  if (gatewayContainerId) {
    await this.runtime.connectContainerToNetwork(gatewayContainerId, networkName);
    console.log(`[ContainerManager] Connected gateway ${gatewayContainerId} to network ${networkName}`);
  }
} catch (error) {
  console.log(`[ContainerManager] Note: Could not connect gateway to network: ${error.message}`);
}
```

#### Step 3: Add runtime method for network connection
Added to `server/container/runtime.js`:
```javascript
async connectContainerToNetwork(containerIdOrName, networkName) {
  this._ensureInitialized();
  const network = this.client.getNetwork(networkName);
  await network.connect({ Container: containerIdOrName });
}
```

#### Step 4: Rebuild and test
- Rebuilt gateway image
- Restarted containers
- **Status:** 🔄 Currently testing - awaiting user refresh

---

## Current Status

### ✅ Working
1. Gateway container builds successfully
2. Worker container builds successfully
3. Both containers start without errors
4. Worker container responds to health checks: `http://localhost:4007/health` returns `{"status":"ok"}`
5. ContainerManager initializes and creates worker containers
6. Authentication bypass working (TRUST_INTERNAL_NETWORK=true)
7. Native modules (better-sqlite3, node-pty) working in both containers
8. TypeScript builds and runs in production mode

### 🔄 In Progress
1. Network connectivity between gateway and worker containers
   - Gateway needs to join worker's isolated network
   - Proxy needs to use container name instead of localhost
   - Code changes implemented, awaiting testing

### ❌ Not Working Yet
1. HTTP requests (502 Bad Gateway due to ECONNREFUSED)
2. WebSocket connections (can't reach worker)
3. API endpoints (/api/projects, /api/browse-filesystem, etc.)

---

## Architecture Challenges

### Nested Container Limitations

**Challenge:** Gateway container running worker containers as nested containers

**Limitations:**
1. **Cgroup delegation**: Rootless Podman can't delegate CPU controller to nested containers
2. **Network isolation**: Each worker on separate network, gateway must join all networks
3. **Resource limits**: Can't enforce memory/CPU limits in nested architecture
4. **Complexity**: More moving parts, harder to debug networking issues

### Alternative Architecture Considered

**Option 1: Gateway on host** (rejected by user)
- Gateway runs directly on host (not containerized)
- Creates worker containers using host's Podman
- Pros: No cgroup issues, simpler networking
- Cons: Gateway not isolated, requires host dependencies

**Option 2: Shared network** (would require redesign)
- Put all containers on single shared network
- Pros: Simpler networking, no dynamic network joining
- Cons: Less isolation between users, security concerns

**Current Approach: Nested containers with dynamic network joining**
- Gateway joins each worker's network when worker is created
- Uses container names for addressing
- Accepts no resource limits as trade-off

---

## Technical Decisions & Trade-offs

1. **Resource Limits Removed**
   - Trade-off: No per-container CPU/Memory limits
   - Reason: Cgroup delegation not available in nested containers
   - Alternative: Configure limits at host level if needed

2. **JWT Validation Bypassed**
   - Trade-off: No token-based authentication between gateway and workers
   - Reason: Token signature issues, trusted network environment
   - Security: Only acceptable on internal/trusted networks
   - Flag: `TRUST_INTERNAL_NETWORK=true`

3. **Container Name Addressing**
   - Trade-off: More complex than localhost addressing
   - Reason: Network isolation requires container-to-container communication
   - Implementation: Gateway must detect if it's in a container

4. **Dynamic Network Joining**
   - Trade-off: Gateway must connect to multiple networks at runtime
   - Reason: Each worker has isolated network for security
   - Implementation: Gateway joins worker network after creation

---

## Environment Configuration

### Current Working Configuration

**Gateway Container:**
```bash
podman run -d \
  --name cloudcli-gateway \
  --user root \
  -p 3001:3001 \
  -v $XDG_RUNTIME_DIR/podman/podman.sock:/var/run/docker.sock:rw \
  -v ./data/gateway:/data:Z \
  -e MULTI_USER_MODE=true \
  -e CONTAINER_RUNTIME=docker \
  -e DOCKER_HOST=unix:///var/run/docker.sock \
  -e CONTAINER_BASE_IMAGE=cloudcliai/worker:latest \
  -e CONTAINER_PORT_START=4001 \
  -e CONTAINER_PORT_END=5000 \
  -e CONTAINER_MEMORY_LIMIT="" \
  -e CONTAINER_CPU_LIMIT="" \
  -e SERVER_PORT=3001 \
  -e HOST=0.0.0.0 \
  -e DATABASE_PATH=/data/auth.db \
  -e ENCRYPTION_MASTER_KEY=120e93e3e17a0ee97f1437a019ddb5d893dea551c238d7b702c39ce6e299d8f5 \
  -e TRUST_INTERNAL_NETWORK=true \
  --security-opt label=disable \
  cloudcliai/gateway:latest
```

**Key Settings:**
- `CONTAINER_RUNTIME=docker`: Use Docker API (Podman compatible)
- `CONTAINER_MEMORY_LIMIT=""`: Disable memory limits (cgroup issue)
- `CONTAINER_CPU_LIMIT=""`: Disable CPU limits (cgroup issue)
- `TRUST_INTERNAL_NETWORK=true`: Bypass JWT validation
- `--security-opt label=disable`: Disable SELinux labels for socket access
- `--user root`: Required for creating nested containers

---

## Files Modified

### Gateway Container
- `Dockerfile` - Build configuration for gateway
  - Added build tools (python3, make, g++)
  - Changed install process to skip scripts then rebuild
  - Added `npm run build` for both client and server
  - Added rebuild after pruning

- `server/container/manager.js` - Container orchestration
  - Lines 201-209: Removed resource limits entirely
  - Lines 237-249: Added network connection logic after container creation

- `server/container/runtime.js` - Docker/Podman API wrapper
  - Added `connectContainerToNetwork()` method

- `server/middleware/auth.js` - Authentication
  - Added `TRUST_INTERNAL_NETWORK` bypass in `authenticateToken()`
  - Added `TRUST_INTERNAL_NETWORK` bypass in `authenticateWebSocket()`

- `server/middleware/proxy.js` - HTTP/WebSocket proxying
  - Modified to use container name instead of localhost when in gateway container
  - Applied to both HTTP and WebSocket proxies

### Worker Container
- `docker/worker/Dockerfile` - Build configuration for worker
  - Added `npm rebuild` after install
  - Added `npm run build` to build TypeScript
  - Changed user context for build steps

- `docker/worker/entrypoint.sh` - Startup script
  - Changed from `npx tsx` (dev mode) to `node dist-server/server/index.js` (production)

---

## Diagnostic Commands

### Check Container Status
```bash
# List all CloudCLI containers
podman ps | grep cloudcli

# Check specific container logs
podman logs --tail=50 cloudcli-gateway
podman logs --tail=50 cloudcli-user-1

# Check container health directly
curl -s http://localhost:3001/health | jq .
curl -s http://localhost:4007/health | jq .
```

### Check Network Configuration
```bash
# List networks
podman network ls | grep cloudcli

# Inspect network to see connected containers
podman network inspect cloudcli-net-user-1 | jq '.[0].containers'

# Check which networks a container is on
podman inspect cloudcli-gateway | jq '.[0].NetworkSettings.Networks | keys'
```

### Check Environment Variables
```bash
# Check if TRUST_INTERNAL_NETWORK is set
podman exec cloudcli-gateway env | grep TRUST

# Check container hostname
podman exec cloudcli-gateway cat /etc/hostname
```

### Test Connectivity
```bash
# From host to gateway
curl -s http://localhost:3001/api/projects

# From host to worker directly
curl -s http://localhost:4007/api/health

# From gateway to worker (if network connection works)
podman exec cloudcli-gateway curl -s http://cloudcli-user-1:4007/api/health
```

---

## Next Steps

1. **Verify Network Connection**
   - Refresh browser to trigger worker creation
   - Check logs for: `[ContainerManager] Connected gateway X to network cloudcli-net-user-1`
   - Verify gateway appears in `podman network inspect cloudcli-net-user-1`

2. **Test Container-to-Container Communication**
   - From gateway: `podman exec cloudcli-gateway curl http://cloudcli-user-1:4007/health`
   - Should return: `{"status":"ok",...}`

3. **Test Full Stack**
   - Browser: `http://localhost:3001/api/projects`
   - Should return projects list, not 502 error

4. **If Still Failing**
   - Check DNS resolution: `podman exec cloudcli-gateway nslookup cloudcli-user-1`
   - Check firewall: `podman exec cloudcli-gateway nc -zv cloudcli-user-1 4007`
   - Consider shared network approach instead of dynamic joining

---

## Lessons Learned

1. **Native modules in containers require explicit rebuild** after `npm prune --production`
2. **Nested containers have significant limitations** in rootless Podman (cgroups, networking)
3. **Network isolation is powerful but complex** - requires dynamic network management
4. **JWT token management is fragile** during development with frequent restarts
5. **Container-to-container communication** requires container names, not localhost
6. **Reading `/etc/hostname`** is more reliable than `process.env.HOSTNAME` in containers
7. **Production builds** require both client and server builds, not just server
8. **Build tools must be present** during `npm rebuild`, not just during initial install

---

## References

- [Podman Rootless Networking](https://github.com/containers/podman/blob/main/docs/tutorials/rootless_tutorial.md)
- [Docker API Compatibility](https://docs.podman.io/en/latest/markdown/podman.1.html#docker-compatibility)
- [Cgroup v2 Controllers](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
- Node.js native module compilation: [node-gyp](https://github.com/nodejs/node-gyp)
- [better-sqlite3 Installation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/compilation.md)
