import styles from './Presenter.module.css';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { HIPPO_COLORS } from '../../config/hippoColors';  
import { getDeviceType } from '../../utils/deviceUtils';

/**
 * Presenter - React component that displays the session ID to the host after creating a new game.
 *
 * The Presenter is the host interface shown after creating a new game session.
 *
 * ## Purpose:
 * - Displays the session code as text and QR code.
 * - Allows the host to copy the session ID.
 * - Lets the host choose a game mode (Easy, Medium, Hard).
 * - Shows a lobby with currently connected users (hippo players and AAC users).
 * - Allows the host to start the game when all required participants are present.
 *
 * ## Features:
 * - Session ID is shown and copyable.
 * - QR code directs users to the role selection screen.
 * - Shows up to 4 hippo slots and 1 AAC device.
 * - Hosts can cycle between game modes (with visual + audio feedback).
 * - Prevents game start until at least 1 AAC user and 1 Hippo player are connected.
 * - Sends `PLAYER_JOIN`, `START_GAME`, and `START_TIMER` messages via WebSocket.
 *
 * ## Hooks:
 * - `useParams`: Gets `sessionId` from the route.
 * - `useWebSocket`: Sends messages, receives user list.
 * - `useEffect`: Joins the session as "Presenter", plays audio on mode change.
 * - `useNavigate`: Redirects user back or forwards to Spectator screen.
 *
 * @component
 * @returns {JSX.Element} The rendered Presenter game lobby interface.
 *
 * @example
 * ```tsx
 * <Route path="/presenter/:sessionId" element={<Presenter />} />
 * ```
 */


const presenterBg = '/assets/presenterBg.webp';

/**
 * Mapping of game modes to their label, icon path, and number of icons.
 * Used for rendering game mode selector UI.
 */
const modeDetails = {
  Easy: { label: 'Easy', iconPath: '/assets/fruits/strawberry.png', count: 1 },
  Medium: { label: 'Medium', iconPath: '/assets/fruits/strawberry.png', count: 2 },
  Hard: { label: 'Hard', iconPath: '/assets/fruits/strawberry.png', count: 3 },
};

function Presenter() {
  /**
   * State to control the visibility of the "How to Play" help GIF overlay.
   *
   * @type {boolean}
   * @default false
   * 
   * @description
   * - `true`: The help GIF overlay is visible on screen.
   * - `false`: The overlay is hidden.
   *
   * Used to toggle the instructional animation when a user clicks the "?" icon next to the game mode selector.
   */
  const [showHelpGif, setShowHelpGif] = useState(false);
  const navigate = useNavigate();
    /**
   * Session ID extracted from the route.
   * Used to join the WebSocket session and render QR/game code.
   */
  const { sessionId } = useParams<{ sessionId: string }>();
    /**
   * Whether the session ID was copied to clipboard recently.
   */
  const [copied, setCopied] = useState(false);
    /**
   * Current selected game mode.
   * Cycles between Easy, Medium, and Hard.
   */
  const [mode, setMode] = useState<'Easy' | 'Medium' | 'Hard'>('Easy');

  if (!sessionId || sessionId.length < 5) {
    console.error('Invalid sessionId:', sessionId);
    return <Navigate to="/" replace />;
  }  
    /**
   * Hardcoded presenter ID to register as "Presenter" over WebSocket.
   */
  const presenterId = 'presenter'; 
    /**
   * WebSocket context values:
   * - `sendMessage`: function to emit WebSocket messages.
   * - `connectedUsers`: list of all users in the session.
   * - `isConnected`: whether WebSocket is open.
   */
  const { sendMessage, connectedUsers, isConnected, lastMessage, clearLastMessage } = useWebSocket();

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

  // --- ERROR HANDLING ---
  useEffect(() => {
    if (lastMessage?.type === 'ERROR_MESSAGE' && lastMessage?.payload?.code === 'SESSION_NOT_FOUND') {
      alert(`An error occurred: ${lastMessage.payload.message}`);
      clearLastMessage?.();
      navigate('/');
    }
  }, [lastMessage, navigate, clearLastMessage]);

  // Play audio for the initial mode when the component mounts
  useEffect(() => {
    playModeAudio(mode);
  }, [mode]);


  // Join session as "Presenter" to receive updates
  useEffect(() => {
    if (sessionId && isConnected) {
      sendMessage({
        type: 'PLAYER_JOIN',
        payload: { sessionId, userId: presenterId, role: 'Presenter', deviceType: getDeviceType() }
      });
    }
  }, [sessionId, isConnected, sendMessage]);


  /**
   * Handler for clicking the close button.
   * Navigates the user back to the landing page.
   */
  const handleCancel = () => {
    navigate('/');
  };

    /**
   * ID to use for the Spectator client that gets opened by the presenter.
   */
  const spectatorId = "PresenterSpectator"; // Or use presenterId, or generate unique
  /**
   * Number of connected users with AAC User role.
   */
  const aacCount = connectedUsers.filter(u => u.role === 'AAC User').length;
  /**
   * List of all connected users who selected the "Hippo Player" role.
   */
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

    /**
   * List of slot indices for Hippo player UI display.
   * Each slot corresponds to a position around the pond.
   */
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

              {/* Question mark help button */}
              <button
                className={styles.helpButton}
                onClick={() => setShowHelpGif(true)}
                aria-label="Show help"
              >
                ?
              </button>
            </div>

            {showHelpGif && (
              <div className={styles.helpGifOverlay}>
                <img
                  src={
                    mode === 'Easy'
                      ? '/assets/mode/easyCompress.gif'
                      : mode === 'Medium'
                      ? '/assets/mode/medCompress.gif'
                      : '/assets/mode/hardCompress.gif'
                  }
                  alt={`How to play: ${mode}`}
                  className={styles.overlayGif}
                />
                <button
                  className={styles.closeButton}
                  onClick={() => setShowHelpGif(false)}
                  aria-label="Close help overlay"
                >
                  ✖
                </button>
              </div>
            )}

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