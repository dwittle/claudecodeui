# Multi-User Mode - Documentation Index

**Status**: ⚠️ Implementation 95% complete - Authentication fix needed
**Branch**: `feature/multi-user-container-architecture`
**Last Updated**: May 1, 2026

---

## Quick Navigation

### 🚀 Start Here
- **[HANDOFF.md](./HANDOFF.md)** - Quick start guide for next developer (15-min test)
- **[MULTI_USER_DIAGNOSTIC.md](./MULTI_USER_DIAGNOSTIC.md)** - Complete technical diagnostic

### 📊 Status & Summary
- **[FINAL_STATUS.md](./FINAL_STATUS.md)** - Current status and solution options
- **[MULTI_USER_COMPLETE.md](./MULTI_USER_COMPLETE.md)** - Implementation guide

### 🔧 Technical Details
- **[MULTI_USER_FIX_SUMMARY.md](./MULTI_USER_FIX_SUMMARY.md)** - Authentication fix details
- **[MULTI_USER_TEST_RESULTS.md](./MULTI_USER_TEST_RESULTS.md)** - Proxy fix test results
- **[MULTI_USER_TROUBLESHOOTING.md](./MULTI_USER_TROUBLESHOOTING.md)** - Initial troubleshooting

### 📁 Logs & Scripts
- **[logs/](./logs/)** - Debug logs (browser, gateway, container)
- **[START_MULTIUSER.sh](./START_MULTIUSER.sh)** - Server startup script
- **[test-multiuser-simple.sh](./test-multiuser-simple.sh)** - Testing script

---

## The Problem (One Sentence)

Worker containers reject valid JWT tokens because they check for users in isolated databases (which are empty), causing 401 errors and blank page after login.

---

## The Solution (Already Implemented)

Set `IS_PLATFORM=true` environment variable in containers to bypass user database validation.

**File**: `server/container/manager.js` (line ~154)
**Status**: ✅ Code committed, ⏳ Needs testing

---

## Test It Now (5 Commands)

```bash
cd /space/tucker28/code/claudecodeui
./START_MULTIUSER.sh
# Wait 15 seconds
TOKEN=$(node -e "const jwt = require('jsonwebtoken'); const secret = '$(sqlite3 ~/.cloudcli/auth.db \"SELECT value FROM app_config WHERE key='jwt_secret';\")'; console.log(jwt.sign({ userId: 1 }, secret, { expiresIn: '1h' }));")
curl -H "Authorization: Bearer $TOKEN" http://localhost:3333/api/projects
```

**Expected**: JSON array of projects
**If fails**: See alternative solution in MULTI_USER_DIAGNOSTIC.md

---

## What's Working ✅

- Container auto-creation and lifecycle management
- Rootless Podman support
- Proxy routing (fixed in commit 09eaf89)
- Port mapping and network isolation
- JWT secret sharing
- Health checks and monitoring

---

## What's Not Working ❌

- Authentication in worker containers (user database lookup fails)

---

## Timeline

| Commit | Date | Description |
|--------|------|-------------|
| 8f725ac | May 1 | Documentation for multi-user architecture |
| b9554d6 | May 1 | Podman support and rootless compatibility |
| 09eaf89 | May 1 | **Proxy fix** - Path stripping and error handling |
| 9e89cd4 | May 1 | Comprehensive diagnostic documentation |
| 2451da0 | May 1 | Developer handoff guide and logs |

---

## Documentation Purpose Guide

**New to the project?** → Read [HANDOFF.md](./HANDOFF.md)

**Need to understand the problem?** → Read [MULTI_USER_DIAGNOSTIC.md](./MULTI_USER_DIAGNOSTIC.md)

**Want implementation details?** → Read [MULTI_USER_COMPLETE.md](./MULTI_USER_COMPLETE.md)

**Debugging?** → Check [logs/](./logs/) directory

**Need architecture overview?** → Read [MULTI_USER_ARCHITECTURE.md](./MULTI_USER_ARCHITECTURE.md)

---

## Key Files Modified

```
server/
├── middleware/
│   ├── auth.js          (gateway trust mode added)
│   └── proxy.js         (fixed in 09eaf89)
├── container/
│   ├── manager.js       (IS_PLATFORM env added ⭐)
│   └── config.js        (default image set)
└── index.js             (multi-user routing)

docker/worker/
├── Dockerfile.simple    (npm-based worker image ✅)
└── Dockerfile.local     (local build - broken ❌)
```

---

## Architecture

```
Browser (5173) → Gateway (3333) → Worker Container (4001+)
                    ↓
                Validates JWT
                Creates container
                Proxies request
                    ↓
            Worker validates... ❌ FAILS HERE
            (User not in container DB)
```

**Fix**: Use IS_PLATFORM mode to skip user DB check in container.

---

## Success Criteria

When fixed:
- ✅ No 401 errors
- ✅ API returns JSON arrays
- ✅ No blank page after login
- ✅ Projects load in browser

---

## Estimated Time to Fix

| Solution | Time | Confidence |
|----------|------|------------|
| Test IS_PLATFORM | 15 min | High |
| Patch compiled file | 30 min | Medium |
| Total | 15-45 min | - |

---

## Git Commands

```bash
# Get latest
git checkout feature/multi-user-container-architecture
git pull origin feature/multi-user-container-architecture

# View changes
git log --oneline -10

# View specific commit
git show 9e89cd4

# View file history
git log --follow server/container/manager.js
```

---

## Contact Points

**Problem**: Authentication fails in worker containers
**Root Cause**: Pre-compiled code doesn't have source changes
**Solution**: Use IS_PLATFORM env var (built-in feature)
**Alternative**: Patch compiled dist-server/auth.js file

---

## Related Documentation

- [MULTI_USER_ARCHITECTURE.md](./MULTI_USER_ARCHITECTURE.md) - Architecture overview
- [PODMAN_IMPLEMENTATION_SUMMARY.md](./PODMAN_IMPLEMENTATION_SUMMARY.md) - Podman details
- [docs/PODMAN_SUPPORT.md](./docs/PODMAN_SUPPORT.md) - Podman support guide

---

**Next Step**: Read [HANDOFF.md](./HANDOFF.md) for quick start guide.
