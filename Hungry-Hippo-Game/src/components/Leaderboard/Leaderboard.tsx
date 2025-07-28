import React from 'react';
import styles from './Leaderboard.module.css';

/**
 * Props for the Leaderboard component.
 * @scores - Map of player IDs to their scores.
 * @colors - Map of player IDs to their assigned colors.
 * @userId - The ID of the current user to highlight in the leaderboard.
 */
interface LeaderboardProps {
  scores: Record<string, number>;
  colors: Record<string, string>;
  userId: string;
  connectedUserIds: string[];
}

/**
 * A leaderboard UI component that displays hippo avatars and scores for each player.
 *
 * - Sorts players by score (highest first)
 * - Displays hippo image based on color
 * - Highlights the current user with "(You)"
 *
 * @param props - The props for the component
 * @returns A rendered list of players with scores and avatars
 */
const Leaderboard: React.FC<LeaderboardProps> = ({ scores, colors, userId, connectedUserIds }) => {
  // Sort players by descending score
  const sortedEntries = Object.entries(scores)
    .filter(([playerId]) => connectedUserIds.includes(playerId)) // Filter out users who left
    .sort((a, b) => b[1] - a[1]);

  return (
    <ul className={styles.list}>
      {sortedEntries.map(([playerId, score]) => {
        const color = colors[playerId];
        // uncomment this line to display color
        // const displayColor = color ? color[0].toUpperCase() + color.slice(1) : playerId;

        return (
          <li key={playerId} className={styles.listItem}>
            <img
              src={`/assets/hippos/${color}Hippo.png`}
              alt={`${color} Hippo`}
              className={styles.hippoImage}
            />
            <span className={styles.colorName}>
              {/* uncomment this line to display color */}
              {/* {displayColor} */}
              {playerId === userId && <span className={styles.youLabel}> (You)</span>}
            </span>
            <span className={styles.colon}>:</span>
            <span>{score} pts</span>
          </li>
        );
      })}
    </ul>
  );
};

export default Leaderboard;