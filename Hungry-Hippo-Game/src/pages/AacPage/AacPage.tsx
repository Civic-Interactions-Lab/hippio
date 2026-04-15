import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AacInterface from '../../aac/AacInterface';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { EventBus } from '../../game/EventBus';

/**
 * Route parameters from the URL.
 */
interface RouteParams {
  sessionId?: string;
  userId?: string;
  role?: string;
  [key: string]: string | undefined; 
}

/**
 * AacPage component.
 *
 * Renders the AAC interface
 * for selecting food items within a given session.
 *
 * @component
 * @returns {JSX.Element} The AAC interface or a message if sessionId is missing.
 */
const AacPage: React.FC = () => {
  /**
   * Extracts the sessionId, userId, role from the URL parameters.
   */
  const { sessionId, userId, role } = useParams<RouteParams>();

  /**
   * Use the useNavigate hook from react-router-dom to navigate programmatically.
   */
  const navigate = useNavigate();
  
  /**
   * Get last message and connectedUsers from WebSocket context.
   */
  const { lastMessage, connectedUsers, clearLastMessage } = useWebSocket();

  /**
   * State to hold scores for the game.
   */
  const [scores, setScores] = useState<Record<string, number>>({});

  // --- ERROR HANDLING ---
  useEffect(() => {
    if (lastMessage?.type === 'ERROR_MESSAGE' && lastMessage?.payload?.code === 'SESSION_NOT_FOUND') {
      alert(`An error occurred: ${lastMessage.payload.message}`);
      clearLastMessage?.();
      navigate('/');
    }
  }, [lastMessage, navigate, clearLastMessage]);

  /**
   * Effect hook to listen for score updates from the EventBus.
   * Updates the scores state when a 'scoreUpdate' event is emitted.
   */
  useEffect(() => {
    const handleScoreUpdate = ({ scores }: { scores: Record<string, number> }) => {
      setScores(scores);
    };

    EventBus.on('scoreUpdate', handleScoreUpdate);
    return () => {
      EventBus.off('scoreUpdate', handleScoreUpdate);
    };
  }, []);

  /**
   * Effect hook to listen for idle prompt from WebSocket.
   * Plays audio when AAC user has been idle for 15 seconds.
   */
  useEffect(() => {
    if (lastMessage?.type === 'AAC_IDLE_PROMPT') {
      const audioPath = lastMessage.payload?.audioPath;
      if (audioPath) {
        const audio = new Audio(audioPath);
        audio.play().catch((error) => {
          console.error('[AacPage] Error playing idle audio:', error);
        });
      }
    }
  }, [lastMessage]);

  /**
   * If GAME_OVER use the navigate function to navigate to different routes.
   */
  useEffect(() => {
    if (lastMessage?.type === 'GAME_OVER' && sessionId) {
      console.log('[AacPage] GAME_OVER received. Navigating to Victory screen.');

      const colors = Object.fromEntries(
        connectedUsers
          .filter(user => user.color)
          .map(user => [user.userId, user.color])
      );

      navigate(`/victory/${sessionId}`, { state: { scores, colors, sessionId, userId } });
    }
  }, [lastMessage, sessionId, navigate, scores, connectedUsers]);

  /**
   * If sessionId is not present, display an error message.
   */
  if (!sessionId) return <p>Session ID not found</p>;

  /**
   * Render the AAC interface with the provided sessionId.
   */
  return (
    <div id="aac-page">
      <AacInterface sessionId={sessionId} userId={userId} role={role} />
    </div>
  );
};

export default AacPage;