---
sidebar_position: 5
---

# Class Diagrams

## Backend

```mermaid
classDiagram
    direction RL

    class WebSocketServer {
        +httpServer: http.Server
        +wss: WebSocket.Server
        +sessions: Map~string, Session~
        +setupDatabase()
        +broadcast(sessionId, data)
        +onConnection(ws)
        +handleUpgrade(request, socket, head)
        +listen(port)
    }

    class Session {
        +sessionId: string
        +clients: Set~Client~
        +scores: Map~string, number~
        +fruitQueue: Food[]
        +activeFoods: FoodInstance[]
        +gameMode: string
        +currentTargetFoodId: string
        +currentTargetEffect: string
        +fruitInterval: Interval
        +startGame(mode)
        +enqueueFood(food)
        +handlePlayerAction(action)
        +broadcastState()
    }

    class Client {
        +userId: string
        +role: string
        +color: string
        +edge: string
        +ws: WebSocket
        +send(data)
    }

    class FoodInstance {
        +instanceId: string
        +foodId: string
        +x: number
        +y: number
        +vx: number
        +vy: number
        +effect: string
    }

    class DatabaseService {
        <<PostgreSQL>>
        +pool: Pool
        +setupTables()
        +saveSession(sessionId)
        +addPlayer(sessionId, userId, role)
        +removePlayer(sessionId, userId)
        +sessionExists(sessionId)
    }

    WebSocketServer "1" *-- "*" Session : manages
    Session "1" *-- "*" Client : tracks
    Session "1" o-- "*" FoodInstance : spawns
    WebSocketServer ..> DatabaseService : persists
```

**Figure 1.** This diagram illustrates the architecture of our current backend service.

### Relationships

The primary entry point is the WebSocketServer, which is responsible for managing all active game rooms. For each game, it creates and holds a Session instance.

Each Session encapsulates the entire state and logic for a single game. It contains the set of connected Client objects and tracks all activeFoods, the fruitQueue, and player scores. The startGame and handlePlayerAction methods contain the core game logic, and a central game loop broadcasts the state to all players. A FoodInstance represents a specific food item currently on screen, with its own position and velocity. Each FoodInstance is an instance of a static Food object, which simply holds the food's name and ID.

For production, the WebSocketServer uses the DatabaseService to save and load session and player data, ensuring data is persisted.

## Frontend

```mermaid
classDiagram
  direction TB

  class App {
    +<Routes> BrowserRouter
  }

  class WebSocketContext {
    +isConnected: boolean
    +isReconnecting: boolean
    +connectedUsers: User[]
    +sendMessage(message)
    +subscribe(type, listener)
    +useMessage(type, handler)
    +resetGameState()
  }

  class AacInterface {
    +selectedItem: AacFood
    +selectedCategory: string
    +activeVerb: AacVerb
    +handleFoodClick(food)
    +handleVerbClick(verb)
    +handleCategoryClick(category)
  }

  class PhaserGame {
    +ref: game, scene
    +currentActiveScene(scene)
  }

  class Game {
    +players: Map~string, Hippo~
    +foods: Group
    +addPlayer()
    +setTargetFood(foodId, effect)
    +applyModeSettings(settings)
    +update()
  }

  class Hippo {
    +targetX: number
    +targetY: number
    +freeze(duration)
    +updatePointerFlip()
    +snapToEdge(edge)
    +setTargetPosition(x, y)
    +update()
  }

  class MoveStrategy {
    <<interface>>
    +update(sprite, cursors)
  }

  class EdgeSlideStrategy {
    +update()
  }

  class WalkStrategy {
    +update()
  }

  class JumpStrategy {
    +update()
  }

  class Presenter {
    +handleStartGame()
    +cycleMode()
  }

  class RoleSelect {
    +handleRoleSelect(role)
    +handleColorSelect(color)
    +handleStart()
  }

  class PhaserPage {
    +phaserRef: PhaserGame
    +currentFood: AacFood
    +setCurrentFood()
    +setScores()
    +sendMessage()
  }

  class Victory {
    +scores: Map~string, number~
    +handlePlayAgain()
  }

  class Storage {
    +updatePlayerInSessionStorage()
  }

  class Foods {
    +AAC_DATA: AacData
    +AAC_VERBS: AacVerb[]
  }

  class EventBus {
    +emit(event, data)
    +on(event, handler)
    +off(event, handler)
  }

  class Leaderboard {
    +scores: Record<string, number>
    +colors: Record<string, string>
    +userId: string
  }

  class MovementStore {
    +subscribe(listener)
    +unsubscribe(listener)
    +notifyMove(payload)
  }

  %% Relationships
  App --> WebSocketContext
  App --> PhaserPage
  App --> AacInterface
  App --> Presenter
  App --> RoleSelect
  App --> Victory

  WebSocketContext --> EventBus
  WebSocketContext --> MovementStore

  AacInterface --> EventBus
  AacInterface --> Foods
  AacInterface --> WebSocketContext : uses

  PhaserGame --> Game
  PhaserPage --> PhaserGame
  PhaserPage --> WebSocketContext : uses
  PhaserPage --> EventBus : listens
  PhaserPage --> Leaderboard

  Game --> Hippo : creates
  Game --> MovementStore
  Hippo --> MoveStrategy
  MoveStrategy <|.. EdgeSlideStrategy
  MoveStrategy <|.. WalkStrategy
  MoveStrategy <|.. JumpStrategy

  RoleSelect --> Storage
  RoleSelect --> WebSocketContext
  Presenter --> WebSocketContext
  Victory --> WebSocketContext
  Victory --> EventBus


```

### Relationships

Starts at the App component, which wraps the entire application in a WebSocketProvider and defines the routing for all gameplay views. Each route represents a distinct user page tied to the player's current role in the session.

PhaserPage mounts the PhaserGame wrapper, which instantiates the Game scene which manages game physics, player movement, collision, and food effects. Each player is represented by a Hippo object, whose movement behavior is controlled by MoveStrategy implementations like EdgeSlideStrategy, WalkStrategy, or JumpStrategy.

Communication between components and game is done through the EventBus and WebSocketContext, which listen for updates and synchronizes state across the network. The MovementStore allows syncing of player position. The Foods module provides access to the AAC vocabulary, while Storage handles session reloads. UI components like Leaderboard, Victory give feedback tied to game state.
