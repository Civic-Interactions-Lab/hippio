import styles from './Presenter.module.css';
import { useNavigate, useParams } from 'react-router-dom';

/**
 * Presenter - React component that displays the session ID to the host after creating a new game.
 *
 * Purpose:
 * - Allows the host to view the game session code.
 * - Provides instructions to share the session code with other players.
 * - Includes a button to cancel the new game and return to the landing page.
 *
 * Data Fields:
 * - sessionId: string | undefined
 *   - Retrieved from the URL parameters using `useParams`.
 *   - Represents the unique 5-character code identifying the game session.
 *
 * Methods:
 * - Presenter()
 *   - Purpose: Initializes the component and handles navigation.
 *   - Pre-condition: Route must include a `:sessionId` param (e.g., `/Presenter/ABCDE`).
 *   - Post-condition: Renders the presenter screen with the session ID.
 *   - Parameters: None
 *   - Return value: JSX.Element
 *   - Exceptions thrown: None internally, but improper routing (e.g., missing session ID)
 *     may result in `sessionId` being undefined. This should be handled appropriately.
 *
 * UI Methods:
 * - onClick (inline anonymous function)
 *   - Purpose: Navigates the user back to the landing page.
 *   - Pre-condition: User clicks the "Cancel New Game" button.
 *   - Post-condition: User is redirected to `/`; session ID is not currently cleared.
 *   - Parameters: None
 *   - Return value: void
 *   - Exceptions thrown: None expected. Errors in navigation should be caught by router-level error boundaries.
 *
 * TODO:
 * - Add logic to delete or clear the created session ID from the backend when "Cancel New Game" is pressed.
 * - Validate that `sessionId` is present before rendering.
 */
function Presenter() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  
  /**
   * Handler for clicking the close button.
   * Navigates the user back to the landing page.
   */
  const handleCancel = () => {
    navigate('/');
  };

  return (
    <div className={styles.containerImg}>
      {/* <div className={styles.bannerWrapper}>
        <img
          src="/assets/banner.png"
          alt="Game Banner"
          className={styles.bannerImage}
        />
      </div> */}

      <div className={styles.roleContainer}>
        <button
          className={styles.closeButton}
          onClick={handleCancel}
          aria-label="Cancel New Game"
        >
          ✖
        </button>

        <h1 className={styles.sessionText2}>Game Code: {sessionId}</h1>
        <h3 className={styles.sessionText2}>
          Share this with other players!
          <br />
          Waiting for game to start...
        </h3>
      </div>
    </div>
    
  );
}

export default Presenter;