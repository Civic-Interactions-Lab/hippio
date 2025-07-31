---
sidebar_position: 1
description: Frontend API
---

# Frontend API

# AACInterface.tsx

### `AacInterfaceProps`
Defines the props for the AacInterface component.

| Field       | Type     | Description                             |
| ----------- | -------- | --------------------------------------- |
| `sessionId` | `string` | The session ID for the current game     |
| `userId?`   | `string` | Optional user ID                        |
| `role?`     | `string` | Optional role of the user               |

### `const AacInterface: React.FC<AacInterfaceProps>`

AacInterface component provides an interface for users to select foods and play associated audio clips.

- **Parameters:**  
  - `props`: `AacInterfaceProps` — The properties for the component.
- **Returns:** `JSX.Element` — The rendered component.

### State

| State Hook                                 | Type               | Purpose                                       |
| ----------------------------------------- | ------------------ | --------------------------------------------- |
| `selectedFood` / `setSelectedFood`        | `AacFood \| null`  | Tracks currently selected food                |
| `selectedCategory` / `setSelectedCategory`| `string \| null`   | Tracks currently selected food category       |
| `isAudioPlaying` / `setIsAudioPlaying`    | `boolean`          | Tracks if an audio clip is currently playing  |

#### `handleFoodClick(food: AacFood): void`

- **Purpose**: Handles user clicking on a food item.
- **Parameters:**  
  - `food: AacFood` — The clicked food item.
- **Returns:** `void`


#### `handleCategoryClick(category): void`

- **Purpose**: Handles clicking on a food category.
- **Parameters:**  
  - `category: { categoryName: string, ... }` — The selected category.
- **Returns:** `void`


#### `handleBackClick(): void`

- **Purpose**: Navigates back from food view to category view.
- **Returns:** `void`


#### `handleVerbClick(verb: AacVerb): void`

- **Purpose**: Handles the user selecting a modifier verb (burn, freeze, etc.)
- **Parameters:**  
  - `verb: AacVerb` — The selected modifier.
- **Returns:** `void`


#### `playAudioWithDelay(audioPath: string | undefined): void`

- **Purpose**: Plays audio after a delay and updates UI state.
- **Parameters:**  
  - `audioPath: string \| undefined` — Path to the audio file.
- **Returns:** `void`  
- **Exceptions:** Logs error if audio fails to play.


#### `playAudioWithoutDelay(audioPath: string | undefined): void`

- **Purpose**: Plays audio immediately without affecting UI state.
- **Parameters:**  
  - `audioPath: string \| undefined`
- **Returns:** `void`


#### `audio.onerror = () => { ... }`

- **Purpose**: Handles audio playback errors.
- **Exceptions:** Captures and logs playback errors.


#### `renderCategoryView(): JSX.Element`

- **Purpose**: Renders UI for selecting a food category.
- **Returns:** `JSX.Element` — Category selection UI


#### `renderFoodsView(): JSX.Element | null`

- **Purpose**: Renders UI for selecting a food in the selected category.
- **Returns:** `JSX.Element \| null` — Food selection UI or null if no category is selected


#### `return ( <div className="aac-container"> <div className="aac-device"> <h1> AAC Device <`

Renders the main AAC interface, including the selected food and category views.

- **Returns:** `JSX.Element` — The rendered AAC interface.

# AacPage.tsx

Renders the AAC (Augmentative and Alternative Communication) interface for selecting food items within a specific game session.

---

**Parameters:**  
- None — uses URL parameters and application context internally.

**Returns:**  
- `JSX.Element` — The rendered AAC interface or a fallback message if `sessionId` is missing.

---

## Route Parameters

| Param      | Type     | Description                                          | Example       |
|------------|----------|------------------------------------------------------|---------------|
| sessionId  | `string` | Unique identifier for the game session               | `'HG20Y'`     |
| userId     | `string` | Identifier for the AAC user                          | `'aacUser1'`  |
| role       | `string` | The role of the user (e.g., `'AAC User'`)            | `'AAC User'`  |

---

## WebSocket Integration

The component uses `useWebSocket` to access:

- `lastMessage`: Most recent WebSocket message.
- `connectedUsers`: Array of currently connected users.

---

## EventBus Integration

The component listens to the following event:

- `scoreUpdate` — Updates the internal `scores` state when emitted:
  ```tsx
  useEffect(() => {
    const handleScoreUpdate = ({ scores }) => setScores(scores);
    EventBus.on('scoreUpdate', handleScoreUpdate);
    return () => EventBus.off('scoreUpdate', handleScoreUpdate);
  }, []);

# Foods.ts

## `export interface AacFood`

Defines the structure for a single food item in the AAC system.

## `export interface AacCategory`

Defines the structure for a food category in the AAC system.

## `export interface AacData`

Defines the structure for the entire AAC data, which includes multiple categories.

## `export const AAC_DATA: AacData = aacData as AacData`

Exports the AAC data, which includes categories and their respective foods. This data is imported from a JSON file.


# Game.ts

## `class: Game extends Phaser.Scene`

## Data Fields

| Field                     | Type                                     | Purpose                                         |
| ------------------------- | ---------------------------------------- | ----------------------------------------------- |
| `sessionId`               | `string`                                 | Current WebSocket session ID                    |
| `hippo`                   | `Hippo \| null`                          | Local player’s hippo sprite                     |
| `foods`                   | `Phaser.Physics.Arcade.Group`            | Group of all active food sprites                |
| `currentTargetFoodId`     | `string \| null`                         | ID of food chosen by AAC user                   |
| `currentTargetFoodEffect` | `AacVerb \| null`                        | Active effect (burn, freeze, grow)              |
| `playerScores`            | `Record<string, number>`                 | Map of player scores                            |
| `players`                 | `Record<string, Hippo>`                  | Map of player IDs to hippo sprites              |
| `edgeAssignments`         | `Record<string, string>`                 | Screen edge (top, bottom, etc.) per player      |
| `availableEdges`          | `string[]`                               | Remaining edges available for assignment        |
| `cursors`                 | `Phaser.Types.Input.Keyboard.CursorKeys` | Arrow key input                                 |
| `sendMessage`             | `(msg: any) => void`                     | WebSocket message sender                        |
| `localPlayerId`           | `string`                                 | Current user’s ID                               |
| `usePointerControl`       | `boolean`                                | Whether pointer dragging is active              |
| `isKeyboardActive`        | `boolean`                                | Whether keyboard is being used                  |
| `role`                    | `string`                                 | "Hippo Player", "Spectator", "AAC User"         |
| `lastSentX/Y`             | `number \| null`                         | Last movement sync position                     |
| `lastMoveSentAt`          | `number`                                 | Timestamp of last movement sent                 |
| `modeSettings`            | `ModeSettings`                           | Current game mode rules (fruitSpeed, penalties) |
| `hasUserInteracted`       | `boolean`                                | Used to hide swipe tutorial                     |
| `swipeHint`               | `Phaser.GameObjects.Image \| undefined`  | Swipe hint image                                |
| `timerText`               | `Phaser.GameObjects.Text`                | Countdown timer UI                              |

## Methods

### `constructor()`
-   **Purpose**: Initializes the Phaser scene with ID `"Game"`.
-   **Pre-conditions**: None
-   **Post-conditions**: Scene is registered with the Phaser runtime.
-   **Returns**: `Game` instance
-   **Exceptions**: None

### `init(data)`
-   **Purpose**: Initializes the scene with player/session/game mode info.
-   **Parameters**:
    -   `data: { sendMessage, localPlayerId, sessionId, role, connectedUsers?, modeSettings? }`
-   **Pre-conditions**: Called from React before `create()`.
-   **Post-conditions**: Internal state and players are set up.
-   **Returns**: void
-   **Exceptions**: None

### `preload()`
-   **Purpose**: Loads images and assets into memory.
-   **Pre-conditions**: None
-   **Post-conditions**: Images available to use in scene.
-   **Returns**: void
-   **Exceptions**: None

### `create()`
-   **Purpose**: Builds the game world, sets up input and listeners.
-   **Pre-conditions**: `preload()` must have been called.
-   **Post-conditions**: Scene is active.
-   **Returns**: void
-   **Exceptions**: None

### `update()`
-   **Purpose**: Handles input, movement, and syncs positions.
-   **Pre-conditions**: `create()` must have been called.
-   **Post-conditions**: Scene reflects latest state each frame.
-   **Returns**: void
-   **Exceptions**: WebSocket send failure is caught and logged:
    -   `'[Game.update] Failed to send player movement'`

* * * * *

Gameplay Methods
----------------

### `addPlayer(playerId: string, color?: string)`
-   **Purpose**: Adds a new hippo to the scene at an available edge.
-   **Pre-conditions**: `connectedUsers` passed to `init()`
-   **Post-conditions**: Hippo sprite is visible and tracked
-   **Returns**: void
-   **Exceptions**: None

### `getEdgeCursors(edge, cursors)`
-   **Purpose**: Remaps arrow keys to match orientation of assigned edge.
-   **Parameters**:
    -   `edge: Edge` -- assigned side of screen
    -   `cursors: CursorKeys` -- raw keyboard input
-   **Returns**: Remapped `CursorKeys` object
-   **Exceptions**: None

### `handlePointer(pointer)`
-   **Purpose**: Updates hippo position based on touch/mouse drag.
-   **Parameters**:
    -   `pointer: Phaser.Input.Pointer`
-   **Pre-conditions**: Only runs for local Hippo Player
-   **Post-conditions**: Hippo target position is updated
-   **Returns**: void
-   **Exceptions**: None

* * * * *

WebSocket Interaction
---------------------

### `requestStartTimer()`
-   **Purpose**: Sends `"START_TIMER"` message to backend
-   **Pre-conditions**: Scene must be active
-   **Post-conditions**: Backend starts countdown
-   **Returns**: void
-   **Exceptions**: None

### `applyModeSettings(settings)`
-   **Purpose**: Updates game difficulty rules
-   **Parameters**: `settings: ModeSettings`
-   **Pre-conditions**: Called before game starts
-   **Returns**: void
-   **Exceptions**: None

* * * * *

EventBus Integration
--------------------

### `applyEffectToPlayer(userId, effect)`
-   **Purpose**: Applies freeze, grow, burn effect with tint to a hippo
-   **Parameters**:
    -   `userId: string`
    -   `effect: AacVerb`
-   **Pre-conditions**: `effect` must be valid
-   **Post-conditions**: Visual and gameplay change applied
-   **Returns**: void
-   **Exceptions**: None

### `handleFruitCollision(playerId, fruit)`
-   **Purpose**: Triggered when a hippo touches fruit
-   **Parameters**:
    -   `playerId: string`
    -   `fruit: GameObject`
-   **Pre-conditions**: Collision must occur
-   **Post-conditions**:
    -   Fruit disappears if correct
    -   Score updated
    -   Effects sent if enabled
-   **Returns**: void
-   **Exceptions**:
    -   WebSocket errors logged:
        -   `'[Game.handleFruitCollision] Error sending score update:'`

* * * * *

Food Management
---------------

### `setTargetFood(foodId, effect?)`
-   **Purpose**: Marks a fruit as the AAC target.
-   **Parameters**:
    -   `foodId: string`
    -   `effect?: AacVerb | null`
-   **Returns**: void
-   **Exceptions**: None

### `removeFoodByInstanceId(instanceId)`
-   **Purpose**: Deletes a fruit from the screen.
-   **Parameters**:
    -   `instanceId: string`
-   **Returns**: void
-   **Exceptions**: None

### `syncFoodState(serverFoods)`
-   **Purpose**: Matches client-side fruits to server state
-   **Parameters**:
    -   `serverFoods: FoodState[]`
-   **Pre-conditions**: Called on `FOOD_STATE_UPDATE`
-   **Returns**: void
-   **Exceptions**: None

* * * * *

Timer
----------

### `updateTimerUI(secondsLeft)`
-   **Purpose**: Changes on-screen timer text.
-   **Parameters**: `secondsLeft: number`
-   **Returns**: void
-   **Exceptions**: None

### `handleGameOver()`
-   **Purpose**: Stops game and displays "Game Over" overlay
-   **Returns**: void
-   **Exceptions**: None

* * * * *

Utility
-------

### `getEdgeAssignments()`
-   **Purpose**: Returns mapping of players to their screen edges
-   **Returns**: `Record<string, string>`
-   **Exceptions**: None



# PhaserGame.tsx

Overview
------------------

This is a React component that:
-   Mounts and manages a Phaser game instance
-   Forwards access to the game and scene via a shared ref
-   Responds to Phaser's `'current-scene-ready'` event

* * * * *

### `currentActiveScene`
-   **Type**: `(scene_instance: Phaser.Scene) => void`
-   **Purpose**: A callback function passed from the parent that receives the Phaser scene instance once it becomes ready.

* * * * *

**Ref Type: `IRefPhaserGame`**
------------------------------

This is the object passed back to the parent through the forwarded `ref`.
| Field   | Type                   | Purpose                                                   |
| ------- | ---------------------- | --------------------------------------------------------- |
| `game`  | `Phaser.Game \| null`  | The root Phaser game instance, created with `StartGame()` |
| `scene` | `Phaser.Scene \| null` | The current scene instance that is emitted by `EventBus`  |


* * * * *

**Local State (Inside Component)**
----------------------------------

| Field  | Type                                   | Purpose                                                                                               |
| ------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `game` | `React.RefObject<Phaser.Game \| null>` | Mutable reference to the Phaser game instance that doesn't change value when the component re-renders |
| `ref`  | `React.ForwardedRef<IRefPhaserGame>`   | Exposes `{ game, scene }` to parent via `ref.current` or callback                                     |

### `useLayoutEffect()`
- **Purpose**: Creates the Phaser game instance on mount and destroys it on unmount.
- **Parameters**: None directly (hook-based).
- **Pre-conditions**:
    -   Component must be mounted.
    -   A container with `id="game-container"` must exist in the DOM.
- **Post-conditions**:
    -   `game.current` is assigned a `Phaser.Game` instance.
    -   The `ref` receives `{ game, scene: null }`.
- **Returns**: A cleanup function that:
    -   Destroys the game (`game.current.destroy(true)`)
    -   Clears `game.current` to `null`.
- **Exceptions**: None

* * * * *

### `useEffect()`
- **Purpose**: Waits for `'current-scene-ready'` from the Phaser game and:
    -   Injects AAC food keys into the scene
    -   Calls `currentActiveScene(scene)` if provided
    -   Updates the forwarded `ref` with `{ game, scene }`
- **Parameters**: None directly (hook-based). Uses:
    -   `EventBus.on('current-scene-ready', scene_instance => ...)`
- **Pre-conditions**:
    -   Phaser game must emit `EventBus` event `'current-scene-ready'`
    -   Scene must support `.setFoodKeys()` method (optional)
- **Post-conditions**:
    -   Food keys are injected into the scene
    -   `currentActiveScene(scene)` callback is executed
    -   `ref.current` is updated with the live `scene` instance
- **Returns**: A cleanup function that removes the event listener:
    -   `EventBus.removeListener('current-scene-ready');`
- **Exceptions**: None.

* * * * *

### `return ( <div id="game-container" /> )`
- **Purpose**: Renders a DOM element into which the Phaser game will mount its canvas.
- **Pre-conditions**: Used by `StartGame("game-container")`.
- **Post-conditions**: Phaser canvas is injected into this `div`.
- **Returns**: JSX element:
    -   `<div id="game-container"></div>`
- **Exceptions**: None.

---

# LandingPage.tsx

### Overview

User interface for joining or creating a game session.  
This component allows the user to enter a 5-character session code to join a game,  
or to create a new game session by generating and saving a new session ID.

---

### Data Fields

| Field          | Type                         | Description                                               |
|----------------|------------------------------|-----------------------------------------------------------|
| `code`         | `string[]`                   | Stores user input for each character of the session code  |
| `inputsRef`    | `useRef<HTMLInputElement[]>` | References the input boxes                                |
| `isValidCode`  | `boolean`                    | Shows visual feedback when code is invalid                |

---

### WebSocket Fields (via Context)

| Field            | Type         | Description                                         |
|------------------|--------------|-----------------------------------------------------|
| `isConnected`    | `boolean`    | WebSocket connection status                         |
| `lastMessage`    | `any`        | Most recent message received                        |
| `sendMessage`    | `(msg) => void` | Sends message to WebSocket                         |
| `clearLastMessage` | `() => void` | Clears the latest received message                 |

---

### `handleStart(): void`

Attempts to join an existing game session using the entered 5-character code.

- **Purpose**:  
  Validates the session with the backend. If valid, generates a user ID and navigates to the RoleSelect screen.  
  If invalid, resets input and shows error feedback.

- **Pre-condition**:  
  Code must be exactly 5 characters.

- **Post-condition**:  
  Navigates to `/roleselect/:gameCode` with a generated `userId`.

- **Error Handling**:  
  Logs validation failure and resets inputs if the session is invalid.

---

### `handleCreateGame(): void`

Sends a request to the server to create a new game session.  
If successful, navigates to the presenter screen with the session ID.

- **Error Handling**:  
  Shows an alert if not connected to the server.

---

### `handleChange(value: string, index: number): void`

Handles user input and moves focus to the next input box.

- **Parameters**:
  - `value`: Character entered
  - `index`: Input index in the session code

---

### `handleKeyDown(e: KeyboardEvent, index: number): void`

Handles backspace to move focus to the previous input box.

- **Parameters**:
  - `e`: Keyboard event
  - `index`: Index of input field

---

### `handlePaste(e: ClipboardEvent): void`

Allows user to paste a full 5-character code.

- **Behavior**:  
  Distributes characters across input fields and focuses the next empty input.

---

### Return

- **Returns**: `JSX.Element` — The rendered landing page UI.

---

### Navigation Logic

- If `SESSION_VALIDATED` is received:  
  Navigates to `/roleselect/:gameCode` with a randomly generated `userId`.

- If `SESSION_CREATED` is received:  
  Navigates to `/presenter/:sessionId`.

---

# ButtonClick.tsx

## `ButtonClick` Component

A **reusable styled button** component that executes a callback function when clicked.

### Usage

```tsx
<ButtonClick text="Join Game" onClick={handleStart} />
```

---

### `interface ButtonClickProps`

Props for the `ButtonClick` component:

- `text: string` — The label text to display inside the button.
- `onClick: () => void` — Callback function triggered when the button is clicked.

---

### `function ButtonClick({ text, onClick }: ButtonClickProps): JSX.Element`

Renders the button with styles and binds the click event.

- **Parameters:**  
  `text` — Button label  
  `onClick` — Click handler

- **Returns:**  
  `JSX.Element` — A styled button element

---

# PhaserPage.tsx

## Data Fields
| Field              | Type                                      | Purpose                                                                               |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `currentFood`      | `AacFood \| null`                         | The current food the AAC user has selected as the target.                             |
| `scores`           | `Record<string, number>`                  | Player score map, updated via WebSocket.                                              |
| `gameMode`         | `GameMode \| null`                        | The game difficulty mode (`Easy`, `Medium`, `Hard`).                                  |
| `secondsLeft`      | `number`                                  | Countdown timer shown in sidebar.                                                     |
| `sessionId`        | `string \| undefined`                     | Unique session ID from URL params.                                                    |
| `userId`           | `string \| undefined`                     | Current user ID from URL params.                                                      |
| `location`         | `Location`                                | From `useLocation()`; contains user role (`Hippo`, `AAC`, `Spectator`) in `.state`.   |
| `navigate`         | `ReturnType<typeof useNavigate>`          | React Router navigation function.                                                     |
| `isSpectator`      | `boolean`                                 | `true` if the current user is a spectator (from location state).                      |
| `phaserRef`        | `React.RefObject<IRefPhaserGame \| null>` | Reference to Phaser game and scene (`{ game, scene }`). Passed into `<PhaserGame />`. |
| `connectedUsers`   | `{ userId, role, color? }[]`              | List of all players in the current session.                                           |
| `lastMessage`      | `any`                                     | Most recent message received over WebSocket.                                          |
| `sendMessage`      | `(msg: any) => void`                      | Sends data to the backend WebSocket server.                                           |
| `clearLastMessage` | `() => void`                              | Clears `lastMessage` to avoid duplicate handling.                                     |
| `colors`           | `Record<string, string>`                  | Maps each user ID to their assigned hippo color, for leaderboard use.                 |

* * * * *

JOIN on MOUNT
----------

### `useEffect(() => {...}, [sessionId, userId, role])`
-   **Purpose**: Joins the WebSocket session when the component mounts.
-   **Parameters**: None directly.
-   **Pre-conditions**: Requires valid `sessionId`, `userId`, and `role`.
-   **Returns**: void
-   **Exceptions**: None.

* * * * *

REMOTE PLAYER MOVEMENT SYNC
----------

### `useEffect(() => {...}, [lastMessage, userId, clearLastMessage])`
-   **Purpose**: Updates remote player movement when a `PLAYER_MOVE_BROADCAST` is received.
-   **Parameters**:
    -   `lastMessage`: contains the payload with `userId`, `x`, `y`.
-   **Pre-conditions**: Scene must exist and support `updateRemotePlayer()`.
-   **Returns**: void
-   **Exceptions**: None.

* * * * *

GAME MODE BROADCAST
----------

### `useEffect(() => {...}, [lastMessage, clearLastMessage])`
-   **Purpose**: Applies game mode settings when `START_GAME_BROADCAST` is received.
-   **Parameters**:
    -   `lastMessage.payload.mode: GameMode`
-   **Pre-conditions**: Scene must support `applyModeSettings()`.
-   **Returns**: void
-   **Exceptions**: None.

* * * * *

FOOD STATE SYNC
----------

### `useEffect(() => {...}, [lastMessage, clearLastMessage])`
-   **Purpose**: Handles multiple WebSocket message types:
    -   `FOOD_STATE_UPDATE`: syncs food state via `EventBus`.
    -   `AAC_TARGET_FOOD`: sets the target food in the scene and sidebar.
    -   `REMOVE_FOOD`: deletes food object from scene.
    -   `PLAYER_EFFECT_BROADCAST`: applies effects via `EventBus`.
-   **Parameters**: `lastMessage` payload varies by type.
-   **Pre-conditions**: Scene must support relevant methods.
-   **Returns**: void
-   **Exceptions**: None.

* * * * *

FRUIT EATEN LOCAL (EMITTED FROM PHASER)
----------

### `useEffect(() => {...}, [sendMessage, sessionId])`
-   **Purpose**: Emits `FRUIT_EATEN` to backend when triggered by the Phaser scene.
-   **Parameters**: `instanceId` from `EventBus`.
-   **Pre-conditions**: Requires `sessionId` and `sendMessage`.
-   **Returns**: void
-   **Exceptions**: None.

* * * * *

SCORE UPDATE BROADCAST (EVENTBUS)
----------

### `useEffect(() => {...}, [])`
-   **Purpose**: Updates the local scoreboard when `scoreUpdate` is emitted from `EventBus`.
-   **Parameters**: `{ scores }`
-   **Pre-conditions**: None
-   **Returns**: void
-   **Exceptions**: None

* * * * *

TIMER UPDATE BROADCAST (EVENTBUS)
----------

### `useEffect(() => {...}, [])`
-   **Purpose**: Updates the timer when `TIMER_UPDATE` is emitted from `EventBus`.
-   **Parameters**: `time: number`
-   **Pre-conditions**: Timer must be active
-   **Returns**: void
-   **Exceptions**: None

* * * * *

GAME OVER → VICTORY NAVIGATION
----------

### `useEffect(() => {...}, [navigate, sessionId, scores, connectedUsers])`
-   **Purpose**: Navigates to the Victory page when `gameOver` is emitted.
-   **Parameters**: none
-   **Pre-conditions**: `sessionId` must exist
-   **Returns**: void
-   **Exceptions**: Falls back to `/` if `sessionId` is missing

* * * * *

SET EDGE SYNC WITH BACKEND
----------

### `useEffect(() => {...}, [sendMessage, sessionId, userId, location.state?.role])`
-   **Purpose**: Sends `SET_EDGE` to backend after `edges-ready` is emitted from the scene.
-   **Parameters**: `{ sessionId, userId, edge }`
-   **Pre-conditions**: User must not be a Spectator, and edge must be known.
-   **Returns**: void
-   **Exceptions**: None

 ---



