---
sidebar_position: 1
---

# Component Descriptions

This page describes the different components and technologies that will be used to build the AAC Hungry Hippos project.

## Frontend
### React.js
`A component-based web framework used to design web applications.`  
`We will use React to construct our front-end user interface, including the AAC device and the main UI.`

### Phaser
`A fast, free, and open-source HTML5 game framework. We will use Phaser to create and manage the core Hungry Hippos gameplay.`  
`It will render the game on a HTML canvas, handling all game logic, physics, and sprites.`

### TypeScript
`A superset of JavaScript that adds static typing. We will use TypeScript for all frontend code (React and Phaser) to improve code quality, and make the application easier to maintain.`

---
## Backend

### Node.js
`A JavaScript runtime environment that executes code outside of a web browser. Node.js is the foundation of our custom backend server, allowing us to handle game logic and real-time communication.`

### WebSocket
`A library for Node.js that enables two-way, real-time communication between the client and server. This is the core technology that allows us to synchronize game state, player movements, and actions across all connected devices.`

### Connection Reliability
`The WebSocket connection is designed so that game actions are not lost and players recover from dropped connections without refreshing the page.`

- **Automatic reconnect (client):** If the connection closes, `WebSocketContext` reconnects on its own, waiting 0.5 s, 1 s, 2 s, 4 s, 8 s, then every 10 s between attempts. Once connected, it rejoins the player's session using the session saved in local storage.
- **Message queue (client):** Messages sent while disconnected are held (up to 50) and sent in order once the connection opens. Movement updates are dropped instead, because they are out of date by then.
- **Message subscriptions (client):** Pages receive server messages through `useMessage(type, handler)`. Each message is passed straight to its handlers, so messages that arrive close together (such as an AAC food choice followed by a food position update) are never skipped.
- **Heartbeat (server):** Every 30 seconds the server pings each client. A client that has not answered the previous ping is disconnected, which removes it from its session.
- **Empty-session cleanup (server):** When the last player leaves, the session is kept for 30 seconds so a player who refreshes can rejoin. After that, the session and its timers are removed.
- **Unknown sessions (server):** Gameplay messages for a session the server no longer has (for example, after a server restart) are ignored. A player who tries to rejoin receives `SESSION_NOT_FOUND` and returns to the home page.

---
## Deployment & Hosting

### PostgreSQL
`An open-source relational database. For our production environment hosted on Railway, we use a PostgreSQL database to provide persistent storage for game sessions and player data, ensuring that game states are durable and can be managed effectively.`

### Railway
`A cloud infastructure platform for deploying applications. We will use Railway to host a custom WebSocket server (built with node.js).`     
`It will manage live game connections and relay real-time actions between all players in a game session.`

### Vercel
`A cloud platform for deploying and hosting front-end applications.`  
`Vercel will be used to host our main React application.`

### Docusaurus
`A static site generator for building documentation websites. We will use Docusaurus to create and host all project-related documentation.`