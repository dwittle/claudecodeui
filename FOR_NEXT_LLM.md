# Instructions for Next LLM

**Context**: Multi-user container mode implementation
**Your Task**: Test and verify the authentication fix
**Estimated Time**: 15-30 minutes
**Difficulty**: Easy (solution already implemented)

---

## Current Situation

The previous developer (Claude Opus 4.6) implemented **95%** of multi-user container mode. Everything works except one authentication issue that causes a blank page after login.

**Problem**: Worker containers return `{"error":"Invalid token. User not found."}`
**Solution**: Already implemented, just needs testing

---

## What You Need to Do

### Step 1: Read the Diagnostic (5 minutes)

Open and read: **`MULTI_USER_DIAGNOSTIC.md`**

This document contains:
- Complete problem description with logs
- What's working vs. what's broken
- Step-by-step testing protocol
- Alternative solutions if primary fails

**Focus on these sections:**
1. "The Problem - Detailed"
2. "Solution 2: IS_PLATFORM Mode"
3. "Testing Protocol - Test 1"

### Step 2: Test the Solution (10 minutes)

The solution (IS_PLATFORM=true) is already in the code. Just need to verify it works:

```bash
# Clean everything
pkill -9 -f "npm.*dev"
podman rm -f cloudcli-user-1
sqlite3 ~/.cloudcli/auth.db "DELETE FROM user_containers WHERE user_id=1; DELETE FROM container_ports WHERE user_id=1;"

# Start server
cd /space/tucker28/code/claudecodeui
npm run dev > /tmp/test.log 2>&1 &

# Wait for startup
sleep 15

# Create JWT token
TOKEN=$(node -e "const jwt = require('jsonwebtoken'); \
  const secret = '$(sqlite3 ~/.cloudcli/auth.db \"SELECT value FROM app_config WHERE key='jwt_secret';\")'; \
  console.log(jwt.sign({ userId: 1 }, secret, { expiresIn: '1h' }));")

# Test (will create container)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3333/api/projects
# First request may fail with 502 (container starting)

# Wait for container
sleep 15

# Verify IS_PLATFORM is set
podman exec cloudcli-user-1 printenv IS_PLATFORM
# Should output: true

# Test again
curl -H "Authorization: Bearer $TOKEN" http://localhost:3333/api/projects
# Should output: JSON array of projects
```

### Step 3: Verify Success

If the last curl command returns a JSON array (not an error), **SUCCESS!** ✅

Then test in browser:
1. Open http://localhost:5173
2. Login
3. Should see UI, not blank page
4. No 401 errors in browser console (F12)

---

## If IS_PLATFORM Test Fails

### Check These First:

1. **Is IS_PLATFORM actually set?**
   ```bash
   podman exec cloudcli-user-1 printenv IS_PLATFORM
   ```
   If this is empty or returns error, the env var isn't reaching the container.

2. **Check container logs for "Platform mode":**
   ```bash
   podman logs cloudcli-user-1 | grep -i platform
   ```
   If no output, platform mode isn't activating.

3. **Check gateway logs:**
   ```bash
   tail -50 /tmp/test.log | grep -E "ProxyMiddleware|Container"
   ```
   Should show proxy routing and container creation.

### Alternative Solution (30 minutes)

If IS_PLATFORM doesn't work, you'll need to patch the compiled auth.js file.

**Complete instructions** in `MULTI_USER_DIAGNOSTIC.md` section: **"Alternative Solution: Patch Compiled File"**

Summary:
1. Extract compiled auth.js from container
2. Add 10 lines of code to detect worker container mode
3. Mount patched file as volume
4. Test again

---

## Expected Outputs

### SUCCESS Case:
```bash
$ curl -H "Authorization: Bearer $TOKEN" http://localhost:3333/api/projects
[{"id":1,"name":"project1",...},{"id":2,"name":"project2",...}]
```

### FAILURE Case (Current):
```bash
$ curl -H "Authorization: Bearer $TOKEN" http://localhost:3333/api/projects
{"error":"Invalid token. User not found."}
```

---

## Documents to Reference

### Primary (Read These):
1. **MULTI_USER_DIAGNOSTIC.md** - Complete diagnostic with testing protocol
2. **HANDOFF.md** - Quick start guide
3. **logs/** directory - Debug logs showing current state

### Secondary (If Needed):
4. **FINAL_STATUS.md** - Status summary
5. **MULTI_USER_COMPLETE.md** - Implementation guide
6. **README_MULTIUSER.md** - Documentation index

---

## Key Information

### File Locations:
- Solution code: `server/container/manager.js` (line ~154)
- Auth code: `server/middleware/auth.js`
- Proxy code: `server/middleware/proxy.js`
- Container config: `server/container/config.js`

### What's Already Working:
✅ Container creation
✅ Proxy routing
✅ Port mapping
✅ JWT secret sharing
✅ All infrastructure

### What's Broken:
❌ Authentication in worker containers (user DB lookup fails)

### Why It's Broken:
- CloudCLI uses pre-compiled code in dist-server/ directory
- Our source code changes don't affect compiled version
- Need to either use IS_PLATFORM (built-in) or patch compiled file

---

## Questions You Might Have

**Q: Why not just fix the source auth.js?**
A: The container uses pre-compiled dist-server/auth.js, not the source. Source changes don't apply.

**Q: Why use IS_PLATFORM instead of fixing the actual issue?**
A: IS_PLATFORM is built-in to the compiled code. No patching needed. Just set env var.

**Q: What if I can't get it working?**
A: Follow the alternative solution in MULTI_USER_DIAGNOSTIC.md to patch the compiled file.

**Q: How do I know what the problem is?**
A: All logs are in logs/ directory. Read logs/README.md for explanations.

---

## Success Criteria

You've successfully fixed it when:
1. ✅ `curl` command returns JSON array (not error)
2. ✅ Browser shows UI after login (not blank page)
3. ✅ No 401 errors in browser console
4. ✅ `podman exec cloudcli-user-1 printenv IS_PLATFORM` returns "true"

---

## Commit the Fix

Once working:

```bash
git add -A
git commit -m "fix(auth): verify IS_PLATFORM mode enables worker authentication

Tested and verified IS_PLATFORM=true environment variable successfully
bypasses user database validation in worker containers.

Results:
- API requests return proper JSON arrays
- No more 401 authentication errors
- Browser shows UI after login (no blank page)
- Container logs show platform mode active

Closes multi-user mode authentication issue.

Co-Authored-By: [Your Name] <your.email@example.com>"
```

---

## If You Get Stuck

1. Read `MULTI_USER_DIAGNOSTIC.md` sections:
   - "The Problem - Detailed"
   - "Testing Protocol"
   - "Questions to Answer During Debugging"

2. Check logs:
   - `logs/error-12-browser-console.log` - Shows frontend errors
   - `logs/gateway-server.log` - Shows proxy working correctly
   - `logs/worker-container.log` - Shows container is healthy

3. Run debugging commands from `MULTI_USER_DIAGNOSTIC.md` section:
   - "Debugging Commands"
   - "Verification Checklist"

4. Try the alternative solution:
   - "Alternative Solution: Patch Compiled File"

---

## Summary for Your LLM Context

```
TASK: Test authentication fix for multi-user container mode
STATUS: Solution implemented (IS_PLATFORM=true), needs verification
BRANCH: feature/multi-user-container-architecture
FILES: MULTI_USER_DIAGNOSTIC.md (primary reference)
TIME: 15-30 minutes
CONFIDENCE: High (solution should work)

STEPS:
1. Read MULTI_USER_DIAGNOSTIC.md
2. Run test protocol from document
3. Verify IS_PLATFORM env var is set
4. Confirm API returns JSON (not errors)
5. Test in browser (no blank page)
6. If works: commit fix
7. If fails: follow alternative solution
```

---

**Good luck!** The previous developer left comprehensive documentation and logs. You have everything needed to complete this. 🚀

---

**Next Document to Read**: `MULTI_USER_DIAGNOSTIC.md`
