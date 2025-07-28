import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './Victory.module.css';
import ButtonClick from '../../components/ButtonClick/ButtonClick';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { EventBus } from '../../game/EventBus';

const Victory: React.FC = () => {
    /**
     * Access the current location object.
     */
  const location = useLocation();
    /**
     * Extracts scores from the location state
     * empty object if DNE.
     */
  const scores: Record<string, number> = location.state?.scores ?? {};
    /**
     * useNavigate hook from react-router-dom to navigate.
     */
  const navigate = useNavigate();

  const colors: Record<string, string> = location.state?.colors ?? {};

  const state = location.state as any;
  const sessionId = state?.sessionId;
  const userId = state?.userId;
  const role = state?.role;
  const color = state?.color;

  const { connectedUsers, sendMessage } = useWebSocket();
  const connectedUserIds = connectedUsers.map(user => user.userId);



  /**
   * Handles the cancel button click event.
   * Navigates back to the home page.
   */
  const handleCancel = () => {
    if (sessionId && userId) {
      sendMessage({
        type: 'LEAVE_SESSION',
        payload: {
          sessionId,
          userId,
        },
      });
    }

    localStorage.removeItem('sessionInfo');
    navigate('/');
  };


  useEffect(() => {
    const handleReset = () => {
      console.log('[Victory] RESET_GAME event received');
      if (!sessionId || !userId) {
        console.warn('[Victory] Missing sessionId or userId during RESET_GAME');
        return;
      }

      if (userId !== 'PresenterSpectator') {
        console.log('[Victory] RESET_GAME received by player, returning to role select');
        setTimeout(() => {
          navigate(`/roleselect/${sessionId}`, {
            state: {
              sessionId,
              userId,
              waiting: true,
              role,
              color,
            },
          });
        }, 100); // 100ms delay

      }
    };

    EventBus.on('RESET_GAME', handleReset);

    // Cleanup should be a function that calls off, not the result of off
    return () => {
      EventBus.off('RESET_GAME', handleReset);
    };
  }, [userId, navigate, sessionId, role, color]);


  /**
   * Handles the play again button click event.
   * If the user is a presenter, navigates to the presenter page.
   * If the user is a player, navigates to the role selection page.
   */
  const handlePlayAgain = () => {
    console.log('[Victory] Play Again clicked');

    if (!sessionId) {
      console.warn('[Victory] No sessionId — cannot restart');
      return;
    }    

    if (userId === 'PresenterSpectator') {
      // Reset game for everyone
      console.log('[Victory] Presenter returning to presenter menu');
      sendMessage({ type: 'RESET_GAME', payload: { sessionId } });
      console.log('[Victory] RESET_GAME sent');

      // Restart game and timer
      // sendMessage({ type: 'START_GAME', payload: { sessionId, mode: 'easy' } });
      // sendMessage({ type: 'START_TIMER', payload: { sessionId } });

      navigate(`/presenter/${sessionId}`);
    } 
  };

    // Sort players by score (highest first)
  const sortedPlayers = Object.entries(scores)
    .filter(([playerId]) => connectedUserIds.includes(playerId))
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className={styles.containerImg}>
      <div className={styles.roleContainer}>
        <button
          className={styles.closeButton}
          onClick={handleCancel}
          aria-label="Close"
        >
          ✖
        </button>
        {/* Banner behind the title */}
        <div className={styles.bannerWrapper}>
          <img src="/assets/banner.png" alt="Banner" className={styles.bannerImage} />
          <h1 className={styles.title}>Game Over!</h1>
        </div>

        {/* Leaderboard */}
        <div className={styles.leaderboardWrapper}>
          {sortedPlayers.map(([playerId, score], index) => (
            <div
                key={playerId}
                className={styles.playerCard}
                style={{ animationDelay: `${index * 0.5}s` }}
            >
            <img
                src={`/assets/stars/star-${index + 1}.png`}
                alt={`Rank ${index + 1}`}
                className={styles.rankIcon}
            />

            <div className={styles.verticalDivider} />

                <div className={styles.playerInfo}>
                    <div className={styles.hippoLabel}>
                        <img
                        src={`/assets/hippos/${colors[playerId]}Hippo.png`}
                        alt={`${colors[playerId]} Hippo`}
                        className={styles.hippoImage}
                        />
                        <p className={styles.playerName}>
                        {colors[playerId] && colors[playerId][0].toUpperCase() + colors[playerId].slice(1)}
                        </p>
                    </div>
                <p className={styles.playerScore}>{score} pts</p>
                </div>

            </div>

          ))}
        </div>
        {userId === 'PresenterSpectator' && (
          <div className={styles.playAgainWrapper}>
            <ButtonClick text="Play Again" onClick={handlePlayAgain} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Victory;

