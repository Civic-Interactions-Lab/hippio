---
sidebar_position: 4
---

# Sequence Diagrams

## Use Case 1 - Start Game Session (Host)
*As a host, I want to initiate a new game session from my device, so that players can join.*
1. The host opens the game and chooses to start a new session.
2. A unique game code and QR code is created and shown on their screen.
3. The host shares this code (or QR code) with those who want to join.
4. As players join the game, their hippo avatars and roles appear on the host’s screen.
5. Once at least one AAC user and one hippo player have joined, the host can begin the game.inputs.
    
```mermaid
---
title: Sequence Diagram – Start Game Session (Host)
---

sequenceDiagram
    actor Host
    participant HostClient
    participant Server
    participant PlayerClient
    actor Player

    Host ->> HostClient: “Create new game”
    HostClient ->> Server: POST /sessions
    activate Server
    Server ->> Server: Generate game code + QR
    Server -->> HostClient: code + QR
    deactivate Server

    HostClient -->> Host: Display code + QR
    Host -->> Player: Share code / QR

    loop Each player joins
        Player ->> PlayerClient: Enter code
        PlayerClient ->> Server: Join <code>
        Server ->> Server: Register player & assign role
        Server -->> HostClient: New avatar + role
        HostClient -->> Host: Update lobby
    end

    Server -->> HostClient: AAC + Hippo present
    HostClient -->> Host: “Start game?” prompt
    Host ->> HostClient: Click “Begin”
    HostClient ->> Server: start_game

```


## Use Case 2 – Join Game Session (Hippo Player or AAC User)
*As a hippo player or AAC User, I want to join a game session using a code so that I can play the game.*

1. A player opens the game on their device.
2. They enter or scan the game code that was shared by the host.
3. They choose a role: Hippo Player or AAC User
4. Hippo Players also choose a hippo color.
5. Once joined, they wait until the host starts the game.


```mermaid
---
title: Sequence Diagram 2 - Join Game Session
---

sequenceDiagram
    actor Host
    actor Player

    participant HostClient
    participant PlayerClient
    participant Server

    Host ->> HostClient: Code + QR on-screen
    HostClient -->> Host: Displayed
    Host -->> Player: Share code / QR

    Player ->> PlayerClient: Launch app, enter code
    PlayerClient ->> Server: VALIDATE_SESSION
    Server -->> PlayerClient: SESSION_VALIDATED

    alt Role = Hippo Player
        Player ->> PlayerClient: Select “Hippo”
        PlayerClient ->> Server: PLAYER_JOIN
        Server -->> PlayerClient: “Pick color”
        Player ->> PlayerClient: Choose color
        PlayerClient ->> Server: COLOR_UPDATED
    else Role = AAC User
        Player ->> PlayerClient: Select “AAC User”
        PlayerClient ->> Server: PLAYER_JOIN
    end

    Server -->> PlayerClient: Lobby state
    PlayerClient -->> Player: Waiting for host…



```

## Use Case 3 – Start Game (Host)
*As a host, I want to start the game after players have joined so that everyone can begin playing.*

1. The Host Player sees a "Start Game" button on their game interface.
2. The Host Player taps "Start Game".
3. The Host Player's client sends a start_game command to the backend via WebSocket.
4. The backend updates the central game state in PostgreSQL to state = 'playing'.
5. The backend broadcasts the updated game state (playing) to all connected clients via WebSocket.
6. All clients (Host, AAC User, and Other Players) immediately switch to the gameplay screen and the game begins for everyone at the same time.


```mermaid
---
title: Sequence Diagram 3 – Start Game (No Countdown)
---

sequenceDiagram
    participant Host_Player  as Host Player
    participant AAC_User     as AAC User
    participant Other_Player as Other Player
    participant Interface    as Game Interface (Client Apps)
    participant WS_Server    as Backend WebSocket Server
    participant DB           as PostgreSQL DB

    %% ─── Host starts the game ─────────────────────────────
    Host_Player ->> Interface: Sees “Start Game” button
    Host_Player ->> Interface: Taps “Start Game”

    %% ─── Command sent to backend ──────────────────────────
    Interface   ->> WS_Server: WebSocket: start_game command
    WS_Server   ->> DB       : UPDATE games SET state='playing' WHERE id=...

    %% ─── State broadcast to all clients ──────────────────
    WS_Server  -->> Interface : WebSocket: state = playing
    Interface  ->> Host_Player  : Display gameplay screen
    Interface  ->> AAC_User     : Display gameplay screen
    Interface  ->> Other_Player : Display gameplay screen

```

## Use Case 4 – Control Food Queue (AAC User)

*As an AAC user, I want to control the food in the queue so that I can challenge players.*

1. During the game, the AAC user sees a menu of foods they can pick from.
2. They tap the foods they want the other players to go after.
3. They can also choose a special effect, like Freeze or Grow
4. The foods they picked becomes the new target for all the hippos playing.
5. The chosen food appears on screen, and players try to catch it with their hippos.

```mermaid
---
title: Sequence Diagram 4 – Control Food Queue
---

sequenceDiagram
    actor AAC_User as AAC User
    participant AAC_Interface as AAC Interface
    participant WebSocket_Client as WebSocket Context
    participant WebSocket_Server as WebSocket Server
    participant Phaser_Scene as Game Scene
    participant Spectator_UI as Spectator View

    AAC_User->>AAC_Interface: Select food and (optionally) effect
    AAC_Interface->>WebSocket_Client: sendMessage('AAC_FOOD_SELECTED', payload)
    WebSocket_Client->>WebSocket_Server: WebSocket → AAC_FOOD_SELECTED

    WebSocket_Server->>WebSocket_Server: Update targetFoodId and effect
    WebSocket_Server->>WebSocket_Server: Unshift food into queue

    WebSocket_Server-->>WebSocket_Client: AAC_TARGET_FOOD
    WebSocket_Client-->>Phaser_Scene: Emit setTargetFood
    WebSocket_Client-->>Spectator_UI: Emit setTargetFood

```

## Use Case 5 – Eats Food (Player)

*As a player, I want to move my hippo on my side and eat the correct food so that I can earn points.*

1. Food spawn out from the center of the screen toward each hippo player.
2. The screen shows which food the AAC user has selected as the target.
3. The player moves their hippo along their edge of the screen to try to catch that food.
4. If they catch the correct food, they earn a point — and may receive a bonus effect like growing bigger.
5. If they catch the wrong food, they may lose a point or trigger a penalty like being frozen.
6. The game continues until the timer runs out.

```mermaid
---
title: Sequence Diagram 5 – Eats Food
---

sequenceDiagram
    actor Hippo_Player as Hippo Player
    participant Phaser_Scene as Game Scene
    participant WebSocket_Client as WebSocket Context
    participant WebSocket_Server as WebSocket Server
    participant Spectator_UI as Spectator View

    Hippo_Player->>Phaser_Scene: Move hippo toward food
    Phaser_Scene->>Phaser_Scene: Detect collision with food

    alt Collision with correct food
        Phaser_Scene->>Phaser_Scene: Apply effect (e.g. freeze, grow)
        Phaser_Scene->>WebSocket_Client: sendMessage('FRUIT_EATEN_BY_PLAYER')
        Phaser_Scene->>WebSocket_Client: sendMessage('FRUIT_EATEN', instanceId)
    else Collision with incorrect food
        Phaser_Scene->>WebSocket_Client: sendMessage('FRUIT_EATEN_BY_PLAYER')
    end

    WebSocket_Client->>WebSocket_Server: Forward score update and food removal
    WebSocket_Server->>WebSocket_Server: Update scores

    WebSocket_Server-->>WebSocket_Client: SCORE_UPDATE_BROADCAST
    WebSocket_Client-->>Phaser_Scene: Emit scoreUpdate
    WebSocket_Client-->>Spectator_UI: Emit scoreUpdate

    WebSocket_Server-->>WebSocket_Client: REMOVE_FOOD
    WebSocket_Client-->>Phaser_Scene: Emit removeFruit
    WebSocket_Client-->>Spectator_UI: Emit removeFruit

```

## Use Case 6 – Game Timer and End State (Host)
*As a player or AAC user, I want the game to end automatically after 3 minute so we know when the round is over.*

1. The host starts the game. (See Use Case 3.)
2. The backend WebSocket server starts the timer and tracks the countdown for the game session.
3. When the timer reaches 0, the backend sets the game state in PostgreSQL to ended.
4. The backend broadcasts the game end and scores to all clients via WebSocket.
5. A score screen is shown to all players.
6. The host sees a “Play Again” or “End Game” option.


```mermaid
---
title: Sequence Diagram 6 – Game Timer and End State (Backend Timer Activity)
---
sequenceDiagram
participant Host as Host Player
participant Game_UI as Game UI (Client)
participant WS_Server as WebSocket Server (Backend)
participant DB as PostgreSQL DB
participant Timer as Timer (Backend Activity)
participant All_Players as All Players

Host->>Game_UI: Open timer selection screen
Game_UI-->>Host: Show default timer (180 seconds)
Host->>Game_UI: Adjust timer (optional)
Host->>Game_UI: Start game
Game_UI->>WS_Server: WebSocket: start_game with timer value

WS_Server->>DB: UPDATE games SET state='playing', timer=VALUE
WS_Server->>Timer: Start timer for session (timer value)

alt Each second
    Timer-->>WS_Server: Timer tick (current time left)
    WS_Server-->>Game_UI: WebSocket: timer tick
end

Timer-->>WS_Server: Timer reached 0
WS_Server->>DB: UPDATE games SET state='ended'
WS_Server-->>Game_UI: WebSocket: state=ended, final scores
Game_UI->>All_Players: Show score screen
Game_UI->>Host: Show “Play Again” or “End Game” options

```

## Use Case 7 – Play Again (AAC User or Player)
*As an AAC user or player, I want to play another game session after a round ends.*

1. After the game ends, if the host taps or uses audio to “Play Again”, go to Use Case 3.
2. If the host taps or uses audio to “End Game”, all users are redirected to the game homescreen.

```mermaid
---
title: Sequence Diagram – Play Again Option (WebSocket + PostgreSQL)
---

sequenceDiagram
participant Host as Host Player
participant Game_UI as Game UI (Client)
participant WS_Server as WebSocket Server (Backend)
participant DB as PostgreSQL DB
participant All_Players as All Players

alt Host chooses "Play Again"
    Host->>Game_UI: Tap/voice "Play Again"
    Game_UI->>WS_Server: WebSocket: play_again
    WS_Server->>DB: Reset game state for new round
    WS_Server-->>Game_UI: WebSocket: state = lobby / ready
    Game_UI->>All_Players: Go to Use Case 3 (Start New Game)
else Host chooses "End Game"
    Host->>Game_UI: Tap/voice "End Game"
    Game_UI->>WS_Server: WebSocket: end_game
    WS_Server-->>Game_UI: WebSocket: end_session
    Game_UI->>All_Players: Redirect to game home screen
end
```

## Connection Recovery – Lost Connection and Reconnect
*As a player, if my connection drops during a game, I want the game to reconnect on its own, so that my actions are not lost.*
1. The connection drops (for example, Wi-Fi drops or the server restarts).
2. The client tries to reconnect after 0.5 s, 1 s, 2 s, and so on, up to every 10 s.
3. Actions taken while disconnected are queued.
4. When it reconnects, the client rejoins its session and sends the queued actions in order.
5. If the server no longer has the session, it ignores the queued actions, and the player is told and returns to the home page.
```mermaid
---
title: Sequence Diagram – Lost Connection and Reconnect
---

sequenceDiagram
participant Player as Player
participant Client as Game UI (WebSocketContext)
participant WS_Server as WebSocket Server (Backend)

WS_Server--xClient: Connection lost
Client->>Client: Schedule reconnect (0.5 s, 1 s, 2 s, ... up to 10 s)
Player->>Client: Selects a food
Client->>Client: Queue AAC_FOOD_SELECTED
loop Until connected
    Client->>WS_Server: Open WebSocket
end
WS_Server-->>Client: Connected
Client->>WS_Server: PLAYER_JOIN (isReconnecting: true)
Client->>WS_Server: Send queued AAC_FOOD_SELECTED
alt Session still exists
    WS_Server-->>Client: USERS_LIST_UPDATE
    WS_Server-->>Client: AAC_TARGET_FOOD
else Session was lost (server restarted)
    WS_Server-->>Client: ERROR_MESSAGE (SESSION_NOT_FOUND)
    Note over WS_Server: Queued message ignored (unknown session)
    Client->>Player: Alert and return to home page
end
```
