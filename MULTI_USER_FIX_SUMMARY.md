# Multi-User Mode Authentication Fix

**Date**: May 1, 2026
**Status**: Fix implemented, needs container rebuild

## Problem

Worker containers were rejecting valid JWT tokens because they were trying to validate users against their own isolated databases, but users only exist in the gateway database.

**Error seen**:
```json
{"error":"Invalid token. User not found."}
```

## Root Cause

In `server/middleware/auth.js`, the `authenticateToken` function (line 56-59) checks if the user exists in the local database:

```javascript
const user = userDb.getUserById(decoded.userId);
if (!user) {
  return res.status(401).json({ error: 'Invalid token. User not found.' });
}
```

Worker containers have isolated databases that don't contain user records from the gateway.

## Solution Implemented

Modified `server/middleware/auth.js` to detect when running in a worker container and trust the gateway's authentication:

```javascript
// Worker container mode: Trust gateway authentication
// Gateway validates token and sets X-CloudCLI-User-ID header
const gatewayUserId = req.headers['x-cloudcli-user-id'];
const isWorkerContainer = process.env.USER_ID !== undefined; // Workers have USER_ID env var

if (isWorkerContainer && gatewayUserId) {
  // Trust the gateway - it already validated the token
  // Create a minimal user object with the ID from the gateway
  req.user = {
    id: parseInt(gatewayUserId),
    username: `user-${gatewayUserId}`
  };
  return next();
}
```

**How it works:**
1. Gateway validates JWT token and extracts `userId`
2. Gateway adds `X-CloudCLI-User-ID: 1` header when proxying to worker
3. Worker detects it's running in container mode (`USER_ID` env var exists)
4. Worker trusts the gateway header instead of validating against local DB

## Testing Status

✅ Code fix implemented in `/space/tucker28/code/claudecodeui/server/middleware/auth.js`
❌ Container image needs to be rebuilt with the fix
⚠️ Attempted to build local image but hit module resolution issues

## Next Steps

### Option 1: Use Published Package + Volume Mount (RECOMMENDED)
Mount the modified `auth.js` into the running container:

```javascript
// In server/container/manager.js, add to Binds array:
Binds: [
  `${volumeName}:/home/agent`,
  `${APP_ROOT}/server/middleware/auth.js:/usr/local/lib/node_modules/@cloudcli-ai/cloudcli/server/middleware/auth.js:ro`
]
```

### Option 2: Fix Local Build
The local Dockerfile build failed due to module resolution of `@/shared` paths. Need to:
1. Ensure tsconfig paths are properly configured for Node ESM
2. Or use a bundler (esbuild/webpack) to resolve aliases
3. Or use published package (Option 1)

### Option 3: Publish Updated Package
1. Increment version in package.json
2. Publish to npm: `npm publish`
3. Rebuild worker image which will pull new version

## Manual Testing

Once the container has the fix, test with:

```bash
# Get JWT token
TOKEN=$(node -e "const jwt = require('jsonwebtoken'); \
  const secret = '$(sqlite3 ~/.cloudcli/auth.db "SELECT value FROM app_config WHERE key='jwt_secret';")'; \
  console.log(jwt.sign({ userId: 1 }, secret, { expiresIn: '1h' }));")

# Clean state
podman rm -f cloudcli-user-1
sqlite3 ~/.cloudcli/auth.db "DELETE FROM user_containers WHERE user_id=1;"

# Test through gateway (will create new container)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3333/api/projects

# Wait for container to start
sleep 10

# Test again (should work now)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3333/api/projects
```

Expected result: JSON array of projects, not 401 error.

## Files Modified

- `server/middleware/auth.js` - Added worker container detection and gateway trust mode
- `.env` - Set `MULTI_USER_MODE=true`
- `docker/worker/Dockerfile.local` - Created (needs fixing or use Option 1)

## Architecture Notes

The multi-user architecture uses a **gateway trust model**:

```
Browser → Gateway (validates JWT) → Worker Container (trusts gateway)
```

This is secure because:
- Only the gateway is publicly accessible
- Workers are on isolated networks
- Gateway adds authenticated user ID to proxied requests
- Workers trust requests from gateway (which validated authentication)

This is similar to how Kubernetes sidecars or service meshes work - the edge validates, internal services trust.

