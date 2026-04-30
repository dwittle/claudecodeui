import { createProxyMiddleware as createHttpProxy } from 'http-proxy-middleware';
import { containerManager } from '../container/manager.js';

/**
 * Create proxy middleware for routing requests to user containers
 * This middleware:
 * 1. Extracts user ID from authenticated request (req.user.id)
 * 2. Ensures user's container is running
 * 3. Proxies the request to the container's internal port
 * 4. Handles errors and container unavailability
 *
 * @returns {Function} Express middleware
 */
export function createProxyMiddleware() {
  return async (req, res, next) => {
    try {
      // User ID should be set by authenticateToken middleware
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Ensure container is running (creates if needed, starts if stopped)
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

      // Build target URL
      const target = `http://localhost:${containerInfo.internalPort}`;

      console.log(`[ProxyMiddleware] Proxying request from user ${userId} to ${target}${req.path}`);

      // Create proxy for this request
      const proxy = createHttpProxy({
        target,
        changeOrigin: true,
        ws: true, // Enable WebSocket support
        timeout: 30000, // 30 second timeout
        proxyTimeout: 30000,

        // Handle proxy errors
        onError: (err, req, res) => {
          console.error(`[ProxyMiddleware] Proxy error for user ${userId}:`, err.message);

          // Check if response already sent
          if (res.headersSent) {
            return;
          }

          res.status(502).json({
            error: 'Container communication error',
            message: 'Failed to communicate with your development container.',
            details: err.message
          });
        },

        // Log successful proxy
        onProxyReq: (proxyReq, req, res) => {
          // Forward user information in headers (for container logging)
          proxyReq.setHeader('X-CloudCLI-User-ID', userId);

          // Preserve original host
          if (req.headers.host) {
            proxyReq.setHeader('X-Forwarded-Host', req.headers.host);
          }
        },

        // Log proxy response
        onProxyRes: (proxyRes, req, res) => {
          // Optional: Add header to indicate proxied response
          proxyRes.headers['X-Proxied-By'] = 'CloudCLI-Gateway';
        },

        // WebSocket upgrade handler
        onProxyReqWs: (proxyReq, req, socket, options, head) => {
          console.log(`[ProxyMiddleware] WebSocket upgrade for user ${userId}`);

          // Forward user information
          proxyReq.setHeader('X-CloudCLI-User-ID', userId);
        },

        // WebSocket error handler
        onError: (err, req, socket) => {
          console.error(`[ProxyMiddleware] WebSocket error for user ${userId}:`, err.message);
          socket.end();
        }
      });

      // Execute proxy
      proxy(req, res, next);

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
 * Create WebSocket proxy handler
 * Called when WebSocket upgrade is requested
 *
 * @param {Object} server - HTTP server instance
 * @param {Function} authenticateWs - Function to authenticate WebSocket connections
 */
export function setupWebSocketProxy(server, authenticateWs) {
  server.on('upgrade', async (req, socket, head) => {
    try {
      // Parse URL to check if this is a proxied route
      const url = new URL(req.url, `http://${req.headers.host}`);

      // Only handle specific WebSocket routes that should be proxied
      const proxyRoutes = ['/api/terminal', '/api/sessions', '/ws'];
      const shouldProxy = proxyRoutes.some(route => url.pathname.startsWith(route));

      if (!shouldProxy) {
        // Let other handlers deal with it
        return;
      }

      // Authenticate WebSocket connection
      const user = await authenticateWs(req);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const userId = user.userId;

      // Ensure container is running
      let containerInfo;
      try {
        containerInfo = await containerManager.ensureRunning(userId);
      } catch (error) {
        console.error(`[WebSocketProxy] Failed to ensure container for user ${userId}:`, error.message);
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }

      // Create WebSocket proxy
      const target = `ws://localhost:${containerInfo.internalPort}`;
      console.log(`[WebSocketProxy] Proxying WebSocket for user ${userId} to ${target}`);

      const wsProxy = createHttpProxy({
        target,
        ws: true,
        changeOrigin: true,

        onError: (err) => {
          console.error(`[WebSocketProxy] Error for user ${userId}:`, err.message);
          socket.destroy();
        },

        onProxyReqWs: (proxyReq, req, socket) => {
          proxyReq.setHeader('X-CloudCLI-User-ID', userId);
        }
      });

      wsProxy.upgrade(req, socket, head);

    } catch (error) {
      console.error('[WebSocketProxy] Unexpected error:', error);
      socket.destroy();
    }
  });
}

/**
 * Health check endpoint (bypasses proxy)
 * Returns gateway health status
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
