import styles from './Presenter.module.css';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { HIPPO_COLORS } from '../../config/hippoColors';  

/**
 * Presenter - React component that displays the session ID to the host after creating a new game.
 *
 * Purpose:
 * - Allows the host to view the game session code.
 * - Provides instructions to share the session code with other players.
 * - Includes a button to cancel the new game and return to the landing page.
 * - Shows a waiting lobby with connected users and their roles.
 */

const presenterBg = '/assets/presenterBg.png';

const modeDetails = {
  Easy: { label: 'Easy', iconPath: '/assets/fruits/strawberry.png', count: 1 },
  Medium: { label: 'Medium', iconPath: '/assets/fruits/strawberry.png', count: 2 },
  Hard: { label: 'Hard', iconPath: '/assets/fruits/strawberry.png', count: 3 },
};

function Presenter() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'Easy' | 'Medium' | 'Hard'>('Easy');

  if (!sessionId || sessionId.length < 5) {
    console.error('Invalid sessionId:', sessionId);
    return <Navigate to="/" replace />;
  }  
  const presenterId = 'presenter'; 
  const { sendMessage, connectedUsers, isConnected } = useWebSocket();

  /**
   * List of available game modes in the order they should cycle through.
   * 
   * Used for navigating between modes via the `cycleMode` function.
   */
  const modes: Array<'Easy' | 'Medium' | 'Hard'> = ['Easy', 'Medium', 'Hard'];

  /**
   * Plays the audio for the selected game mode.
   * 
   * @param selectedMode - The mode for which to play the audio.
   */
  const playModeAudio = (selectedMode: 'Easy' | 'Medium' | 'Hard') => {
    const audio = new Audio(`/audio/modes/${selectedMode.toLowerCase()}.mp3`);
    audio.play().catch((e) => {
      console.warn('Audio playback failed:', e);
    });
  };

  /**
   * Cycles through the available game modes either to the left (previous) or right (next).
   * 
   * @param direction - The direction to cycle: `'left'` for previous, `'right'` for next.
   */
  const cycleMode = (direction: 'left' | 'right') => {
    const currentIndex = modes.indexOf(mode);
    const newIndex =
      direction === 'left'
        ? (currentIndex + modes.length - 1) % modes.length
        : (currentIndex + 1) % modes.length;
    setMode(modes[newIndex]);
  };

  // Play audio for the initial mode when the component mounts
  useEffect(() => {
    playModeAudio(mode);
  }, [mode]);


  // Join session as "Presenter" to receive updates
  useEffect(() => {
    if (sessionId && isConnected) {
      sendMessage({
        type: 'PLAYER_JOIN',
        payload: { sessionId, userId: presenterId, role: 'Presenter' }
      });
    }
  }, [sessionId, isConnected, sendMessage]);


  /**
   * Handler for clicking the close button.
   * Navigates the user back to the landing page.
   */
  const handleCancel = () => {
    localStorage.removeItem('sessionInfo');
    navigate('/');
  };


  const spectatorId = "PresenterSpectator"; // Or use presenterId, or generate unique

  const aacCount = connectedUsers.filter(u => u.role === 'AAC User').length;
  const hippoPlayers = connectedUsers.filter(u => u.role === 'Hippo Player');



  // Function to handle start game 
  const handleStartGame = () => {
    console.log('Start Game button clicked, sending START_GAME message');
    if (!sessionId) {
      console.error('No sessionId available');
      return;
    }

     sendMessage({
    type: 'PLAYER_JOIN',
    payload: {
      sessionId,
      userId: spectatorId,
      role: 'Spectator'
    }
  });

    sendMessage({
      type: 'START_GAME',
      payload: { sessionId, mode },
    });
    console.log('Sending START_TIMER for session ', sessionId, ' with mode ', mode);
    sendMessage({
      type: 'START_TIMER',
      payload: { sessionId, mode },
    });
    navigate(`/spectator/${sessionId}/${spectatorId}`, {
  state: { userId: spectatorId, role: 'Spectator' }
 });

  };

  const handleCopy = () => {
    navigator.clipboard.writeText(sessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const lobbyHippoSlots = [0, 1, 2, 3];

  function renderHippoSlot(player: any, index: number) {
    const isActive = !!player;
    // Use the HIPPO_COLORS array to get the color for the slot
    const hippoColor = isActive ? HIPPO_COLORS.find(h => h.color === player.color) : null;
    console.log('Rendering hippo slot:', index, 'Player:', player, 'Color:', hippoColor);

    return (
      <div key={index} className={styles.hippoSlot}>
        <div className={styles.hippoImageWrapper}>
          <img
            src="/assets/hippos/outlineHippo.png"
            alt="Image of Hippo"
            className={styles.hippoImage}
          />
          {isActive && hippoColor && (
            <img
              src={hippoColor.imgSrc}
              alt={`${hippoColor.color} Hippo`}
              className={`${styles.hippoImage} ${styles.fadeIn}`}
            />
          )}
        </div>
        <span className={styles.userId}>{isActive && player.color ? player.color.charAt(0).toUpperCase() + player.color.slice(1) : ''}</span>
      </div>
    );
  }

  return (
    <div className={styles.containerImg}>
      <div className={styles.roleWrapper}>
        <div className={styles.contentRow}>
          
          {/* Left Column: QR Code and Game Code */}
          <div className={styles.leftColumn}>
            <h1 className={styles.scanQrCodeText}>
              QR Code{' '}
              <img
                src="/assets/cameraIcon.png"
                alt="Camera icon"
                className={styles.cameraIcon}
              />
            </h1>
            <div className={styles.qrWrapper}>
              <QRCodeSVG
                className={styles.QrCode}
                value={`${window.location.origin}/roleselect/${sessionId}`}
                size={128}
              />
            </div>
            <div className={styles.joinRoomDivider}>
              <span>or</span>
            </div>
            <h1 className={styles.gameCodeText}>
              Game Code:{' '}
              <span className={styles.copyWrapper} onClick={handleCopy}>
                <span className={styles.sessionBox}>
                  <span className={styles.sessionId}>{sessionId}</span>
                  <span className={styles.copyIcon} aria-label="Copy icon" role="img">
                    &#x2398;
                  </span>
                </span>
                <span className={styles.tooltip}>
                  {copied ? 'Code copied!' : 'Click to copy'}
                </span>
              </span>
            </h1>
            <p className={styles.limitNote}>(Up to 4 Hippos)</p>
          </div>

          {/* Right Column: Hippo Slots and AAC Device */}
          <div className={styles.rightColumn}>
            <button
              className={styles.closeButton}
              onClick={handleCancel}
              aria-label="Cancel New Game"
            >
              ✖
            </button>

            <div className={styles.mapWrapper}>
              <div className={styles.pondArea}>
                <img
                  src={presenterBg}
                  alt="Pond background"
                  className={styles.pondImage}
                />
                <div className={styles.hippoGrid}>
                  {lobbyHippoSlots.map((slotIndex) =>
                    renderHippoSlot(hippoPlayers[slotIndex], slotIndex)
                  )}
                </div>

                <div className={styles.aacCenter}>
                  <div className={styles.aacImageWrapper}>
                    <img
                      src="/assets/aacDeviceOutline.png"
                      alt="AAC Outline"
                      className={styles.aacImage}
                    />
                    <img
                      src="/assets/aacDevice.png"
                      alt="AAC Device"
                      className={`${styles.aacImage} ${aacCount >= 1 ? styles.fadeIn : ''}`}
                    />
                  </div>
                  {aacCount >= 1 && <span className={styles.userId}>AAC User</span>}
                </div>
                
              </div>
            </div>

            {/* Game Mode Selection */}
            <div className={styles.modeSelectorWrapper}>
              <button
                className={styles.arrowButton}
                onClick={() => cycleMode('left')}
                aria-label="Previous mode"
              >
                ◀
              </button>

              <div
                className={styles.modeDisplay}
                style={{
                  color: 'black',
                  backgroundColor:
                    mode === 'Easy' ? '#4CAF50'
                      : mode === 'Medium' ? '#e2d733ff'
                      : '#fe1c1cff',
                      fontWeight: '550',
                      fontFamily: 'Fredoka, sans-serif',
                }}
              >
                <div className={styles.flexRowWrapper}>
                  {/* <span className={styles.modeLabel}>{modeDetails[mode].label}</span> */}
                  <div className={styles.modeIconContainer}>
                    {Array.from({ length: modeDetails[mode].count }).map((_, i) => (
                      <img 
                        key={i}
                        src={modeDetails[mode].iconPath}
                        alt={mode}
                        className={styles.modeIcon}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <button
                className={styles.arrowButton}
                onClick={() => cycleMode('right')}
                aria-label="Next mode"
              >
                ▶
              </button>
            </div>

            {/* Start Game Button */}
            <div className={styles.startButtonWrapper}>
              <button
                className={styles.startButton}
                onClick={handleStartGame}
                disabled={hippoPlayers.length < 1 || aacCount < 1}
              >
                <div className={styles.buttonContent}>
                  <div className={styles.iconRow}>
                    <img
                      src="/assets/hippos/brownHippo.png"
                      alt="Hippo"
                      className={`${styles.requirementIcon} ${
                        hippoPlayers.length >= 1 ? styles.iconReady : ''
                      }`}
                    />
                    <img
                      src="/assets/aacDevice.png"
                      alt="AAC"
                      className={`${styles.requirementIcon} ${
                        aacCount >= 1 ? styles.iconReady : ''
                      }`}
                    />
                    <span className={styles.buttonLabel}>Start Game</span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Presenter;