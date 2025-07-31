import React from 'react';
import styles from './UserList.module.css';

interface User {
  userId: string;
  role: string;
}

interface UserListProps {
  users: User[];
}

/**
 * UserList component
 *
 * Renders a list of users currently connected to a waiting lobby,
 * displaying each user's ID alongside their assigned role.
 *
 * If there are no users connected, it shows a friendly placeholder message.
 *
 * @component
 * @param {UserListProps} props - The properties object.
 * @param {User[]} props.users - An array of user objects to display.
 * Each user object contains:
 *   - `userId` (string): The unique identifier for the user.
 *   - `role` (string): The user's assigned role in the lobby.
 *
 * @returns {JSX.Element} A container with a list of users and their roles,
 * or a message indicating no users are connected.
 *
 * @example
 * ```tsx
 * const users = [
 *   { userId: 'alice', role: 'Player' },
 *   { userId: 'bob', role: 'Spectator' },
 * ];
 *
 * <UserList users={users} />
 * ```
 */

const UserList: React.FC<UserListProps> = ({ users }) => {
  if (!users || users.length === 0) {
    return <p>No users connected yet.</p>;
  }

  return (
    <div className={styles.userListContainer}>
      <ul className={styles.userList}>
        {users.map(({ userId, role }) => (
          <li key={userId}>
            <strong>{userId}</strong> — <em>{role}</em>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default UserList;
