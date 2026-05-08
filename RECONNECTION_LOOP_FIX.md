# WebSocket Reconnection Loop Fix

## Problem Summary

The Claude agent was getting stuck in an infinite reconnection loop, causing:
- Repeated `[RECONNECT] Writer swapped` messages in logs
- UI becoming unresponsive
- Container logs showing hundreds of reconnection attempts

## Root Cause

The issue was caused by a cascading failure:

1. **WebSocket disconnects** (for various reasons - network issue, credential problem, etc.)
2. **Frontend auto-reconnects** after 3 seconds (hardcoded in `WebSocketContext.tsx`)
3. **Reconnection triggers `websocket-reconnected` event**
4. **Event handler calls `check-session-status`** for the active session
5. **Backend tries to reconnect session writer**
6. **If session is in error state**, WebSocket closes again
7. **Loop repeats infinitely** - GOTO step 2

## Solutions Implemented

### 1. Frontend: Reconnection Loop Detection & Exponential Backoff
**File:** `src/contexts/WebSocketContext.tsx`

**Changes:**
- Added reconnection attempt counter
- Implemented exponential backoff (3s → 6s → 12s → 24s → 30s max)
- Max reconnection limit of 10 attempts before giving up
- Automatic counter reset after 30 seconds of stable connection
- Enhanced logging with timestamps and connection state

**Benefits:**
- Prevents infinite reconnection loops
- Reduces server load during connection issues
- Provides clear feedback when connection fails permanently
- Auto-recovers from temporary network issues

### 2. Backend: Session Status Check Throttling
**File:** `server/index.js`

**Changes:**
- Added throttle map to track session status check timestamps
- Minimum 1 second interval between checks for same session
- Automatic cleanup of stale throttle entries every 5 minutes

**Benefits:**
- Prevents rapid repeated reconnection attempts
- Reduces log spam
- Protects backend from reconnection storm

### 3. Enhanced Logging Throughout
**Files:**
- `src/contexts/WebSocketContext.tsx`
- `server/index.js`
- `server/claude-sdk.js`

**Changes:**
- Added ISO timestamps to all reconnection-related logs
- Log WebSocket close codes and reasons
- Log reconnection attempt counts
- Log session state during reconnection
- Added error context (readyState, error codes)

**Benefits:**
- Easier to diagnose future issues
- Can identify patterns in failures
- Better visibility into reconnection behavior

## How to Test

1. **Restart the container:**
   ```bash
   podman restart cloudcli-user-1
   ```

2. **Monitor logs with new logging:**
   ```bash
   podman logs -f cloudcli-user-1 | grep -E "WebSocket|RECONNECT|SESSION-STATUS"
   ```

3. **Look for these improved log messages:**
   - `[WebSocket] Initial connection established`
   - `[WebSocket] Reconnected after N attempts, delay was Xms`
   - `[WebSocket] Connection closed (code: X, reason: Y, wasClean: Z, after Xms)`
   - `[WebSocket] Attempting reconnect #N in Xms`
   - `[WebSocket] Max reconnection attempts (10) reached`
   - `[SESSION-STATUS] Checking status for session X`
   - `[SESSION-STATUS] Throttled check for session X`
   - `[RECONNECT] Writer swapped for session X at <timestamp>`

## What to Look For

### Healthy Reconnection (After Fix)
```
[WebSocket] Connection closed (code: 1006, reason: none, wasClean: false, after 45123ms)
[WebSocket] Attempting reconnect #1 in 3000ms
[WebSocket] Reconnected after 1 attempts, delay was 3000ms
[SESSION-STATUS] Checking status for session abc123
[RECONNECT] Writer swapped for session abc123 at 2026-05-08T10:30:45.123Z
```

### Unhealthy Reconnection Loop (Should No Longer Happen)
```
[RECONNECT] Writer swapped for session abc123
[RECONNECT] Writer swapped for session abc123
[RECONNECT] Writer swapped for session abc123
[RECONNECT] Writer swapped for session abc123
... (hundreds of times in seconds)
```

### Max Reconnect Hit (New Behavior)
```
[WebSocket] Attempting reconnect #10 in 30000ms
[WebSocket] Max reconnection attempts (10) reached. Stopping reconnection attempts.
```

## Configuration

You can adjust these values in the code if needed:

### Frontend (`src/contexts/WebSocketContext.tsx`)
- `MAX_RECONNECT_ATTEMPTS = 10` - Maximum retry attempts
- `INITIAL_RECONNECT_DELAY = 3000` - Starting delay (3 seconds)
- `MAX_RECONNECT_DELAY = 30000` - Maximum delay (30 seconds)
- `STABLE_CONNECTION_THRESHOLD = 30000` - Time before resetting counter (30 seconds)

### Backend (`server/index.js`)
- `SESSION_STATUS_CHECK_MIN_INTERVAL = 1000` - Throttle interval (1 second)

## Future Improvements

1. **Add user notification** when max reconnects hit (show banner in UI)
2. **Implement health check endpoint** to verify backend/credentials before reconnecting
3. **Add reconnection metrics** to track patterns across users
4. **Graceful degradation** - allow read-only mode when connection is unstable
5. **Smart reconnection** - check backend health before attempting reconnect

## Related Files

- `src/contexts/WebSocketContext.tsx` - Frontend WebSocket connection management
- `src/components/chat/hooks/useChatSessionState.ts` - Session state management
- `src/components/chat/hooks/useChatRealtimeHandlers.ts` - WebSocket message handling
- `server/index.js` - Backend WebSocket server
- `server/claude-sdk.js` - Claude SDK session management

## Commit Message Template

```
fix: prevent infinite WebSocket reconnection loops

- Add reconnection attempt counter with max limit (10 attempts)
- Implement exponential backoff (3s → 30s max)
- Add session status check throttling (1s minimum interval)
- Enhance logging with timestamps and connection state
- Auto-reset counter after 30s of stable connection

Fixes issue where agent would get stuck in reconnection loop,
causing UI to become unresponsive and logs to fill with
repeated reconnection attempts.
```
