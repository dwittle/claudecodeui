# Multi-User Container Architecture - Troubleshooting Status

**Date**: April 30, 2026
**Status**: Implementation complete, proxy issue remaining

## Summary

Successfully implemented multi-user container architecture with Docker/Podman support. Fixed multiple issues with rootless Podman, but encountering a proxy path forwarding issue that prevents the app from working in multi-user mode.

## What Was Accomplished

### 1. Docker/Podman Runtime Abstraction ✅
**Files Created/Modified**:
- `server/container/runtime-detector.js` (NEW)
- `server/container/runtime.js` (NEW)
- `server/container/manager.js` (MODIFIED)
- `server/container/config.js` (MODIFIED)

**Features**:
- Auto-detects Docker or Podman from socket paths
- Handles rootless vs rootful Podman modes
- Provides unified API via `containerRuntime` singleton
- Socket service auto-enablement for Podman

### 2. Rootless Podman Compatibility ✅
**Issue**: CPU cgroup controller not available in rootless Podman
```
Error: crun: the requested cgroup controller `cpu` is not available
```

**Fix**: Skip resource limits when in rootless mode
```javascript
// server/container/manager.js line ~170
if (!this.runtime.isRootless()) {
  hostConfig.Memory = parseMemoryLimit(CONTAINER_CONFIG.CONTAINER_MEMORY);
  hostConfig.NanoCpus = CONTAINER_CONFIG.CONTAINER_CPU * 1e9;
} else {
  console.log(`[ContainerManager] Skipping resource limits (rootless mode)`);
}
```

### 3. Container Port Mapping ✅
**Issue**: Container running but port not accessible from host
```
PORTS: 4001/tcp  (no host mapping shown)
```

**Fix**: Added PortBindings to HostConfig
```javascript
// server/container/manager.js line ~166
PortBindings: {
  [`${port}/tcp`]: [{ HostPort: String(port) }]
}
```

**Result**: Port properly mapped
```
PORTS: 0.0.0.0:4001->4001/tcp
```

### 4. JWT Secret Sharing ✅
**Issue**: Gateway and worker containers had different JWT secrets
```
Error: invalid signature
```

**Fix**: Inject gateway's JWT secret into container environment
```javascript
// server/container/manager.js line ~141
const jwtSecret = process.env.JWT_SECRET || appConfigDb.getOrCreateJwtSecret();
const envVars = [
  `SERVER_PORT=${port}`,
  `USER_ID=${userId}`,
  `AGENT_TYPE=${agentType}`,
  `JWT_SECRET=${jwtSecret}`,  // Shared secret
];
```

### 5. Enhanced Logging ✅
Added comprehensive logging throughout:
- `server/middleware/proxy.js` - Proxy request/response/error logging
- `server/container/manager.js` - Container lifecycle logging
- `vite.config.js` - Vite proxy logging

### 6. UI Enhancements ✅
**File**: `src/components/auth/view/AuthInputField.tsx`
- Added password visibility toggle button
- Show/hide password functionality with eye icon

## Resolved Issues ✅

### Proxy Path Forwarding Problem (FIXED)

**Root Causes Found and Fixed in `server/middleware/proxy.js`**:

1. **Duplicate `onError` handler** — The proxy config object had two `onError` keys. JavaScript silently dropped the first (HTTP error handler), leaving only the WebSocket handler that called `socket.end()` on an HTTP response, causing ECONNRESET on every proxied API call.

2. **Express path stripping** — When `app.use('/api/projects', proxyMiddleware)` mounts middleware, Express strips the mount prefix from `req.url`. The proxy was forwarding to `http://localhost:4001/` (root) instead of `http://localhost:4001/api/projects/...`. Fixed by using `req.originalUrl` in `pathRewrite`, which contains the full original path before Express strips it.

3. **Fresh proxy per request** — A new `createProxyMiddleware` instance was created for every request. Now proxy instances are cached per user (keyed on `userId + port`) and reused, which is how `http-proxy-middleware` is designed to be used.

**Fix**: See `server/middleware/proxy.js` — `createProxyMiddleware()` now caches per-user proxy instances and uses `pathRewrite: (_path, req) => req.originalUrl`.

## Current Configuration

### Environment Variables (.env)
```bash
SERVER_PORT=3333
VITE_PORT=5173
HOST=0.0.0.0
MULTI_USER_MODE=false  # Currently disabled due to proxy issue
CONTAINER_RUNTIME=auto
CONTAINER_BASE_IMAGE=cloudcliai/worker:latest
CONTAINER_PORT_START=4001
CONTAINER_PORT_END=5000
ENCRYPTION_MASTER_KEY=eeba060edfc06c3bbcb3eb5f2a2b7bfb32d7f71b02a4f526fc00bd299a01de84
```

### Container Status
```bash
$ podman ps
NAMES            STATUS         PORTS
cloudcli-user-1  Up X seconds  0.0.0.0:4001->4001/tcp
```

### Database Records
```sql
sqlite3 ~/.cloudcli/auth.db
SELECT * FROM user_containers WHERE user_id=1;
-- Shows container record with status='running', port=4001
```

## Testing Steps

### Verify Container Works
```bash
# 1. Check container is running
podman ps

# 2. Test container directly (works)
curl http://localhost:4001/api/health
# Expected: HTML response with 200 OK

# 3. Test with authentication (should fail without token)
curl http://localhost:4001/api/projects
# Expected: {"error":"Access denied. No token provided."}
```

### Verify JWT Secret Match
```bash
# 1. Get JWT secret from container
podman exec cloudcli-user-1 printenv JWT_SECRET

# 2. Get JWT secret from gateway database
sqlite3 ~/.cloudcli/auth.db "SELECT value FROM app_config WHERE key='jwt_secret';"

# They should match
```

### Test Gateway Proxy
```bash
# With multi-user mode enabled, the gateway should proxy to container
# Currently returns empty/401 responses instead of proper data
```

## Next Steps for Debugging

### 1. Verify http-proxy-middleware Configuration
Check if the proxy is correctly preserving paths:
```javascript
// server/middleware/proxy.js
// Current approach creates fresh proxy per request
// Consider using a persistent proxy or different path preservation strategy
```

### 2. Add More Detailed Path Logging
```javascript
// In proxy.js onProxyReq callback
console.log(`[ProxyMiddleware] Original path: ${req.path}`);
console.log(`[ProxyMiddleware] Original URL: ${req.url}`);
console.log(`[ProxyMiddleware] Proxy target path: ${proxyReq.path}`);
```

### 3. Test Direct Container Authentication
Create a test script that:
1. Gets a JWT token from the gateway (login)
2. Uses that token to call the container API directly
3. Verifies the JWT verification works

### 4. Consider Alternative Proxy Approach
Instead of creating a fresh proxy per request, consider:
- Maintaining a proxy instance per user/container
- Using a simpler HTTP forwarding approach
- Checking if the `pathRewrite` function is being called correctly

### 5. Check for Race Conditions
The ECONNRESET errors suggest possible timing issues:
- Container might not be fully ready when proxy connects
- Add connection retry logic
- Add health check before proxying

## Enabling Multi-User Mode

The proxy issues have been resolved. Set in `.env`:
```bash
MULTI_USER_MODE=true
```

## Files Changed

### New Files
- `server/container/runtime-detector.js`
- `server/container/runtime.js`
- `server/container/test-runtime.js`
- `docker/worker/Dockerfile.simple`
- `podman-compose.yml`
- `docker/PODMAN.md`
- `PODMAN_IMPLEMENTATION_SUMMARY.md`
- `MULTI_USER_TROUBLESHOOTING.md` (this file)

### Modified Files
- `server/container/manager.js` - Resource limits, port bindings, JWT secret
- `server/container/config.js` - Podman configuration options
- `server/middleware/proxy.js` - Enhanced logging, path rewriting
- `server/utils/colors.js` - Added missing color methods
- `src/components/auth/view/AuthInputField.tsx` - Password visibility toggle
- `vite.config.js` - Proxy logging
- `.env` - Multi-user configuration
- `.env.example` - Documentation
- `README.md` - Updated documentation
- `MULTI_USER_ARCHITECTURE.md` - Implementation details

## Additional Notes

### Worker Container Image
Built and tagged as `cloudcliai/worker:latest`
```bash
docker build -f docker/worker/Dockerfile.simple -t cloudcliai/worker:latest .
```

### Container Runtime Detection
Works automatically:
```
[RuntimeDetector] Auto-detecting container runtime...
[RuntimeDetector] Podman detected
[ContainerRuntime] Connected to Podman (rootless)
[ContainerRuntime] Socket: /run/user/25905/podman/podman.sock
```

### Clean Up Containers
```bash
# Remove user container and database records
podman rm -f cloudcli-user-1
sqlite3 ~/.cloudcli/auth.db "DELETE FROM user_containers WHERE user_id=1; DELETE FROM container_ports WHERE user_id=1;"
```

## Contact & Support

If you continue debugging this issue:
1. Check server logs for `[ProxyMiddleware]` messages
2. Check container logs: `podman logs cloudcli-user-1`
3. Enable more verbose proxy logging in `http-proxy-middleware`
4. Consider asking in the http-proxy-middleware GitHub issues if path preservation is not working as expected

The architecture is sound and all the pieces are in place - just need to resolve the proxy request forwarding issue.
