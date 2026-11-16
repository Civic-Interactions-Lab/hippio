import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { movementStore } from '../game/scenes/MovementStore';
import { EventBus } from '../game/EventBus';

// A function that receives every server message of the type it subscribed to
export type MessageListener = (message: any) => void;

interface IWebSocketContext {
  isConnected: boolean;
  sendMessage: (message: object) => void;
  subscribe: (type: string, listener: MessageListener) => () => void;
  connectedUsers: { userId: string; role: string; color?: string }[];
  gameStarted: boolean;
  resetGameState: () => void;
  gameMode: 'Easy' | 'Medium' | 'Hard' | null;
  isReconnecting: boolean;
}

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10000;
const MAX_QUEUED_MESSAGES = 50;
// Movement updates are sent constantly and go stale quickly, so they are dropped instead of queued
const UNQUEUED_TYPES = new Set(['PLAYER_MOVE']);

/**
 * How long to wait before reconnect attempt number `attempt` (0 = first try).
 * Doubles each time: 0.5s, 1s, 2s, 4s, 8s, then stays at 10s.
 */
export function getReconnectDelay(attempt: number): number {
  return Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
}

const WebSocketContext = createContext<IWebSocketContext | null>(null);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  // Listeners for each message type, called directly as messages arrive (not through React state)
  const listeners = useRef(new Map<string, Set<MessageListener>>());
  const [connectedUsers, setConnectedUsers] = useState<{ userId: string; role: string; color?: string }[]>([]);
  const ws = useRef<WebSocket | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<'Easy' | 'Medium' | 'Hard' | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  // Messages sent while disconnected, waiting to be sent once the socket opens
  const pendingMessages = useRef<string[]>([]);

  useEffect(() => {
    const WSS_URL = import.meta.env.VITE_WSS_URL || 'ws://localhost:4000';
    let stopped = false; // true once this provider unmounts, so we stop reconnecting
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const socket = new WebSocket(WSS_URL);
      ws.current = socket;

      socket.onopen = () => {
        //console.log('[WS_CONTEXT] Connection established.');
        attempt = 0;
        setIsConnected(true);
        setIsReconnecting(false);

        // Attempt to restore session from localStorage
        try {
          const pathParts = window.location.pathname.split('/');
          const urlSessionId = pathParts[2];
          const urlUserId = pathParts[3];

          if (urlSessionId && urlUserId) {
            const stored = localStorage.getItem('playerSessions');
            const allSessions = stored ? JSON.parse(stored) : {};
            const playersInSession = allSessions[urlSessionId];

            if (playersInSession && playersInSession.length > 0) {
            
              const playerToRejoin = playersInSession.find((p: { userId: string; role: string; color?: string }) => p.userId === urlUserId);

              if (playerToRejoin) {
                console.log(`[WS_CONTEXT] Found previous player data. Attempting to rejoin as ${playerToRejoin.userId}`);
              
                socket.send(
                  JSON.stringify({
                    type: 'PLAYER_JOIN', 
                    payload: {
                      sessionId: urlSessionId,
                      userId: playerToRejoin.userId,
                      role: playerToRejoin.role,
                      color: playerToRejoin.color,
                      isReconnecting: true
                    },
                  })
                );
              }
            }
          }
        } catch (err) {
          console.error('Failed to restore session from storage', err);
        }

        // Send anything that was queued while disconnected, in the original order
        const queued = pendingMessages.current;
        pendingMessages.current = [];
        queued.forEach((msg) => socket.send(msg));
      };

      socket.onclose = () => {
        // Ignore an old socket closing after a newer one replaced it
        if (ws.current !== socket) return;
        setIsConnected(false);
        if (stopped) return;

        // Try again after a delay that grows with each failed attempt
        const delay = getReconnectDelay(attempt);
        attempt++;
        setIsReconnecting(true);
        console.warn(`[WS_CONTEXT] Connection lost. Reconnecting in ${delay}ms...`);
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        // console.log('[WS_CONTEXT] Message from server:', data);

        // Hand the message to every page that subscribed to this type.
        // Each message is delivered on its own, so two messages arriving together are both seen.
        listeners.current.get(data.type)?.forEach((listener) => {
          try {
            listener(data);
          } catch (err) {
            console.error(`[WS_CONTEXT] Error handling ${data.type}:`, err);
          }
        });

        if (data.type === 'ERROR_MESSAGE') {
          console.error('[WS_CONTEXT] Received error from server:', data.payload.message);
          return;
        }

        if (data.type === 'TIMER_UPDATE') {
         // console.log(`[WS_CONTEXT] Timer update: ${data.secondsLeft} seconds left`);
          EventBus.emit('TIMER_UPDATE', data.secondsLeft);
          return;
        }

        if (data.type === 'LAUNCH_FOOD') {
          const { foodKey, angle } = data.payload;
          //console.log(`[WS_CONTEXT] Received LAUNCH_FOOD → ${foodKey}, angle ${angle}`);
          EventBus.emit('launch-food', { foodKey, angle });  // 👈 Send to Phaser
          return;
        }
      
        //update playermovement on socket
       if (data.type === 'PLAYER_MOVE_BROADCAST') {
         movementStore.notifyMove(data.payload);
         return;
        }

        if (data.type === 'START_GAME_BROADCAST') {
        //  console.log('[WS_CONTEXT] Game started!');
          setGameStarted(true);
          if (data.payload?.mode) {
            setGameMode(data.payload.mode);
          }

          EventBus.emit('start-game');
          return;
        }

        if (data.type === 'SESSION_VALIDATED') {
          setSessionId(data.payload.gameCode);
        }

        if(data.type === 'SESSION_CREATED') {
          setSessionId(data.payload.sessionId);
        }

        if (data.type === 'SCORE_UPDATE_BROADCAST') {
          //console.log('[WS_CONTEXT] Received SCORE_UPDATE_BROADCAST:', data.payload.scores);
          EventBus.emit('scoreUpdate', data.payload);
          return;
        }

        if (data.type === 'GAME_OVER') {
          //console.log('[WS_CONTEXT] GAME_OVER');
          EventBus.emit('gameOver', data.payload);
          return;
        }

        if (data.type === 'RESET_GAME_BROADCAST') {
          console.log('[WS_CONTEXT] Game reset received.');
          setGameStarted(false);
          EventBus.emit('RESET_GAME');
          return;
        }

        if (data.type === 'USERS_LIST_UPDATE') {
          console.log('[WS_CONTEXT] Users updated from local storage:', data.payload.users);
          setConnectedUsers(data.payload.users);
          EventBus.emit('players-updated', data.payload.users);
          return;
        }

      };

      socket.onerror = (err) => {
        console.error('[WS_CONTEXT] WebSocket error:', err);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws.current?.close();
    };
  }, []);

  /**
   * Calls `listener` with every message of `type` the server sends.
   * Returns a function that stops listening.
   */
  const subscribe = useCallback((type: string, listener: MessageListener) => {
    let forType = listeners.current.get(type);
    if (!forType) {
      forType = new Set();
      listeners.current.set(type, forType);
    }
    forType.add(listener);
    return () => {
      forType!.delete(listener);
    };
  }, []);

  const sendMessage = useCallback((message: object) => {
    const text = JSON.stringify(message);
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(text);
      return;
    }

    const type = (message as { type?: string }).type;
    if (type && UNQUEUED_TYPES.has(type)) return;

    // Not connected yet: hold the message and send it once the socket opens
    if (pendingMessages.current.length >= MAX_QUEUED_MESSAGES) {
      pendingMessages.current.shift(); // drop the oldest to cap memory
    }
    pendingMessages.current.push(text);
    console.warn(`[WS_CONTEXT] Not connected. Queued ${type ?? 'message'} until the connection opens.`);
  }, []);

  // Method to start timer
  const startTimer = useCallback(() => {
    if (!sessionId) {
      console.error('No sessionId set; cannot start timer.');
      return;
    }
    sendMessage({ type: 'START_TIMER', payload: { sessionId } });
  }, [sendMessage, sessionId]);


  // Method to reset game state
  const resetGameState = useCallback(() => {
    setGameStarted(false);
  }, []);

  const value = {
    isConnected,
    sendMessage,
    subscribe,
    startTimer,
    connectedUsers,
    gameStarted,
    sessionId,
    resetGameState,
    gameMode,
    isReconnecting
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

// Custom hook for easy access to the context
export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

/**
 * Runs `handler` for every message of `type` from the server while the component is mounted.
 * The handler always sees the component's latest props and state.
 *
 * Example: useMessage('REMOVE_FOOD', (message) => removeFood(message.payload.instanceId));
 */
export function useMessage(type: string, handler: MessageListener) {
  const { subscribe } = useWebSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => subscribe(type, (message) => handlerRef.current(message)), [type, subscribe]);
}
