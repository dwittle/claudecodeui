# WebSocket Connection Issue in Multi-User Mode

## Problem Summary
WebSocket connections from the frontend are failing to connect to the backend server in multi-user mode. The browser console shows "WebSocket not connected" when attempting to send chat messages, and the UI hangs waiting for a response.

## Architecture Overview

### Multi-User Container Architecture
- **Gateway Server** (port 3333): Main Express server that handles authentication and routes requests
- **Worker Containers** (port 4001+): Individual Podman containers per user running Claude Code CLI
- **Vite Dev Server** (port 5173): Development frontend server that proxies API and WebSocket requests to gateway

### Request Flow
1. Browser → Vite (localhost:5173)
2. Vite proxies `/api/*` and `/ws` → Gateway (localhost:3333)
3. Gateway authenticates using JWT token
4. Gateway proxies requests → Worker container (localhost:4001+)

## Expected Behavior
When a user sends a chat message:
1. Frontend creates WebSocket connection: `ws://localhost:5173/ws?token=<jwt>`
2. Vite proxies WebSocket upgrade to: `ws://localhost:3333/ws?token=<jwt>`
3. Gateway extracts token, authenticates user
4. Gateway proxies WebSocket to user's worker container: `ws://localhost:4001/ws`
5. Worker container handles chat functionality

## Current Issue
The WebSocket connection is failing silently. No connection attempts are visible in the server logs.

## Browser Console Errors

```
WebSocketContext.tsx:106 WebSocket not connected
(anonymous) @ WebSocketContext.tsx:106
(anonymous) @ useChatComposerState.ts:642
(anonymous) @ useChatComposerState.ts:801
```

No "WebSocket error:" or "Error creating WebSocket connection:" messages appear, suggesting the WebSocket constructor succeeds but never reaches OPEN state.

## What We've Tried

### 1. Initial Problem: Token Not Being Passed
**Issue**: WebSocket authentication was failing because token wasn't available in WebSocketContext.

**Fix Attempted**: Verified token is properly stored in localStorage as 'auth-token' and passed to `useAuth()` hook.

**Result**: Token is now available, "No authentication token found" warning no longer appears.

---

### 2. WebSocket Proxy Not Configured on Gateway
**Issue**: Gateway server wasn't set up to proxy WebSocket upgrade events to worker containers.

**Fix Implemented**:
- Imported `setupWebSocketProxy` from `server/middleware/proxy.js`
- Called it during container manager initialization in `server/index.js`:

```javascript
// server/index.js (lines 2336-2355)
if (MULTI_USER_MODE) {
    console.log(`${c.info('[INFO]')} Multi-user mode enabled - initializing container manager`);
    try {
        await containerManager.initialize();
        console.log(`${c.success('[SUCCESS]')} Container manager initialized`);

        // Set up WebSocket proxy for /ws, /api/terminal, /api/sessions
        setupWebSocketProxy(server, async (req) => {
            // Extract token from query or Authorization header
            const url = new URL(req.url, `http://${req.headers.host}`);
            const token = url.searchParams.get('token') ||
                          req.headers.authorization?.split(' ')[1];

            // Use existing authenticateWebSocket function
            const user = authenticateWebSocket(token, req);
            return user;
        });
        console.log(`${c.success('[SUCCESS]')} WebSocket proxy configured`);
    } catch (error) {
        // ... error handling
    }
}
```

**Result**: Server logs show `[SUCCESS] WebSocket proxy configured` but no connection attempts are logged.

---

### 3. Conflicting WebSocket Servers
**Issue**: Both a local WebSocketServer AND setupWebSocketProxy were trying to handle upgrade events, causing conflicts.

**Fix Implemented**: Wrapped the local WebSocketServer creation in a conditional to only create it in non-multi-user mode:

```javascript
// server/index.js (lines 220-268)
let wss = null;

if (!MULTI_USER_MODE) {
    // Create local WebSocketServer with verifyClient
    wss = new WebSocketServer({
        server,
        verifyClient: (info) => {
            // ... authentication logic
        }
    });
    app.locals.wss = wss;
} else {
    console.log('[INFO] Multi-user mode: WebSocket connections will be proxied to worker containers');
}

// Later (lines 1362-1385)
if (wss) {
    wss.on('connection', (ws, request) => {
        // ... connection handling
    });
}
```

**Result**: Server logs show `[INFO] Multi-user mode: WebSocket connections will be proxied to worker containers`, confirming no local WebSocketServer is created. However, still no WebSocket connection attempts are logged.

---

## Current Server Configuration

### Vite Configuration (vite.config.js)
```javascript
proxy: {
  '/api': {
    target: `http://${proxyHost}:${serverPort}`,
    // ... with logging
  },
  '/ws': {
    target: `ws://${proxyHost}:${serverPort}`,
    ws: true
  },
  '/shell': {
    target: `ws://${proxyHost}:${serverPort}`,
    ws: true
  }
}
```

### WebSocket Proxy Middleware (server/middleware/proxy.js)
```javascript
export function setupWebSocketProxy(server, authenticateWs) {
  server.on('upgrade', async (req, socket, head) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const proxyRoutes = ['/api/terminal', '/api/sessions', '/ws'];
      if (!proxyRoutes.some(route => url.pathname.startsWith(route))) {
        return;
      }

      const user = await authenticateWs(req);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const userId = user.userId;

      let containerInfo;
      try {
        containerInfo = await containerManager.ensureRunning(userId);
      } catch (error) {
        console.error(`[WebSocketProxy] Failed to ensure container for user ${userId}:`, error.message);
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }

      const target = `ws://localhost:${containerInfo.internalPort}`;
      console.log(`[WebSocketProxy] Proxying WebSocket for user ${userId} → ${target}`);

      const wsProxy = createHttpProxy({
        target,
        ws: true,
        changeOrigin: true,
        onError: (err) => {
          console.error(`[WebSocketProxy] Error for user ${userId}:`, err.message);
          socket.destroy();
        },
        onProxyReqWs: (proxyReq) => {
          proxyReq.setHeader('X-CloudCLI-User-ID', userId);
        },
      });

      wsProxy.upgrade(req, socket, head);

    } catch (error) {
      console.error('[WebSocketProxy] Unexpected error:', error);
      socket.destroy();
    }
  });
}
```

### Frontend WebSocket Context (src/contexts/WebSocketContext.tsx)
```typescript
const buildWebSocketUrl = (token: string | null) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (IS_PLATFORM) return `${protocol}//${window.location.host}/ws`; // Platform mode: Use same domain as the page (goes through proxy)
  if (!token) return null;
  return `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`; // OSS mode: Use same host:port that served the page
};

const useWebSocketProviderState = (): WebSocketContextType => {
  const { token } = useAuth();

  useEffect(() => {
    connect();
    return () => {
      // cleanup
    };
  }, [token]);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    try {
      const wsUrl = buildWebSocketUrl(token);
      if (!wsUrl) return console.warn('No authentication token found for WebSocket connection');

      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        setIsConnected(true);
        wsRef.current = websocket;
      };

      websocket.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (unmountedRef.current) return;
          connect();
        }, 3000);
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  }, [token]);

  const sendMessage = useCallback((message: any) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
    }
  }, []);

  // ...
};
```

## Server Logs (Current State)

### Startup Logs
```
[INFO] Multi-user mode: WebSocket connections will be proxied to worker containers
Database initialized successfully
Database migrations completed successfully
Web Push notifications configured
[INFO] Multi-user mode enabled - initializing container manager
[ContainerRuntime] Initializing container runtime...
[RuntimeDetector] Auto-detecting container runtime...
[RuntimeDetector] Podman detected
[ContainerRuntime] Connected to Podman (rootless)
[ContainerRuntime] Version: podman version 5.2.2
[ContainerRuntime] Socket: /run/user/25905/podman/podman.sock
[ContainerManager] Connected to Podman (rootless)
[ContainerManager] Socket: /run/user/25905/podman/podman.sock
[ContainerManager] Running in rootless mode
[SUCCESS] Container manager initialized
[SUCCESS] WebSocket proxy configured
[INFO] Using Claude Agents SDK for Claude integration

[INFO] To run in production mode, go to http://localhost:3333
[INFO] To run in development mode with hot-module replacement, go to http://localhost:5173

═══════════════════════════════════════════════════════════════
  CloudCLI Server - Ready
═══════════════════════════════════════════════════════════════

[INFO] Server URL:  http://localhost:3333
[INFO] Installed at: /space/tucker28/code/claudecodeui
[TIP]  Run "cloudcli status" for full configuration details
```

### Runtime Logs (When Attempting to Send Message)
```
[Vite Proxy] Proxying: GET /api/taskmaster/tasks/-home-agent-workspace-my-project -> /api/taskmaster/tasks/-home-agent-workspace-my-project
[Vite Proxy] Target: http://localhost:3333
[ProxyMiddleware] Routing user 1 → http://localhost:4001/api/projects/-home-agent-workspace-my-project/files
[Vite Proxy] Response: 304 /api/settings/server-env
[Vite Proxy] Response: 200 /api/commands/list
[Vite Proxy] Response: 200 /api/projects/-home-agent-workspace-my-project/files
[Vite Proxy] Response: 200 /api/taskmaster/tasks/-home-agent-workspace-my-project
```

**Notable**: No WebSocket-related logs appear. No "WebSocketProxy", no "upgrade" events, no connection attempts logged.

## Environment Details

- **Node.js**: v22.15.0
- **Platform**: Linux 5.15.0-304.171.4.el9uek.x86_64
- **Container Runtime**: Podman 5.2.2 (rootless)
- **Multi-User Mode**: Enabled (`MULTI_USER_MODE=true`)
- **Development Mode**: Running via `npm run dev`
- **Ports**:
  - Vite: 5173
  - Gateway: 3333
  - Worker Container: 4001

## Key Questions

1. **Is the WebSocket connection even attempting?**
   - Browser console shows "WebSocket not connected" but no "WebSocket error:" or "Error creating WebSocket connection:"
   - No "upgrade" events logged on the server
   - Network tab inspection needed to see if WebSocket connection attempt appears

2. **Is Vite properly proxying WebSocket upgrades?**
   - Vite config has `ws: true` for `/ws` proxy
   - HTTP proxying works (all API calls succeed)
   - WebSocket proxying may be failing silently

3. **Is the frontend creating the correct WebSocket URL?**
   - `IS_PLATFORM` constant may be affecting URL construction
   - Frontend should create: `ws://localhost:5173/ws?token=<jwt>`
   - Need to verify actual URL being constructed

4. **Are there CORS or security issues blocking the upgrade?**
   - HTTP requests work fine
   - WebSocket upgrade may have different security requirements

## Files Modified

1. **server/index.js**
   - Added import for `setupWebSocketProxy`
   - Conditionally create WebSocketServer only in non-multi-user mode
   - Call `setupWebSocketProxy` during container manager initialization
   - Wrapped `wss.on('connection')` handler in conditional

2. **server/middleware/proxy.js**
   - No changes (already had setupWebSocketProxy function)

3. **src/contexts/WebSocketContext.tsx**
   - No changes (already has proper token handling)

## Next Steps to Debug

1. **Browser Network Tab Investigation**
   - Filter by "WS" in Network tab
   - Check if WebSocket connection attempt appears
   - Check the status (pending, failed, cancelled)
   - Inspect Headers to see the request details

2. **Check IS_PLATFORM Constant**
   - Verify `VITE_IS_PLATFORM` environment variable value
   - Check if frontend is using correct URL construction path
   - Add console.log in buildWebSocketUrl to see what URL is generated

3. **Vite WebSocket Proxy Debugging**
   - Check if Vite is properly proxying WebSocket upgrades
   - May need to add Vite-specific logging for WebSocket proxy
   - Verify `http-proxy-middleware` version compatibility

4. **Test Direct Connection**
   - Try connecting directly to `ws://localhost:3333/ws?token=<jwt>` bypassing Vite
   - This will determine if the issue is with Vite proxy or gateway server

5. **Worker Container Verification**
   - Verify worker container has WebSocket server running on port 4001
   - Check worker container logs for incoming connection attempts
   - Test direct connection to worker: `ws://localhost:4001/ws`

## Additional Context

### Recent Changes
- Moved from single-user mode to multi-user container architecture
- Gateway server now acts as proxy to worker containers
- HTTP proxying works correctly for all API endpoints
- Settings.json successfully copied to worker container
- Custom model "claude-sonnet-4.5" added and appears in UI
- Authentication working correctly (user can log in, JWT token persists)

### What Works
✅ User authentication and login
✅ HTTP API requests proxied to worker containers
✅ Project creation in worker container workspace
✅ File browsing in worker container
✅ Provider settings loaded from worker container
✅ Container startup and management

### What Doesn't Work
❌ WebSocket connection establishment
❌ Chat message sending
❌ Real-time communication with worker container

## Potential Root Causes

1. **Vite not proxying WebSocket upgrades** - Despite config, Vite may not be properly upgrading HTTP to WebSocket
2. **Frontend URL construction issue** - WebSocket URL may be malformed or missing components
3. **Gateway upgrade handler not firing** - The `server.on('upgrade')` handler may not be triggered
4. **Authentication failing silently** - Token extraction or validation may be failing without logging
5. **Worker container not ready** - WebSocket endpoint may not exist in worker container
6. **Port/network issue** - Firewall or network configuration blocking WebSocket connections

## Request for Help

Please investigate why WebSocket connections are not being established. Focus on:
1. Determining if WebSocket connection attempts are reaching Vite
2. Verifying Vite is properly proxying WebSocket upgrades to gateway
3. Checking if gateway's upgrade handler is being triggered
4. Understanding why no logs appear for WebSocket activity

Any insights into Vite WebSocket proxy configuration or Node.js http server upgrade event handling would be particularly helpful.
