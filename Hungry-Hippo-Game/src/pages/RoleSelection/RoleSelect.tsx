import { useEffect, useState } from 'react';
import styles from './RoleSelect.module.css';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { HIPPO_COLORS } from '../../config/hippoColors';  

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

function RoleSelect() {
  const navigate = useNavigate();
  const saved = JSON.parse(localStorage.getItem('sessionInfo') || '{}');
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();

  const generateUsername = () => {
    const num = Math.floor(Math.random() * 1000);
    return `User${String(num).padStart(3, '0')}`;
  };

  const [role, setRole] = useState<string>(location.state?.role || saved.role || '');
  const [selectedColor, setSelectedColor] = useState<string | null>(location.state?.color || saved.color || null);
  const [username] = useState(location.state?.userId || saved.userId || generateUsername());
  const [waiting, setWaiting] = useState<boolean>(location.state?.waiting || saved.waiting || false);
  const { connectedUsers, gameStarted, sendMessage } = useWebSocket();
  

  // State to track colors already taken by connected users
  const [takenColors, setTakenColors] = useState<string[]>([]);

  // Count connected users by role
  const HIPPO_PLAYER_LIMIT = 4;
  const AAC_USER_LIMIT = 1;
  const hippoPlayersCount = connectedUsers.filter(user => user.role === 'Hippo Player').length;
  const aacUsersCount = connectedUsers.filter(user => user.role === 'AAC User').length;
  const isHippoRoleFull = hippoPlayersCount >= HIPPO_PLAYER_LIMIT;
  const isAacRoleFull = aacUsersCount >= AAC_USER_LIMIT;
  useEffect(() => {
    if (location.state?.waiting) {
      setWaiting(true);
    }
  }, [location.state?.waiting]);

  useEffect(() => {
    // Find this client in the updated connectedUsers list
    const currentUser = connectedUsers.find(user => user.userId === username);
    if (currentUser) {
      if (currentUser.role !== role) setRole(currentUser.role);
      if (currentUser.color && currentUser.color !== selectedColor) setSelectedColor(currentUser.color);
    }
  }, [connectedUsers, username, role, selectedColor]);

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
    if (sessionId && username && !saved.userId) {
      localStorage.setItem('sessionInfo', JSON.stringify({
        sessionId,
        userId: username,
        role,
        color: selectedColor,
        waiting,
      }));
    }
  }, [sessionId, username]);

  // Listen for updates on which colors are taken by other players
  useEffect(() => {
    const colors = connectedUsers
      .filter(user => user.role === 'Hippo Player' && user.color)
      .map(user => user.color)
      .filter((color): color is string => typeof color === 'string');
    setTakenColors(colors);

    // Deselect color if it is now taken by someone else
    if (
      role === 'Hippo Player' &&
      selectedColor &&
      colors.includes(selectedColor) &&
      !connectedUsers.some(
        user => user.userId === username && user.color === selectedColor
      )
    ) {
      console.log(`[RoleSelect] Selected color ${selectedColor} is now taken. Clearing selection.`);
      setSelectedColor(null);
    }
  }, [connectedUsers, role, selectedColor, username]);


  // Reset role if AAC User is selected and the role is full
  useEffect(() => {
    if (
      !waiting &&
      role === 'AAC User' &&
      !connectedUsers.some(user => user.userId === username && user.role === 'AAC User') &&
      isAacRoleFull
    ) {
      console.log('[RoleSelect] Clearing AAC role due to conflict');
      setRole('');
    }
  }, [connectedUsers, role, waiting, username, isAacRoleFull]);

  // Log connected users for debugging
  useEffect(() => {
    console.log('[RoleSelect] Connected users:', connectedUsers);
  }, [connectedUsers]);

  useEffect(() => {
    const handleUnload = () => {
      if (sessionId && username) {
        navigator.sendBeacon(
          '/leave', 
          JSON.stringify({
            type: 'LEAVE_SESSION',
            payload: { sessionId, userId: username },
          })
        );
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [sessionId, username]);

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
    console.log(`[RoleSelect] Sending PLAYER_JOIN for user ${username} in session ${sessionId} with role ${role} and color ${selectedColor}`);

    // Save current info before proceeding
    localStorage.setItem('sessionInfo', JSON.stringify({
      sessionId,
      userId: username,
      role,
      color: selectedColor,
      waiting: true, // user is now waiting for game start
    }));

    sendMessage({
        type: 'PLAYER_JOIN',
        payload: {
          sessionId,
          userId: username,
          role,
          color: selectedColor,
        },
    });

    setWaiting(true);
  };

  // Handle role selection
  const handleRoleSelect = (selectedRole: string) => {
    // If leaving Hippo Player role, clear color
    if (role === 'Hippo Player' && selectedColor) {
      sendMessage({
        type: 'SELECT_COLOR',
        payload: { sessionId, userId: username, color: null }
      });
    }
    setRole(selectedRole);
    setSelectedColor(null);
  };

  const handleCancel = () => {
    if (sessionId && username) {
      sendMessage({
        type: 'LEAVE_SESSION',
        payload: {
          sessionId,
          userId: username,
        },
      });
    }

    localStorage.removeItem('sessionInfo');
    navigate('/');
  };

  // Handle color selection for Hippo Player
  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    sendMessage({
        type: 'SELECT_COLOR',
        payload: { sessionId, userId: username, color }
    });
  };

  const isNextDisabled = !role || (role === 'Hippo Player' && !selectedColor)

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

        {waiting ? (
          <h2 className={styles.waitingText}>Waiting for game to start...</h2>
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
                              onClick={() => handleColorSelect(hippo.color)}
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
