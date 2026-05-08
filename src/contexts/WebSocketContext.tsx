import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../components/auth/context/AuthContext';
import { IS_PLATFORM } from '../constants/config';

type WebSocketContextType = {
  ws: WebSocket | null;
  sendMessage: (message: any) => void;
  latestMessage: any | null;
  isConnected: boolean;
};

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

const buildWebSocketUrl = (token: string | null) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (IS_PLATFORM) return `${protocol}//${window.location.host}/ws`; // Platform mode: Use same domain as the page (goes through proxy)
  if (!token) return null;

  return `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`; // OSS mode: Vite proxies /ws → SERVER_PORT in dev; in prod the server serves both
};

const useWebSocketProviderState = (): WebSocketContextType => {
  const wsRef = useRef<WebSocket | null>(null);
  const unmountedRef = useRef(false); // Track if component is unmounted
  const hasConnectedRef = useRef(false); // Track if we've ever connected (to detect reconnects)
  const [latestMessage, setLatestMessage] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectCountRef = useRef(0); // Track consecutive reconnection attempts
  const lastConnectTimeRef = useRef<number>(0); // Track when we last successfully connected
  const reconnectDelayRef = useRef(3000); // Current reconnection delay (for exponential backoff)
  const { token } = useAuth();

  const MAX_RECONNECT_ATTEMPTS = 10;
  const INITIAL_RECONNECT_DELAY = 3000;
  const MAX_RECONNECT_DELAY = 30000;
  const STABLE_CONNECTION_THRESHOLD = 30000; // 30 seconds

  // Track real unmount only — must not run on every [token] re-run, otherwise
  // React StrictMode's mount→cleanup→mount cycle leaves unmountedRef permanently
  // true and connect() short-circuits forever.
  useEffect(() => {
    unmountedRef.current = false; // Reset on mount (for React StrictMode remounts)
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token]); // everytime token changes, we reconnect

  const connect = useCallback(() => {
    if (unmountedRef.current) return; // Prevent connection if unmounted
    try {
      // Construct WebSocket URL
      const wsUrl = buildWebSocketUrl(token);

      if (!wsUrl) return console.warn('No authentication token found for WebSocket connection');

      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        const now = Date.now();
        const timeSinceLastConnect = now - lastConnectTimeRef.current;

        // If connection was stable for STABLE_CONNECTION_THRESHOLD, reset reconnect counter
        if (timeSinceLastConnect > STABLE_CONNECTION_THRESHOLD) {
          reconnectCountRef.current = 0;
          reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
          console.log('[WebSocket] Connection stable, reset reconnection counter');
        }

        lastConnectTimeRef.current = now;
        setIsConnected(true);
        wsRef.current = websocket;

        if (hasConnectedRef.current) {
          // This is a reconnect — signal so components can catch up on missed messages
          console.log(`[WebSocket] Reconnected after ${reconnectCountRef.current} attempts, delay was ${reconnectDelayRef.current}ms`);
          setLatestMessage({ type: 'websocket-reconnected', timestamp: now, reconnectCount: reconnectCountRef.current });
        } else {
          console.log('[WebSocket] Initial connection established');
        }
        hasConnectedRef.current = true;
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLatestMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      websocket.onclose = (event) => {
        setIsConnected(false);
        wsRef.current = null;

        const timeSinceConnect = Date.now() - lastConnectTimeRef.current;
        console.log(`[WebSocket] Connection closed (code: ${event.code}, reason: ${event.reason || 'none'}, wasClean: ${event.wasClean}, after ${timeSinceConnect}ms)`);

        // Check if we've hit the reconnection limit
        if (reconnectCountRef.current >= MAX_RECONNECT_ATTEMPTS) {
          console.error(`[WebSocket] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping reconnection attempts.`);
          setLatestMessage({
            type: 'websocket-max-reconnects',
            timestamp: Date.now(),
            attempts: reconnectCountRef.current,
            message: 'WebSocket connection failed after multiple attempts. Please refresh the page or check your connection.'
          });
          return;
        }

        reconnectCountRef.current++;

        // Exponential backoff: double the delay each time, up to MAX_RECONNECT_DELAY
        const currentDelay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, MAX_RECONNECT_DELAY);

        console.log(`[WebSocket] Attempting reconnect #${reconnectCountRef.current} in ${currentDelay}ms`);

        // Attempt to reconnect after delay
        reconnectTimeoutRef.current = setTimeout(() => {
          if (unmountedRef.current) return; // Prevent reconnection if unmounted
          connect();
        }, currentDelay);
      };

      websocket.onerror = (error) => {
        console.error('[WebSocket] Error occurred:', error, 'readyState:', websocket.readyState);
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  }, [token]); // everytime token changes, we reconnect

  const sendMessage = useCallback((message: any) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
    }
  }, []);

  const value: WebSocketContextType = useMemo(() =>
  ({
    ws: wsRef.current,
    sendMessage,
    latestMessage,
    isConnected
  }), [sendMessage, latestMessage, isConnected]);

  return value;
};

export const WebSocketProvider = ({ children }: { children: React.ReactNode }) => {
  const webSocketData = useWebSocketProviderState();
  
  return (
    <WebSocketContext.Provider value={webSocketData}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketContext;
