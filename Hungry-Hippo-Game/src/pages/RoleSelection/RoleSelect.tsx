import { useEffect, useState } from 'react';
import styles from './RoleSelect.module.css';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { HIPPO_COLORS } from '../../config/hippoColors';  
import { EventBus } from '../../game/EventBus';
import { updatePlayerInSessionStorage } from '../../components/Storage/Storage';
import { getDeviceType } from '../../utils/deviceUtils';

/**
 * RoleSelect - React component for selecting a player's role in the game.
 *
 * <p>Purpose:
 * - Allows the user to choose between two roles: "Hippo Player" or "AAC User".
 * - Prevents navigation to the next game screen until a role is selected.
 * - Highlights the selection dropdown in red if the user attempts to proceed without selecting a role.
 * - Navigates to the game page with the session ID from the URL when valid input is provided.
 *
 * <p>Data Fields:
 * - role: string
 *   - The selected role by the user.
 *   - Empty by default until the user makes a choice.
 *
 * - error: boolean
 *   - True when no role is selected and the user attempts to proceed.
 *   - Used to trigger UI feedback like red border styling.
 *
 * - sessionId: string | undefined
 *   - Retrieved from the route parameters using `useParams()`.
 *   - Represents the unique session identifier needed for routing to the game page.
 *
 * <p>Methods:
 * - handleStart(): void
 *   - Purpose: Validates the role selection and navigates to the game page using the session ID.
 *   - Pre-condition: A role must be selected and sessionId must be defined.
 *   - Post-condition: Navigates to `/gamepage/{sessionId}` if role is valid.
 *   - Parameters: None
 *   - Return value: void
 *   - Exceptions: None explicitly thrown, but `sessionId` may be undefined.
 *     Recovery: Navigation is blocked until valid data is provided.
 *
 * - handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>): void
 *   - Purpose: Updates role state when the user changes their selection.
 *   - Pre-condition: User selects a value from the dropdown.
 *   - Post-condition: Updates internal `role` state; clears error if one was previously set.
 *   - Parameters:
 *     - e: React.ChangeEvent<HTMLSelectElement> — the DOM event triggered by changing the selection.
 *   - Return value: void
 *   - Exceptions: None
 *
 * <p>UI Behavior:
 * - If `role` is not selected, the dropdown will receive a red border and an alert will be shown.
 * - ButtonClick component triggers `handleStart` on click.
 */

function playAudio(src: string) {
  const audio = new Audio(src);
  audio.play().catch(error => {
    console.error('Error playing audio:', error);
  });
}

function RoleSelect() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();

  const generateUsername = () => {
    const num = Math.floor(Math.random() * 1000);
    return `User${String(num).padStart(3, '0')}`;
  };

  const [role, setRole] = useState<string>(''); 
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [username] = useState(location.state?.userId || generateUsername());
  const [waiting, setWaiting] = useState(false);
  const [showClosedSession, setShowClosedSession] = useState(false);
  const { connectedUsers, gameStarted, sendMessage, isConnected, lastMessage, clearLastMessage } = useWebSocket();

  // State to track colors already taken by connected users
  const [takenColors, setTakenColors] = useState<string[]>([]);

  // Count connected users by role
  const HIPPO_PLAYER_LIMIT = 4;
  const AAC_USER_LIMIT = 1;
  const hippoPlayersCount = connectedUsers.filter(user => user.role === 'Hippo Player').length;
  const aacUsersCount = connectedUsers.filter(user => user.role === 'AAC User').length;
  const isHippoRoleFull = hippoPlayersCount >= HIPPO_PLAYER_LIMIT;
  const isAacRoleFull = aacUsersCount >= AAC_USER_LIMIT;

  // --- ERROR HANDLING ---
  useEffect(() => {
    if (lastMessage?.type !== 'ERROR_MESSAGE') return;
    const errorCode = lastMessage.payload.code;
    const errorMessage = lastMessage.payload.message;
    // Handle specific error codes
    switch (errorCode) {
      case 'SESSION_NOT_FOUND':
        alert(`An error occurred: ${errorMessage}`);
        navigate('/');
        break;
      default :
        alert(`An unexpected error occurred: ${errorMessage}`);
        navigate('/');
        break;
    }
    clearLastMessage?.();
  }, [lastMessage, navigate, clearLastMessage]);

  // If presenter closes the session before game starts, go back to main page
  useEffect(() => {
    if (lastMessage?.type === 'SESSION_CLOSED') {
        setShowClosedSession(true);
        clearLastMessage?.();
    }
  }, [lastMessage, clearLastMessage]);

  // Play audio when the component mounts
  useEffect(() => {
    playAudio('/audio/role-select/select-your-role.mp3');
  }, []);

  // Effect to handle WebSocket connection and game resetting
  useEffect(() => {
    const handleResetGame = () => {
      console.log('[RoleSelect] RESET_GAME received - entering waiting state');
      setWaiting(true);
    };

    EventBus.on('RESET_GAME', handleResetGame);

    return () => {
      EventBus.off('RESET_GAME', handleResetGame);
    };
  }, []);

  // Navigate to the next page depending on the selected role.
  // and pass ALL player info in the state for the next page to use.
  // Effect to navigate when gameStarted becomes true
  useEffect(() => {
    if (!waiting) return; // Only navigate if waiting is true (after Next clicked)

    if (gameStarted) {
      console.log('[RoleSelect] Game started, navigating...');
      if (role === 'AAC User') {
        navigate(`/aac/${sessionId}/${username}/${role}`, {
          state: { userId: username, role },
        });
      } else if (role === 'Hippo Player') {
        navigate(`/hippo/${sessionId}/${username}/${role}`, {
          state: { userId: username, role, color: selectedColor },
        });
      }
      else if (role === 'Spectator') {
        navigate(`/spectator/${sessionId}/${username}`, {
          state: { userId: username, role },
        });
      }
    }
  }, [gameStarted, waiting, role, selectedColor, sessionId, username, navigate]);

  useEffect(() => {
    if (sessionId && username && isConnected) {
      sendMessage({
        type: 'PLAYER_JOIN',
        payload: {
          sessionId,
          userId: username,
          role: 'pending',
          deviceType: getDeviceType(),
        },
      });
      updatePlayerInSessionStorage(sessionId, { userId: username, role: 'pending' });
    }
  }, [sessionId, username, isConnected, sendMessage]);

  // Listen for updates on which colors are taken by other players
  useEffect(() => {
    if (lastMessage?.type === 'COLOR_UPDATE') {
      const newTakenColors = lastMessage.payload.takenColors || [];
      setTakenColors(newTakenColors);
      clearLastMessage?.();
    }
  }, [lastMessage, clearLastMessage]);


  // Reset role if AAC User is selected and the role is full
  useEffect(() => {
    if (!waiting && role === 'AAC User' && isAacRoleFull) {
      setRole('');
    }
  }, [connectedUsers, role, isAacRoleFull]);
  /**
   * Handles the logic for starting the game after a role is selected.
   *
   * <p>This function validates that a role has been selected. It then sends a POST request
   * to the server to update the user's role for the current session. Upon a successful
   * update, the user is navigated to the appropriate game page based on their role.
   *
   * <p>If no role is selected, an error state is triggered and the function exits early.
   * If the server fails to update the role, an alert is shown to the user.
   *
   * @async
   * @function handleStart
   * @returns {Promise<void>} Resolves after role is updated and user is navigated to next page.
   */
  const handleStart = () => {
    if (!role && !selectedColor) {
        return;
    }

    playAudio('/audio/role-select/waiting-for-game-to-start.mp3');
    sendMessage({
        type: 'PLAYER_JOIN',
        payload: {
          sessionId,
          userId: username,
          role,
          color: selectedColor,
          deviceType: getDeviceType(),
        },
    });

    if (sessionId) {
      updatePlayerInSessionStorage(sessionId, { userId: username, role, color: selectedColor });
    }

    setWaiting(true);
  };

  // Handle role selection
  const handleRoleSelect = (selectedRole: string) => {
    if (selectedRole === 'Hippo Player') {
      playAudio('/audio/role-select/hippo-player.mp3');
      sendMessage({
        type: 'REQUEST_COLOR_UPDATE',
        payload: { sessionId }
      });
    } else if (selectedRole === 'AAC User') {
      playAudio('/audio/role-select/aac-user.mp3');
    }

    // If switching from Hippo Player to AAC User, release the color
    if (role === 'Hippo Player' && selectedColor) {
      sendMessage({
        type: 'SELECT_COLOR',
        payload: { sessionId, userId: username, color: null }
      });
    }
    setRole(selectedRole);
    setSelectedColor(null);

    if (sessionId) {
      updatePlayerInSessionStorage(sessionId, { userId: username, role: selectedRole, color: null });
    }
  };

  const handleCancel = () => {
    navigate('/');
  };

  // Handle color selection for Hippo Player
  const handleColorSelect = (hippo: { color: string, audioSrc: string }) => {
    setSelectedColor(hippo.color);
    const audio = new Audio(hippo.audioSrc);
    audio.play();

    sendMessage({
        type: 'SELECT_COLOR',
        payload: { sessionId, userId: username, color: hippo.color }
    });

    if (sessionId) {
      updatePlayerInSessionStorage(sessionId, { userId: username, role, color: hippo.color });
    }
  };

  // Handle going back or canceling
  // If we're on the "Waiting..." screen, go back to role selection.
  const handleGoBackOrCancel = () => {
    if (waiting) {
      setWaiting(false);
      setRole('');
      setSelectedColor(null);
      sendMessage({
        type: 'PLAYER_JOIN',
        payload: {
          sessionId,
          userId: username,
          role: 'pending',
          color: null,
          deviceType: getDeviceType()
        },
      });

      sendMessage({
        type: 'REQUEST_COLOR_UPDATE',
        payload: { sessionId }
      });
    } else {
      navigate('/');
    }
};

  const isNextDisabled = !role || (role === 'Hippo Player' && !selectedColor)

  return (
    <div className={styles.containerImg}>
      {/* Popup for session closed by host */}
      {showClosedSession && (
        <div className={styles.closedSessionOverlay}>
          <div className={styles.closedSessionContent}>
            <button onClick={handleCancel} className={styles.closedSessionCloseButton}>✖</button>
            <h3>Session Closed</h3>
            <p>The host has left the lobby.</p>
            <button onClick={handleCancel} className={styles.closedSessionOkButton}>
                OK
            </button>
        </div>
      </div>
      )}
      <div className={styles.roleContainer}>
        <button
          className={styles.closeButton}
          onClick={handleGoBackOrCancel}
          aria-label="Close"
        >
          ✖
        </button>

        {/* Waiting Screen */}
        {waiting ? (
          <div className={styles.waitingContainer}>
            {role === 'Hippo Player' && (
              <img
                src="/assets/mode/easyCompress.gif"
                alt="How to play Hippo Player"
                className={styles.instructionGif}
              />
            )}
            {role === 'AAC User' && (
              <img
                src="/assets/mode/aacCompress.gif"
                alt="How to play AAC User"
                className={styles.instructionGif}
              />
            )}
            <div className={styles.loadingSection}>
              <img
                src="/assets/load.gif"
                alt="Loading..."
                className={styles.loadingSpinner}
              />
              <h2 className={styles.waitingText}>Waiting . . .</h2>

            </div>
          </div>

        ) : (
          <>
            {/* Role Selection Header */}
            <h3 className={styles.selectRoleTitle}>Select Your Role</h3>
            <div className={styles.roleChoiceContainer}>
              {/* Hippo Player Choice Button */}
              <button 
                className={`${styles.roleChoiceButton} ${role === 'Hippo Player' ? styles.selected : ''}`}
                onClick={() => handleRoleSelect('Hippo Player')}
                disabled={isHippoRoleFull}
              >
                <img src="/assets/hippos/outlineHippo.png" alt="Hippo Player" className={styles.roleIcon} />
                <span>Hippo Player {isHippoRoleFull ? '(Full)' : ''}</span>
              </button>

              {/* AAC User Choice Button */}
              <button 
                className={`${styles.roleChoiceButton} ${role === 'AAC User' ? styles.selected : ''}`}
                onClick={() => handleRoleSelect('AAC User')}
                disabled={isAacRoleFull}
              >
                <img src="/assets/aacDevice.png" alt="AAC User" className={styles.roleIcon} />
                <span>AAC User {isAacRoleFull ? '(Full)' : ''}</span>
              </button>
            </div>

            {/* Color Selection for Hippo Player */}
            {role === 'Hippo Player' && (
              <div className={styles.colorSelectionContainer}>
                  <h3 className={styles.selectColorTitle}>Choose your Hippo</h3>
                  <div className={styles.hippoGrid}>
                      {HIPPO_COLORS.map((hippo) => (
                          <button
                              key={hippo.color}
                              className={`${styles.colorButton} ${selectedColor === hippo.color ? styles.selected : ''}`}
                              disabled={takenColors.includes(hippo.color) && hippo.color !== selectedColor}
                              onClick={() => handleColorSelect(hippo)}
                          >
                              <img src={hippo.imgSrc} alt={hippo.color} className={styles.hippoImage} />
                          </button>
                      ))}
                  </div>
              </div>
            )}
            <button className={styles.nextButton} onClick={handleStart} disabled={isNextDisabled}>
              Next
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default RoleSelect;
