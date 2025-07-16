import React, { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { PhaserGame, IRefPhaserGame } from '../../PhaserGame';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { AacFood } from '../../Foods';
import { EventBus } from '../../game/EventBus';
import Leaderboard from '../../components/Leaderboard/Leaderboard';
import styles from './PhaserPage.module.css';
import { GameMode, MODE_CONFIG } from '../../config/gameModes';
/**
 * PhaserPage component.
 *
 * Displays the Phaser game canvas and shows the currently selected food visually.
 * Listens to WebSocket messages to update the game scene with the latest selected food.
 *
 * @component
 * @returns {JSX.Element} The rendered Phaser game interface with current food indicator.
 */
const PhaserPage: React.FC = () => {
  /**
   * Extract sessionId and userId from the URL parameters.
   */
  const { sessionId, userId } = useParams<{ sessionId: string, userId: string }>();

  /**
   * Access the React Router location object to get passed state (including user role).
   */
  const location = useLocation();

  /**
   * Ref to the PhaserGame component instance, to call Phaser scene methods.
   */
  const phaserRef = useRef<IRefPhaserGame | null>(null);

  /**
   * Holds the currently selected food object to display.
   */
  const [currentFood, setCurrentFood] = useState<AacFood | null>(null);

  const [scores, setScores] = useState<Record<string, number>>({});

  /**
   * WebSocket context values: lastMessage received, sendMessage function, and a function to clear last message.
   */
  const {connectedUsers, lastMessage, sendMessage, clearLastMessage } = useWebSocket();

  const [gameMode, setGameMode] = useState<GameMode | null>(null);

  /**
   * Effect hook to send a "PLAYER_JOIN" message over WebSocket when component mounts,
   * informing the server about the player's session, userId, and role.
   *
   * Dependencies:
   * - sessionId, userId: URL parameters identifying player/session.
   * - location.state?.role: User role passed in navigation state.
   * - sendMessage: WebSocket send function.
   */
  useEffect(() => {
    const role = location.state?.role;
    if (sessionId && userId && role) {
      sendMessage({
        type: 'PLAYER_JOIN',
        payload: { sessionId, userId, role }
      });
    }
  }, [sessionId, userId, location.state?.role, sendMessage]);



  // useEffect(() => {
  //   const scene = phaserRef.current?.scene as any;
  
  //   if (scene && userId && connectedUsers) {
  //     scene.init({
  //       sendMessage,
  //       localPlayerId: userId,
  //       connectedUsers
  //     });
  //   }
  // }, [phaserRef.current?.scene, sendMessage, userId, connectedUsers]);


  useEffect(() => {
  if (lastMessage?.type === 'PLAYER_MOVE_BROADCAST') {
    const { userId: movingUserId, x, y } = lastMessage.payload;

    // Avoid updating local player
    if (movingUserId !== userId) {
      const scene = phaserRef.current?.scene as any;
      if (scene && typeof scene.updateRemotePlayer === 'function') {
        scene.updateRemotePlayer(movingUserId, x, y);
      }
    }

    if (clearLastMessage) clearLastMessage();
  }
}, [lastMessage, userId, clearLastMessage]);


  // If the server broadcasts a game start message, apply mode settings
  // to the Phaser scene.
  useEffect(() => {
    if (lastMessage?.type === 'START_GAME_BROADCAST') {
      const { mode } = lastMessage.payload as { mode: GameMode };
      const settings = MODE_CONFIG[mode];
      const scene = phaserRef.current?.scene as any;
      console.log(`[PhaserPage] Applying mode settings for "${mode}":`, settings);

      setGameMode(mode); 

      if (scene && typeof scene.applyModeSettings === 'function') {
        scene.applyModeSettings(settings);
      }

      clearLastMessage?.();
    }

  }, [lastMessage, clearLastMessage]);

  
    // Listens for broadcasts from the server about food selection
    useEffect(() => {
        if (lastMessage?.type === 'FOOD_SELECTED_BROADCAST') {
        const { launches, targetFoodId, targetFoodData } = lastMessage.payload as {
          launches: { foodId: string; angle: number }[];
          targetFoodId: string;
          targetFoodData: AacFood;
        };

        const scene = phaserRef.current?.scene as any;

        if (Array.isArray(launches)) {
          const launchesPerSet = 3; // 3 foods per hippo player
          launches.forEach(({ foodId, angle }, index) => {
            const setIndex = index % launchesPerSet;
            setTimeout(() => {
              if (scene && typeof scene.addFoodManually === 'function') {
                scene.addFoodManually(foodId, angle);
              }
            }, setIndex * 400); // delay: 0ms, 400ms, 800ms
          });
        }

        if (typeof scene.setTargetFood === 'function') {
          scene.setTargetFood(targetFoodId);
        }

        if (targetFoodData) {
          setCurrentFood(targetFoodData);
        }

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
    

    /**
     * Listens for fruit-eaten events emitted from the Phaser scene,
     * and sends a WebSocket message to the server with fruit info.
    */
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

    useEffect(() => {
      const handleScoreUpdate = ({ scores }: { scores: Record<string, number> }) => {
        setScores(scores);
      };
      console.log('[PhaserPage] Updating scores from EventBus:', scores);
      
      EventBus.on('scoreUpdate', handleScoreUpdate);

      return () => {
        EventBus.off('scoreUpdate', handleScoreUpdate);
      };
    }, []);


  /**
   * Render the PhaserGame component and the current food indicator UI.
   */
  return (
    <div className={styles.pageWrapper}>
    <div className={styles.canvasWrapper}>
      <PhaserGame ref={phaserRef} currentActiveScene={(scene: Phaser.Scene) => {
        if (scene && userId && connectedUsers && typeof (scene as any).init === 'function') {
          (scene as any).init({
            sendMessage,
            localPlayerId: userId,
            sessionId,
            connectedUsers,
            modeSettings: gameMode ? MODE_CONFIG[gameMode] : undefined, 
          });

          // Sends assigned edge to server
          const edges = (scene as any).getEdgeAssignments?.();
          if (edges && edges[userId]) {
            sendMessage({
              type: 'SET_EDGE',
              payload: {
                sessionId,
                userId,
                edge: edges[userId],
              }
            });
          }
        }
      }} />
    </div>

    <div className={styles.sidebar}>
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
        <Leaderboard scores={scores} />
      </div>
    </div>
  </div>
  );
};

export default PhaserPage;
