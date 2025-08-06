---
sidebar_position: 2
description: Backend API
---

# Backend API

---

## Overview

The backend is a **real-time multiplayer game server** implemented in **Node.js** using the `ws` WebSocket library. It manages active game sessions, tracks scores and players, and arranges all real-time gameplay logic including spawning food, and effects.

The server does **not** use REST endpoints. All communication is performed using WebSocket messages.


- **Production**: Uses **PostgreSQL (via Railway)** to persist session/player data.
- **Local Development**: Uses a JSON file for session storage.

---

## Session and Player Lifecycle

### `CREATE_SESSION`
- **Purpose**: Generates a new unique `sessionId`.
- **Pre-conditions**: None.
- **Post-conditions**:
  - Local: New entry added to `sessionID.json`.
  - Prod: New row inserted in `sessions` table.
- **Returns**: `{ sessionId: string }`
- **Example**: `{ "ABCDE" }`

### `PLAYER_JOIN`
- **Purpose**: Joins a user to a session and stores role/color.
- **Pre-conditions**: `sessionId` must exist.
- **Post-conditions**:
  - Socket added to session’s connection set.
  - Broadcasts updated user list.
  - Updates database if in production.
- **Returns**: Broadcasts `PLAYER_JOINED_BROADCAST` and `USERS_LIST_UPDATE`.
- **Example**:  
  ```js
  {
    type: "PLAYER_JOIN",
    payload: {
      sessionId: "ABCDE",
      userId: "User123",
      role: "Hippo Player",
      color: "blue"
    }
  }

---

## WebSocket Communication

The server operates by receiving messages from clients and broadcasting **state updates** to all clients in a given session.

### Client-to-Server Messages

| Message Type            | Payload Shape                              | Example (explicit keys)                                                                | Description                                       |
|-------------------------|--------------------------------------------|----------------------------------------------------------------------------------------|---------------------------------------------------|
| `CREATE_SESSION`        | `{}`                                       | `{}`                                                                                   | Requests a new unique session ID.                 |
| `VALIDATE_SESSION`      | `{ sessionId: string }`                    | `{ "sessionId": "ABCDE" }`                                                             | Validates session ID.                             |
| `PLAYER_JOIN`           | `{ sessionId, userId, role, color }`       | `{ "sessionId": "ABCDE", "userId": "User123", "role": "Hippo Player", "color": "blue" }`| Adds user to session and syncs presence.          |
| `PLAYER_MOVE`           | `{ sessionId, userId, x, y }`              | `{ "sessionId": "ABCDE", "userId": "User123", "x": 100, "y": 200 }`                    | Sends current player position.                    |
| `AAC_FOOD_SELECTED`     | `{ sessionId, food, effect }`              | `{ "sessionId": "ABCDE", "food": "apple", "effect": null }`                            | Target food selection by AAC user.                |
| `START_GAME`            | `{ sessionId, mode }`                      | `{ "sessionId": "ABCDE", "mode": "Medium" }`                                           | Initializes game loop and spawns food.            |
| `START_TIMER`           | `{ sessionId }`                            | `{ "sessionId": "ABCDE" }`                                                             | Starts countdown (180 s).                         |
| `SET_EDGE`              | `{ sessionId, userId, edge }`              | `{ "sessionId": "ABCDE", "userId": "User123", "edge": "bottom" }`                      | Assigns spawn angle per player.                   |
| `FRUIT_EATEN`           | `{ sessionId, instanceId }`                | `{ "sessionId": "ABCDE", "instanceId": "food-12-User123" }`                            | Tells server to remove food from list.            |
| `FRUIT_EATEN_BY_PLAYER` | `{ sessionId, userId, isCorrect, effect }` | `{ "sessionId": "ABCDE", "userId": "User123", "isCorrect": true, "effect": "grow" }`   | Updates score and clears effect.                  |
| `PLAYER_EFFECT_APPLIED` | `{ sessionId, targetUserId, effect }`      | `{ "sessionId": "ABCDE", "targetUserId": "User123", "effect": "freeze" }`              | Triggers visual effect.                           |
| `SELECT_COLOR`          | `{ sessionId, userId, color }`             | `{ "sessionId": "ABCDE", "userId": "User123", "color": "green" }`                      | Assigns a color to a user.                        |


---

### Server → Client Broadcasts

| Message Type               | Payload Shape                                | Example (explicit keys)                                                                                        | Description                              |
|----------------------------|----------------------------------------------|----------------------------------------------------------------------------------------------------------------|------------------------------------------|
| `SESSION_CREATED`          | `{ sessionId: string }`                      | `{ "sessionId": "ABCDE" }`                                                                                     | A new session was created.               |
| `SESSION_VALIDATED`        | `{ sessionId: string, isValid: boolean }`    | `{ "sessionId": "ABCDE", "isValid": true }`                                                                    | Result of a validation request.          |
| `PLAYER_JOINED_BROADCAST`  | `{ userId, role, color }`                    | `{ "userId": "User123", "role": "Hippo Player", "color": "blue" }`                                             | Sent when a new player joins.            |
| `USERS_LIST_UPDATE`        | `{ users: [{ userId, role, color }] }`       | `{ "users": [{ "userId": "User123", "role": "Hippo Player", "color": "blue" }, { "userId": "User456", "role": "AAC User", "color": "null" }] }` | Updated player list. |
| `FOOD_STATE_UPDATE`        | `{ foods: [...] }`                           | `{ "foods": [{ "instanceId": "food-12-User123", "type": "apple", "x": 100, "y": 200 }] }`                      | Broadcasts food positions.               |
| `AAC_TARGET_FOOD`          | `{ targetFoodId, targetFoodData, effect }`   | `{ "targetFoodId": "apple", "targetFoodData": { "type": "apple" }, "effect": null }`                           | Designates target food.                  |
| `SCORE_UPDATE_BROADCAST`   | `{ scores: { [userId]: number } }`           | `{ "scores": { "User123": 3, "User456": 1 } }`                                                                 | Live score updates.                      |
| `REMOVE_FOOD`              | `{ instanceId: string }`                     | `{ "instanceId": "food-12-User123" }`                                                                          | Removes food from client canvas.         |
| `PLAYER_EFFECT_BROADCAST`  | `{ targetUserId, effect }`                   | `{ "targetUserId": "User456", "effect": "freeze" }`                                                            | Applies power-up or penalty effect.      |
| `COLOR_UPDATE`             | `{ takenColors: string[] }`                  | `{ "takenColors": ["blue", "red"] }`                                                                           | Sends all chosen player colors.          |
| `TIMER_UPDATE`             | `{ secondsLeft: number }`                    | `{ "secondsLeft": 45 }`                                                                                        | Countdown timer for game end.            |
| `GAME_OVER`                | `{}`                                         | `{}`                                                                                                           | Signals game end state.                  |


---

## Error Handling and Edge Cases

### Error Message Shape

| Message Type | Payload Shape | Example |
|--------------|---------------|---------|
| `ERROR_MESSAGE` | `{ code: string, message: string, [meta] }` | `{ "code": "SESSION_NOT_FOUND", "message": "An error occured. Session ABCDE doesn’t exist", "sessionId": "ABCDE" }` |

### Error Codes

| Code | Description | Trigger |
|------|-------------|-----------------|
| `SESSION_NOT_FOUND` | Session ID doesn’t exist (file or DB) | `PLAYER_JOIN`, `START_GAME` |
| `SERVER_ERROR` | Any uncaught exception | top-level `try/catch` |

### Edge-Case Handling

- **Non-existent session**  
  Every handler validates `sessionId`. If inactive, the server rejects the action and replies with `SESSION_NOT_FOUND`.

- **Duplicate player join**  
  Re-sending `PLAYER_JOIN` for the same socket/user is harmless; the server ignores duplicates.

- **Presenter disconnects before game start**  
  - *Players still in lobby*: a 10s reconnect timer starts. If the presenter fails to return, the server broadcasts `SESSION_CLOSED` and all clients navigate home.  
  - *Lobby empty*: the session is removed from memory and database immediately.

- **AAC queue overflow**  
  When `fruitQueues[sessionId]` already holds `QUEUE_MAX` items, the oldest entry is dropped to make space. No error is sent.

- **Game-timer expiry**  
  At 0s the server broadcasts `GAME_OVER`, wipes active game state, and leaves session/player rows intact so the lobby can start another round. The session is deleted from the DB only after the last player disconnects.

---

## Utility Functions

### `generateSessionId(length = 5)`

Generates a random alphanumeric session ID consisting of uppercase letters and digits.

- **Parameters**:
  - `length` (`number`) - Optional. Defaults to `5`.
- **Returns**:
  - `string` - Random session ID.
  - **Example**: `{ "ABCDE" }`
- **Pre-conditions**: None.
- **Post-conditions**: None.

---

### `generateUniqueSessionId(existingSessions, length = 5)`

Ensures the session ID is not already in use.

- **Parameters**:
  - `existingSessions` (`string[]`)
  - `length` (`number`) - Optional. Defaults to `5`.
- **Returns**:
  - `string` - Unique session ID.
  - **Example**: `{ "ABCDE" }`
- **Pre-conditions**: `existingSessions` must be an array of valid IDs.
- **Post-conditions**: New ID guaranteed not in existingSessions.
- **Error handling**  
  - Attempts up to **1000** random IDs.  
    If no unique ID is found it throws **`Error: Max attempts reached`**

---

### `getWeightedRandomFood(allFoods, targetId)`

Selects a food item randomly, with extra weight given to a "target" food ID.

- **Parameters**:
  - `allFoods` (`object[]`) - Full list of food items.
  - `targetId` (`string`) - ID of the target food to favor.
- **Returns**:
  - `object` - Randomly selected food object.
  - **Example**: `{ id: "apple", name: "Apple", imagePath: "/assets/fruits/apple.png" }`
- **Pre-conditions**: `allFoods` must include targetId.
- **Post-conditions**: Returns a new weighted choice each call.
- **Error handling**  
  - Logs *“Food list is empty or undefined”* and returns **`null`** when `allFoods` is empty / invalid.  

---

### `broadcast(sessionId, data)`

Sends a message to all clients in a session.

- **Parameters**:
  - `sessionId` (`string`)
  - `data` (`object`) - Will be serialized with `JSON.stringify`.
- **Pre-conditions**: `sessions[sessionId]` must exist.
- **Post-conditions**: All clients with `readyState === OPEN` will receive the message.
- **Error handling**  
  - If `sessions[sessionId]` is missing, the function exits silently.  
  - Wraps each `client.send()` in `try / catch`; on failure it logs  

- **Example**:  
  ```js
  broadcast("ABCDE", {
    type: "SCORE_UPDATE_BROADCAST",
    payload: { scores: { User123: 3, User456: 1 } }
  });



---

## Data Structures

### `sessions: { [sessionId: string]: Set<WebSocket> }`
Tracks all sockets connected to each active session.

### `scoresBySession: { [sessionId: string]: { [userId: string]: number } }`
Stores player scores per session.

### `activeFoods: { [sessionId: string]: FoodInstance[] }`
Holds current active food objects on screen.

### `fruitQueues: { [sessionId: string]: Food[] }`
FIFO queue of upcoming food to spawn.

### `fruitIntervals: { [sessionId: string]: Interval }`
Per-session loop interval that controls spawning and physics.

---

## Server Info

- **Port**: `4000` (local development)
- **Protocol**: `ws://` (WebSocket)
- **Session Storage**:
  - Local: `./src/data/sessionID.json`
  - Production: **PostgreSQL on Railway**
- **Frontend Deployment (Production)**:  
  Hosted on Vercel - communicates with this WebSocket backend via `wss://` in deployed mode.
