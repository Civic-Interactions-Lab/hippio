import React, { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { PhaserGame, IRefPhaserGame } from '../../PhaserGame';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { AacFood } from '../../Foods';
import { EventBus } from '../../game/EventBus';
import Leaderboard from '../../components/Leaderboard/Leaderboard';
import styles from './PhaserPage.module.css';
import { GameMode, MODE_CONFIG } from '../../config/gameModes';
import { useNavigate } from 'react-router-dom';
/**
 * PhaserPage component.
 *
 * Shows the game UI, leaderboard, current food, and runs the core game loop via Phaser.
 * Syncs game state via WebSocket and EventBus.
 */
const PhaserPage: React.FC = () => {
  // ---- ROUTER & CONTEXT ----
  const { sessionId, userId } = useParams<{ sessionId: string, userId: string }>();
  const location = useLocation();

  // ---- REFS & STATE ----
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const [currentFood, setCurrentFood] = useState<AacFood | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const navigate = useNavigate(); 

  // Defensive: what if no state? Fallback to false.
  const isSpectator = location.state?.role === 'Spectator';

  // ---- WEBSOCKET ----
  const {connectedUsers, lastMessage, sendMessage, clearLastMessage } = useWebSocket();

  // Build color map from connected users
  const colors: Record<string, string> = Object.fromEntries(
    connectedUsers
      .filter(user => typeof user.color === 'string') // remove undefined/null
      .map(user => [user.userId, user.color as string]) // safe to cast now
  );

  // --- JOIN on MOUNT ---
  useEffect(() => {
    const role = location.state?.role;
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
      }
    }
  }, [sessionId, userId, location.state?.role, sendMessage, connectedUsers]);
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

  // --- FOOD LAUNCH & FRUIT EATEN BROADCAST ---
  useEffect(() => {
    if (lastMessage?.type === 'FOOD_SELECTED_BROADCAST') {
      const { launches, targetFoodId, targetFoodData } = lastMessage.payload as {
        launches: { foodId: string; angle: number }[];
        targetFoodId: string;
        targetFoodData: AacFood;
      };
      const scene = phaserRef.current?.scene as any;
      if (Array.isArray(launches)) {
        const launchesPerSet = 3;
        launches.forEach(({ foodId, angle }, index) => {
          const setIndex = index % launchesPerSet;
          setTimeout(() => {
            if (scene && typeof scene.addFoodManually === 'function') {
              scene.addFoodManually(foodId, angle);
            }
          }, setIndex * 1000); // delay
        });
      }
      if (typeof scene.setTargetFood === 'function') {
        scene.setTargetFood(targetFoodId);
      }
      if (targetFoodData) setCurrentFood(targetFoodData);
      clearLastMessage?.();
    }

    if (lastMessage?.type === 'FRUIT_EATEN_BROADCAST') {
      const { foodId, x, y } = lastMessage.payload;
      const scene = phaserRef.current?.scene as any;
      if (scene && typeof scene.removeFruitAt === 'function') {
        scene.removeFruitAt(foodId, x, y);
      }
    }
  }, [lastMessage, clearLastMessage]);

  // --- FRUIT EATEN LOCAL (EMITTED FROM PHASER) ---
  useEffect(() => {
    const handleFruitEaten = ({ foodId, x, y }: { foodId: string; x: number; y: number }) => {
      if (sessionId) {
        sendMessage({
          type: 'FRUIT_EATEN',
          payload: { sessionId, foodId, x, y }
        });
      }
    };
    EventBus.on('fruit-eaten', handleFruitEaten);
    return () => {
      EventBus.off('fruit-eaten', handleFruitEaten);
    };
  }, [sendMessage, sessionId]);

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
        navigate(`/victory/${sessionId}`, { state: { scores, colors } });
      } else {
        navigate('/');
      }
    };

    EventBus.on('gameOver', handleGameOver);

    return () => {
      EventBus.off('gameOver', handleGameOver);
    };
  }, [navigate, sessionId, scores, connectedUsers]);


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
            });

            // Only non-spectators need edges assigned
            if (location.state?.role !== 'Spectator') {
              const edges = (scene as any).getEdgeAssignments?.();
              if (edges && edges[userId]) {
                sendMessage({
                  type: 'SET_EDGE',
                  payload: {
                    sessionId,
                    userId,
                    edge: edges[userId],
                  },
                });
              }
            }
          }
        }}
      />
    </div>

    {/* Sidebar */}
    <div className={styles.sidebar}>
      {isSpectator && (
        <div className={styles.spectatorBanner} role="status" aria-label="Spectator Mode Banner">
          <span className={styles.spectatorText}>
           <span className={styles.spectatorHighlight}>Spectator Mode</span>
          </span>
        </div>
      )}
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
);
}
export default PhaserPage;