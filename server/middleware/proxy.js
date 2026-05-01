import { createProxyMiddleware as createHttpProxy } from 'http-proxy-middleware';
import { containerManager } from '../container/manager.js';

// Cache proxy instances per user. Keyed by userId, value: { port, proxy }.
// Invalidated when the container port changes (e.g. after a recreate).
const userProxyCache = new Map();

/**
 * Create proxy middleware for routing requests to user containers.
 *
 * Express strips the mount-point prefix from req.url before handing off to
 * middleware, so a request for /api/projects/list arrives here with
 * req.url === '/list'. We use req.originalUrl in pathRewrite to restore the
 * full path so the container receives /api/projects/list as expected.
 */
export function createProxyMiddleware() {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        console.error('[ProxyMiddleware] No userId found in request');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      console.log(`[ProxyMiddleware] Incoming: ${req.method} ${req.originalUrl}, userId=${userId}`);

      let containerInfo;
      try {
        containerInfo = await containerManager.ensureRunning(userId);
      } catch (error) {
        console.error(`[ProxyMiddleware] Failed to ensure container for user ${userId}:`, error.message);
        return res.status(503).json({
          error: 'Container unavailable',
          message: 'Failed to start your development container. Please try again.',
          details: error.message
        });
      }

      const port = containerInfo.internalPort;
      const target = `http://localhost:${port}`;

      console.log(`[ProxyMiddleware] Routing user ${userId} → ${target}${req.originalUrl}`);

      // Reuse a cached proxy for this user as long as the port hasn't changed.
      let cached = userProxyCache.get(userId);
      if (!cached || cached.port !== port) {
        const proxy = createHttpProxy({
          target,
          changeOrigin: true,
          ws: true,
          timeout: 30000,
          proxyTimeout: 30000,

          // Restore the full path that Express stripped when matching the mount point.
          pathRewrite: (_path, req) => req.originalUrl,

          onError: (err, req, res) => {
            console.error(`[ProxyMiddleware] Error for user ${userId}: ${err.message}`);
            if (res.headersSent) return;
            res.status(502).json({
              error: 'Container communication error',
              message: 'Failed to communicate with your development container.',
              details: err.message
            });
          },

          onProxyReq: (proxyReq, req) => {
            proxyReq.setHeader('X-CloudCLI-User-ID', userId);
            if (req.headers.host) {
              proxyReq.setHeader('X-Forwarded-Host', req.headers.host);
            }
          },

          onProxyRes: (proxyRes) => {
            proxyRes.headers['X-Proxied-By'] = 'CloudCLI-Gateway';
          },

          onProxyReqWs: (proxyReq) => {
            proxyReq.setHeader('X-CloudCLI-User-ID', userId);
          },
        });

        cached = { port, proxy };
        userProxyCache.set(userId, cached);
        console.log(`[ProxyMiddleware] Created new proxy for user ${userId} → port ${port}`);
      }

      cached.proxy(req, res, next);

    } catch (error) {
      console.error('[ProxyMiddleware] Unexpected error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
          message: 'An unexpected error occurred while routing your request.'
        });
      }
    }
  };
}

/**
 * Invalidate the cached proxy for a user (e.g. after container recreation).
 */
export function invalidateUserProxy(userId) {
  userProxyCache.delete(userId);
}

/**
 * WebSocket proxy handler — called on HTTP upgrade events.
 */
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

/**
 * Health check endpoint (bypasses proxy).
 */
export function healthCheckMiddleware(req, res, next) {
  if (req.path === '/health' || req.path === '/api/health') {
    return res.json({
      status: 'healthy',
      service: 'cloudcli-gateway',
      timestamp: new Date().toISOString()
    });
  }
  next();
}
