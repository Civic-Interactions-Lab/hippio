import React, { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { PhaserGame, IRefPhaserGame } from '../../PhaserGame';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { AacFood, AacVerb } from '../../Foods';
import { EventBus } from '../../game/EventBus';
import Leaderboard from '../../components/Leaderboard/Leaderboard';
import styles from './PhaserPage.module.css';
import { GameMode, MODE_CONFIG } from '../../config/gameModes';
import { useNavigate } from 'react-router-dom';
import { updatePlayerInSessionStorage } from '../../components/Storage/Storage';

/**
 * PhaserPage component.
 *
 * Shows the game UI, leaderboard, current food, and runs the core game loop via Phaser.
 * Syncs game state via WebSocket and EventBus.
 */

interface FoodState {
  instanceId: string;
  foodId: string;
  x: number;
  y: number;
  effect: AacVerb | null;
}

const PhaserPage: React.FC = () => {
  // ---- ROUTER & CONTEXT ----
  const { sessionId, userId, role: roleParam } = useParams<{ sessionId: string, userId: string, role?: string }>();
  const location = useLocation();

  // ---- REFS & STATE ----
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const [currentFood, setCurrentFood] = useState<AacFood | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const navigate = useNavigate();
  const [secondsLeft, setSecondsLeft] = useState<number>(60);
  // Store pending target food if scene isn't ready yet
  const [pendingTargetFood, setPendingTargetFood] = useState<{
    targetFoodId: string;
    targetFoodData: AacFood;
    effect: AacVerb | null
  } | null>(null);
  // Audio mute state (retrieve from localStorage or default to false)
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(() => {
    const saved = localStorage.getItem('gameAudioMuted');
    return saved === 'true';
  });

  // Defensive: what if no state? Fallback to false.
  const isSpectator = location.state?.role === 'Spectator';

  const {connectedUsers, lastMessage, sendMessage, clearLastMessage } = useWebSocket();

  // Build color map from connected users
  const colors: Record<string, string> = Object.fromEntries(
    connectedUsers
      .filter(user => typeof user.color === 'string') // remove undefined/null
      .map(user => [user.userId, user.color as string]) // safe to cast now
  );

  // --- ERROR HANDLING ---
  useEffect(() => {
    if (lastMessage?.type === 'ERROR_MESSAGE' && lastMessage?.payload?.code === 'SESSION_NOT_FOUND') {
      alert(`An error occurred: ${lastMessage.payload.message}`);
      clearLastMessage?.();
      navigate('/');
    }
  }, [lastMessage, navigate, clearLastMessage]);

  // --- INITIALIZE PLAYER IN SESSION STORAGE ---
  // This is to ensure the player is registered in session storage
  useEffect(() => {
    const role = location.state?.role || roleParam;
    const color = location.state?.color;

    if (sessionId && userId && role) {
      updatePlayerInSessionStorage(sessionId, { userId, role, color });
    }
  }, [sessionId, userId, roleParam, location.state]);

  // --- JOIN on MOUNT ---
  useEffect(() => {
    const stored = localStorage.getItem('playerSession');
    const storedData = stored ? JSON.parse(stored) : {};
    const role = location.state?.role;
    const color = storedData.color || location.state?.color;
    const alreadyJoined = connectedUsers.some(
      (u) => u.userId === userId && u.role === role
    );

    if (sessionId && userId && role && !alreadyJoined) {
      // Defensive: avoid double joining as both.
      if (role === 'Spectator') {
        sendMessage({
          type: 'SPECTATOR_JOIN',
          payload: { sessionId, userId }
        });
      } else {
        sendMessage({
          type: 'PLAYER_JOIN',
          payload: { sessionId, userId, role }
        });

        if (color) {
          sendMessage({
            type: 'SELECT_COLOR',
            payload: { sessionId, userId, color }
          });
        }
      }
    }
  }, [sessionId, userId, location.state?.role, roleParam, sendMessage, connectedUsers]);

  // --- REMOTE PLAYER MOVEMENT SYNC ---
  useEffect(() => {
    if (lastMessage?.type === 'PLAYER_MOVE_BROADCAST') {
      const { userId: movingUserId, x, y } = lastMessage.payload;
      if (movingUserId !== userId) {
        const scene = phaserRef.current?.scene as any;
        if (scene && typeof scene.updateRemotePlayer === 'function') {
          scene.updateRemotePlayer(movingUserId, x, y);
        }
      }
      if (clearLastMessage) clearLastMessage();
    }
  }, [lastMessage, userId, clearLastMessage]);

  // --- GAME MODE BROADCAST ---
  useEffect(() => {
    if (lastMessage?.type === 'START_GAME_BROADCAST') {
      const { mode } = lastMessage.payload as { mode: GameMode };
      const settings = MODE_CONFIG[mode];
      const scene = phaserRef.current?.scene as any;
      setGameMode(mode); 
      if (scene && typeof scene.applyModeSettings === 'function') {
        scene.applyModeSettings(settings);
      }
      clearLastMessage?.();
    }
  }, [lastMessage, clearLastMessage]);

  // --- FOOD STATE SYNC ---
  useEffect(() => {
    // Handle food state updates
    if (lastMessage?.type === 'FOOD_STATE_UPDATE') {
      const { foods } = lastMessage.payload as { foods: FoodState[] };
      EventBus.emit('sync-food-state', foods);
    }

    // When a new food is set as target
    if (lastMessage?.type === 'AAC_TARGET_FOOD') {
      const { targetFoodId, targetFoodData, effect } = lastMessage.payload;
      const scene = phaserRef.current?.scene as any;
      if (scene && typeof scene.setTargetFood === 'function') {
        if (effect) {
          scene.setTargetFood(targetFoodId, effect);
        } else {
          scene.setTargetFood(targetFoodId);
        }
        // Scene is ready, clear any pending target
        setPendingTargetFood(null);
      } else {
        // Scene not ready, store target for later
        setPendingTargetFood({ targetFoodId, targetFoodData, effect });
      }
      if (targetFoodData) {
        setCurrentFood(targetFoodData);
        // Play audio for the target food if not muted
        if (!isAudioMuted && targetFoodData.audioPath) {
          const audio = new Audio(targetFoodData.audioPath);
          audio.play().catch((error) => {
            console.error('[PhaserPage] Error playing target food audio:', error);
          });
        }
      }
      clearLastMessage?.();
    }

    // When a food has been eaten, remove it from the scene
    if (lastMessage?.type === 'REMOVE_FOOD') {
      const { instanceId } = lastMessage.payload;
      const scene = phaserRef.current?.scene as any;
      if (scene && typeof scene.removeFoodByInstanceId === 'function') {
        scene.removeFoodByInstanceId(instanceId);
      }
      clearLastMessage?.();
    }

    // When a player effect is broadcasted, apply it
    if (lastMessage?.type === 'PLAYER_EFFECT_BROADCAST') {
      const { targetUserId, effect } = lastMessage.payload as { targetUserId: string, effect: AacVerb };
      EventBus.emit('apply-player-effect', { targetUserId, effect });
      clearLastMessage?.();
    }
  }, [lastMessage, clearLastMessage, isAudioMuted]);

  // --- FRUIT EATEN LOCAL (EMITTED FROM PHASER) ---
  useEffect(() => {
    const handleFruitEaten = ({ instanceId }: { instanceId: string }) => {
      if (sessionId) {
        sendMessage({
          type: 'FRUIT_EATEN',
          payload: { sessionId, instanceId }
        });
      }
    };
    EventBus.on('fruit-eaten', handleFruitEaten);
    return () => {
      EventBus.off('fruit-eaten', handleFruitEaten);
    };
  }, [sendMessage, sessionId]);

  // --- APPLY PENDING TARGET FOOD WHEN SCENE IS READY ---
  useEffect(() => {
    if (pendingTargetFood && phaserRef.current?.scene) {
      const scene = phaserRef.current.scene as any;
      if (scene && typeof scene.setTargetFood === 'function') {
        const { targetFoodId, effect } = pendingTargetFood;
        if (effect) {
          scene.setTargetFood(targetFoodId, effect);
        } else {
          scene.setTargetFood(targetFoodId);
        }
        setPendingTargetFood(null);
      }
    }
  }, [pendingTargetFood, phaserRef.current]);

  // --- SCORE UPDATE BROADCAST (EVENTBUS) ---
  useEffect(() => {
    const handleScoreUpdate = ({ scores }: { scores: Record<string, number> }) => {
      setScores(scores);
    };
    EventBus.on('scoreUpdate', handleScoreUpdate);
    return () => {
      EventBus.off('scoreUpdate', handleScoreUpdate);
    };
  }, []);

  useEffect(() => {
    const handleTimerUpdate = (time: number) => {
      setSecondsLeft(time);
    };
    EventBus.on('TIMER_UPDATE', handleTimerUpdate);
    return () => {
      EventBus.off('TIMER_UPDATE', handleTimerUpdate);
    };
  }, []);


  // If GAME_OVER navigate to victory route.
  // Also, pass the scores and colors of connected users to the Victory page.
  // If sessionId is not present, navigate to home.
  useEffect(() => {
    const handleGameOver = () => {
      const colors = Object.fromEntries(
        connectedUsers
          .filter(user => user.color)
          .map(user => [user.userId, user.color])
      );

      console.log('[PhaserPage] Game Over received. Navigating to Victory screen.');
      if (sessionId) {
        navigate(`/victory/${sessionId}`, { state: { scores, colors, sessionId, userId } });
      } else {
        navigate('/');
      }
    };

    EventBus.on('gameOver', handleGameOver);

    return () => {
      EventBus.off('gameOver', handleGameOver);
    };
  }, [navigate, sessionId, scores, connectedUsers]);

  useEffect(() => {
    const handleEdgesReady = (edges: Record<string, string>) => {
      if (
        sessionId &&
        userId &&
        location.state?.role !== 'Spectator' &&
        edges?.[userId]
      ) {
        const userEdge = edges[userId];
        if (userEdge) {
          // Update player edge in session storage
          updatePlayerInSessionStorage(sessionId, { userId, role: 'Hippo Player', edge: userEdge });
        }
        sendMessage({
          type: 'SET_EDGE',
          payload: {
            sessionId,
            userId,
            edge: userEdge
          },
        });
      }
    };

    EventBus.on('edges-ready', handleEdgesReady);

    return () => {
      EventBus.off('edges-ready', handleEdgesReady);
    };
  }, [sendMessage, sessionId, userId, location.state?.role]);

  // Check local storage for player edge
  let localPlayerEdge: string | undefined;
  if (sessionId && userId) {
    try {
      const stored = localStorage.getItem('playerSessions');
      const allSessions = stored ? JSON.parse(stored) : {};
      const playersInSession = allSessions[sessionId] || [];
      const currentPlayer = playersInSession.find((p: { userId: string; edge?: string }) => p.userId === userId);
      if (currentPlayer && currentPlayer.edge) {
        localPlayerEdge = currentPlayer.edge;
      }
    } catch (e) {
      console.error('Failed to read player edge from storage', e);
    }
  }

  // Audio toggle handler
  const toggleAudio = () => {
    const newMutedState = !isAudioMuted;
    setIsAudioMuted(newMutedState);
    localStorage.setItem('gameAudioMuted', String(newMutedState));

    // Notify the game scene about the audio state change
    const scene = phaserRef.current?.scene as any;
    if (scene && typeof scene.setAudioMuted === 'function') {
      scene.setAudioMuted(newMutedState);
    }
  };

  // ---- RENDER ----
  return (
    <div className={styles.pageWrapper}>
      {/* Game Canvas */}
      <div className={styles.canvasWrapper}>
        <PhaserGame
          ref={phaserRef}
          currentActiveScene={(scene: Phaser.Scene) => {
            if (
              scene &&
              userId &&
              connectedUsers &&
              typeof (scene as any).init === 'function'
            ) {
              (scene as any).init({
                sendMessage,
                localPlayerId: userId,
                sessionId,
                connectedUsers,
                modeSettings: gameMode ? MODE_CONFIG[gameMode] : undefined,
                role: location.state?.role,
                localPlayerEdge: localPlayerEdge,
              });
            }
          }}
        />
      </div>

      {/* Sidebar */}
      <div className={styles.sidebarWrapper}>
        <div className={styles.sidebar}>
          {isSpectator && (
            <div className={styles.spectatorBanner} role="status" aria-label="Spectator Mode Banner">
              <span className={styles.spectatorText}>
              <span className={styles.spectatorHighlight}>Spectator Mode</span>
              </span>
            </div>
          )}

          <div className={styles.timerBox}>
            <h3 className={styles.timerTitle}>Time Left:</h3>
            <div className={styles.timerValue}>{secondsLeft} sec</div>
          </div>

          <button
            className={styles.audioToggleButton}
            onClick={toggleAudio}
            aria-label={isAudioMuted ? 'Unmute audio' : 'Mute audio'}
          >
            {isAudioMuted ? '🔇 Audio Off' : '🔊 Audio On'}
          </button>

          <div className={styles.currentFood}>
            <h3>Current Food to Eat:</h3>
            {currentFood ? (
              <>
                <img src={currentFood.imagePath} alt={currentFood.name} className={styles.foodImage} />
                <p>{currentFood.name}</p>
              </>
            ) : (
              <p>No Food Selected</p>
            )}
          </div>

          <div className={styles.leaderboardBox}>
          <Leaderboard scores={scores} colors={colors} userId={userId ?? ''} />
          </div>
        </div>
      </div>
    </div>
  );
}
export default PhaserPage;