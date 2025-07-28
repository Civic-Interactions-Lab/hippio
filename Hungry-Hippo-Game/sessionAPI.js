const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { Pool } = require('pg');

const server = http.createServer();
const wss = new WebSocket.Server({ noServer: true });

// Reject connections from unauthorized origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'https://project-acc-hungry-hippos.vercel.app'
];

server.on('upgrade', (request, socket, head) => {
  const origin = request.headers.origin;
  if (!allowedOrigins.includes(origin)) {
    console.log(`[WSS] Connection from unauthorized origin ${origin} rejected.`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    console.log(`[WSS] Connection from ${origin} accepted.`);
    wss.emit('connection', ws, request);
  });
});

const sessions = {};
const sessionFilePath = path.resolve(__dirname, './src/data/sessionID.json');

const scoresBySession = {};

const fruitQueues = {};      
const fruitIntervals = {}; 

const IS_PROD = process.env.NODE_ENV === 'production';
let pool;
if (IS_PROD) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

// Runs once to set up the database and tables
const setupDatabase = async () => {
  if (!IS_PROD) return;
  const client = await pool.connect();
  try {
    // Check if the tables exist, if not create them
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id VARCHAR(5) PRIMARY KEY,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Create a players table to store users in each session
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        session_id VARCHAR(5) NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        role VARCHAR(25),
        UNIQUE(session_id, user_id)
      );
    `);
    console.log('Database setup complete');
  } catch (err) {
    console.error('Error setting up database:', err);
  } finally {
    client.release();
  }
}

// Websocket Server
wss.on('connection', (ws) => {
  console.log('WSS Client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      // console.log('WSS Received:', data);

      // Validate session request
      if (data.type === 'VALIDATE_SESSION') {
        const { gameCode } = data.payload;
        let isValid = false;
        let sessionsData = { sessions: {} };
        if (!IS_PROD) {
          // If local development, read from the session file
          try {
            if (fs.existsSync(sessionFilePath)) {
              sessionsData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf-8'));
            }
          } catch (e) {
            console.error('Error reading session file:', e);
          }
          isValid = Object.hasOwn(sessionsData.sessions, gameCode);
        } else {
          // If in production, check the database
          try {
            const result = await pool.query('SELECT EXISTS (SELECT 1 FROM sessions WHERE session_id = $1)', [gameCode]);
            isValid = result.rows[0].exists;
          } catch (err) {
            console.error('Error validating session:', err);
          }
        }

        ws.send(JSON.stringify({
          type: 'SESSION_VALIDATED',
          payload: { isValid, gameCode }
        }));
      }

      // Handle session creation request
      if (data.type === 'CREATE_SESSION') {
        // If local development, skip database operations
        let sessionId;
        if (!IS_PROD) {
          let sessionsData = { sessions: {} };
          try {
            if (fs.existsSync(sessionFilePath)) {
              sessionsData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf-8'));
            }
          } catch (e) {
            console.error('Error reading session file:', e);
          }
          sessionId = generateUniqueSessionId(Object.keys(sessionsData.sessions));
          sessionsData.sessions[sessionId] = [];
          fs.writeFileSync(sessionFilePath, JSON.stringify(sessionsData, null, 2), 'utf-8');
        } else {
          // If in production, insert into the database
          while (true) {
            sessionId = generateSessionId();
            try {
              await pool.query('INSERT INTO sessions (session_id) VALUES ($1)', [sessionId]);
              break;
            } catch (err) {
              console.error('Error creating session:', err);
            }
          }
        } 
        ws.send(JSON.stringify({
          type: 'SESSION_CREATED',
          payload: { sessionId }
        }));
      }

      if (data.type === 'PLAYER_MOVE') {
      const { sessionId, userId, x, y } = data.payload;
      broadcast(sessionId, {
          type: 'PLAYER_MOVE_BROADCAST',
          payload: { userId, x, y }
         });
        }
        
      // When a player joins, store their WebSocket connection in the correct session room
      if (data.type === 'PLAYER_JOIN') {
        const { sessionId, userId, role, color } = data.payload;
        ws.sessionId = sessionId;
        ws.userId = userId;
        ws.role = role;
        ws.color = color;

        if (!sessions[sessionId]) {
          sessions[sessionId] = new Set(); 
        }
        sessions[sessionId].add(ws);
        console.log(`WSS User ${userId} joined session ${sessionId}. Total clients in session: ${sessions[sessionId].size}`);

        if (!scoresBySession[sessionId]) scoresBySession[sessionId] = {};
        if (role === 'Hippo Player' && !scoresBySession[sessionId][userId]) {
          scoresBySession[sessionId][userId] = 0;
        }

        if (IS_PROD) {
          // If in production, insert the player into the database
          try {
            await pool.query(`
              INSERT INTO players (session_id, user_id, role) VALUES ($1, $2, $3)
              ON CONFLICT (session_id, user_id) DO UPDATE SET role = EXCLUDED.role`, [sessionId, userId, role]);
          } catch (err) {
            console.error('Error adding player to database:', err);
          }
        }
        // Broadcast to all clients in that session that a new player has joined
        broadcast(sessionId, { 
          type: 'PLAYER_JOINED_BROADCAST', 
          payload: { 
            userId, role, color
          } 
        });
        // Collect all users in the session
        const usersInSession = Array.from(sessions[sessionId])
          .filter(client => client.readyState === WebSocket.OPEN)
          .map(client => ({
            userId: client.userId,
            role: client.role,
            color: client.color
          }));

        // Send full user list
        broadcast(sessionId, {
          type: 'USERS_LIST_UPDATE',
          payload: {
            users: usersInSession
          }
        });
        console.log(`[WSS] Broadcasting USERS_LIST_UPDATE to ${sessionId}:`, usersInSession);

        // Broadcast initial leaderboard with everyone at score 0
        broadcast(sessionId, {
          type: 'SCORE_UPDATE_BROADCAST',
          payload: { scores: scoresBySession[sessionId] }
        });

      }

      // When the presenter clicks "Start Game", broadcast to all clients in the session
      // to signal that the game has begun. Clients will navigate to the game screen.
      if (data.type === 'START_GAME') {
        const { sessionId, mode } = data.payload;
        console.log(`[WSS] Start game received for session ${sessionId} with mode ${mode}`);

        if (!fruitQueues[sessionId]) {
          const allFoods = require('./src/data/food.json').categories.flatMap(c => c.foods);
          fruitQueues[sessionId] = [];

          for (let i = 0; i < 10; i++) {
            const rand = allFoods[Math.floor(Math.random() * allFoods.length)];
            fruitQueues[sessionId].push(rand.id);
          }
        }

        sessions[sessionId].initialTargetSent = false;
        fruitIntervals[sessionId] = setInterval(() => {
          if (!sessions[sessionId]) {
            console.log(`[WSS DEBUG] Session ${sessionId} ended, stopping fruit launch interval.`);
            clearInterval(fruitIntervals[sessionId]);
            delete fruitIntervals[sessionId];
            return;
          }
          if (!fruitQueues[sessionId] || fruitQueues[sessionId].length === 0) return;

          const nextFood = fruitQueues[sessionId].shift();
          const allFoods = require('./src/data/food.json').categories.flatMap(c => c.foods);
          const targetFood = allFoods.find(f => f.id === nextFood);

          if (!sessions[sessionId].initialTargetSent) {
            broadcast(sessionId, {
              type: 'AAC_TARGET_FOOD',
              payload: {
                targetFoodId: nextFood,
                targetFoodData: targetFood,
              },
            });
            sessions[sessionId].initialTargetSent = true;
          }

          const randomFood = allFoods[Math.floor(Math.random() * allFoods.length)];
          fruitQueues[sessionId].push(randomFood.id);

          const hippoClients = [...sessions[sessionId]].filter(c =>
            c.readyState === WebSocket.OPEN && c.role === 'Hippo Player'
          );

          const launches = [];

          hippoClients.forEach(client => {
            if (!client.edge) {
              console.warn(`[WSS WARNING] No edge assigned to user ${client.userId}, defaulting to bottom`);
            }
            const edge = client.edge || 'bottom';
            const angleRange = getAngleRangeForEdge(edge);
            const angle = Math.random() * (angleRange.max - angleRange.min) + angleRange.min;
            //console.log(`[WSS DEBUG] Launching food for ${client.userId} from edge: ${edge} @ angle ${angle.toFixed(2)}`);
            launches.push({ foodId: nextFood, angle });
          });

          broadcast(sessionId, {
            type: 'FOOD_STREAM_LAUNCH',
            payload: {
              launches,
              targetFoodId: nextFood,
              targetFoodData: targetFood
            }
          });
        }, 2000);

        broadcast(sessionId, {
          type: 'START_GAME_BROADCAST',
          payload: { sessionId, mode }, 
        });
      }
const timerIntervals = {};

if (data.type === 'START_TIMER') {
  const { sessionId } = data.payload;
  if (timerIntervals[sessionId]) {
    console.log(`[WSS] Timer already running for session ${sessionId}, ignoring START_TIMER.`);
    return;
  }
  console.log(`[WSS] Starting timer for session ${sessionId}`);

  let secondsLeft = 20;
  timerIntervals[sessionId] = setInterval(() => {
    if (secondsLeft <= 0) {
      console.log(`[WSS] Timer ended for session ${sessionId}`);
      broadcast(sessionId, { type: 'TIMER_UPDATE', secondsLeft: 0 });
      broadcast(sessionId, { type: 'GAME_OVER' });

      clearInterval(fruitIntervals[sessionId]);
      delete fruitIntervals[sessionId];
      delete fruitQueues[sessionId];

      clearInterval(timerIntervals[sessionId]);
      delete timerIntervals[sessionId];
    } else {
      broadcast(sessionId, { type: 'TIMER_UPDATE', secondsLeft });
      secondsLeft--;
    }
  }, 1000);
}


      if (data.type === 'SET_EDGE') {
        const { sessionId, userId, edge } = data.payload;
        for (const client of sessions[sessionId]) {
          if (client.userId === userId) {
            client.edge = edge;
            console.log(`[WSS] Stored edge "${edge}" for user ${userId}`);
            break;
          }
        }

        const assignedEdges = [...sessions[sessionId]].map(c => `${c.userId}: ${c.edge}`);
        console.log(`[WSS DEBUG] Current edge map for session ${sessionId}:`, assignedEdges);
      }

      // When an AAC user selects a food, broadcast it to the session
      if (data.type === 'AAC_FOOD_SELECTED') {
        const { sessionId, food, effect } = data.payload;
        console.log(`WSS Food selected in session ${sessionId}:`, food);

        if (fruitQueues[sessionId]) {
          // Pushes AAC-selected food to the front of the queue
          fruitQueues[sessionId].unshift(food.id);
        }

        // Broadcasts the selected food as the official target
        broadcast(sessionId, {
          type: 'AAC_TARGET_FOOD',
          payload: { 
            targetFoodId: food.id, 
            targetFoodData: food,
            effect: effect || null // Include effect if provided
          }
        });
      }

      // Defines angle ranges in radians
      function getAngleRangeForEdge(edge) {
        switch (edge) {
          case 'top': return { min: -Math.PI * 3/4, max: -Math.PI / 4 };     // Up: -135° to -45°
          case 'bottom': return { min: Math.PI / 4, max: Math.PI * 3/4 };    // Down: +45° to +135°
          case 'left': return { min: Math.PI * 7/8, max: Math.PI * 9/8 };    // Left: 157.5° to 202.5°
          case 'right': return { min: -Math.PI / 4, max: Math.PI / 4 };      // Right: -45° to +45°
          default: return { min: 0, max: 2 * Math.PI };
        }
      }

      // Notify all players in the session to remove the fruit
      if (data.type === 'FRUIT_EATEN') {
        const { sessionId, foodId, x, y } = data.payload;
        broadcast(sessionId, {
          type: 'FRUIT_EATEN_BROADCAST',
          payload: { foodId, x, y }
        });
      }

      // Broadcast updated scores
      if (data.type === 'FRUIT_EATEN_BY_PLAYER') {
        const { sessionId, userId, isCorrect, allowPenalty } = data.payload;

        if (!scoresBySession[sessionId]) scoresBySession[sessionId] = {};
        const prev = scoresBySession[sessionId][userId] || 0;

        if (isCorrect) {
          scoresBySession[sessionId][userId] = prev + 1;
        } else if (allowPenalty) {
          scoresBySession[sessionId][userId] = Math.max(0, prev - 1);
        }

        broadcast(sessionId, {
          type: 'SCORE_UPDATE_BROADCAST',
          payload: { scores: scoresBySession[sessionId] }
        });
      }

      // When a player selects a color, broadcast it to the session
      if (data.type === 'SELECT_COLOR') {
        const { sessionId, userId, color } = data.payload;
        if (sessions[sessionId]) {
          // Find the client who sent the message and assign them the color
          for (const client of sessions[sessionId]) {
            if (client.userId === userId) {
              client.color = color;
              break;
            }
          }

          // Collect all taken colors in the session
          const takenColors = Array.from(sessions[sessionId])
            .map(client => client.color)
            .filter(c => c);

          broadcast(sessionId, {
            type: 'COLOR_UPDATE',
            payload: { takenColors }
          });

          const usersList = Array.from(sessions[sessionId]).map(client => ({
            userId: client.userId,
            role: client.role,
            color: client.color,
          }));

          broadcast(sessionId, {
            type: 'USERS_LIST_UPDATE',
            payload: { users: usersList },
          });

        }
      }

      if (data.type === 'RESET_GAME') {
        const { sessionId } = data.payload;
        console.log('[WSS] RESET_GAME received for session', sessionId);

        // Reset scores to 0 for Hippo Players
        if (scoresBySession[sessionId]) {
          console.log('[WSS] Scores before reset:', scoresBySession[sessionId]);
          for (const client of sessions[sessionId]) {
            if (client.role === 'Hippo Player') {
              console.log(`[WSS] Resetting score for ${client.userId}`);
              scoresBySession[sessionId][client.userId] = 0;
            }
          }
          console.log('[WSS] Scores after reset:', scoresBySession[sessionId]);
        } else {
          console.log('[WSS] No scores found for session', sessionId);
        }

        // Clear game timer
        if (timerIntervals[sessionId]) {
          clearInterval(timerIntervals[sessionId]);
          delete timerIntervals[sessionId];
          console.log(`[WSS] Cleared timer for session ${sessionId}`);
        }

        // Send updated scores to all clients
        broadcast(sessionId, {
          type: 'SCORE_UPDATE_BROADCAST',
          payload: { scores: scoresBySession[sessionId] }
        });

        // Notify clients to reset game UI
        broadcast(sessionId, {
          type: 'RESET_GAME_BROADCAST',
          payload: {},
        });
      }

if (data.type === 'LEAVE_SESSION') {
  const { sessionId, userId } = data.payload;
  console.log(`[WSS] LEAVE_SESSION received from ${userId} in ${sessionId}`);

  if (sessions[sessionId] && sessions[sessionId] instanceof Set) {
    // Convert Set to Array
    const clientsArray = Array.from(sessions[sessionId]);
    // Filter out the leaving user
    const filteredClients = clientsArray.filter(ws => ws.userId !== userId);
    // Convert back to Set
    sessions[sessionId] = new Set(filteredClients);
  } else {
    console.warn(`[WSS] sessions[${sessionId}] is not a Set`, sessions[sessionId]);
  }

  // Remove the user from scoresBySession
  if (scoresBySession[sessionId]) {
    delete scoresBySession[sessionId][userId];
  }

  // Broadcast updated users list, for example you may want to do:
  const usersList = Array.from(sessions[sessionId] || []).map(ws => ({
    userId: ws.userId,
    role: ws.role,
    color: ws.color,
  }));

  broadcast(sessionId, {
    type: 'USERS_LIST_UPDATE',
    payload: { users: usersList },
  });
}

      // When a user re-joins a session, update their role and color
      if (data.type === 'REJOIN_SESSION') {
        const { sessionId, userId, role, color } = data.payload;

        if (sessions[sessionId]) {
          for (const client of sessions[sessionId]) {
            if (client.userId === userId) {
              client.role = role;
              client.color = color;
              break;
            }
          }

          // Broadcast updated users
          broadcast(sessionId, {
            type: 'USERS_LIST_UPDATE',
            payload: {
              users: Array.from(sessions[sessionId]).map(client => ({
                userId: client.userId,
                role: client.role,
                color: client.color,
              })),
            },
          });
        }
      }

      if (data.type === 'END_SESSION') {
        const { sessionId } = data.payload;
        console.log(`[WSS] END_SESSION received for session ${sessionId}`);

        // Delete all session data: scores, connected users, etc.
        delete sessions[sessionId];
        delete scoresBySession[sessionId];

        // Broadcast to all clients that session ended
        broadcast(sessionId, {
          type: 'SESSION_ENDED',
          payload: { sessionId }
        });

      }

    } catch (error) {
        console.error('WSS Error processing message:', error);
    }
  });

  ws.on('close', async () => {
    const { sessionId, userId } = ws;
    if (!sessionId || !userId) {
      console.log('WSS Client disconnected without session or user ID');
      return;
    }
    console.log(`WSS Client ${userId} disconnected from session ${sessionId}`);

    // Remove the client from the ws
    if (sessions[sessionId]) {
      sessions[sessionId].delete(ws);

      // If the session still exists, broadcast the updated user list
      const usersInSession = Array.from(sessions[sessionId])
        .filter(client => client.readyState === WebSocket.OPEN)
        .map(client => ({
          userId: client.userId,
          role: client.role
        }));

      broadcast(sessionId, {
        type: 'USERS_LIST_UPDATE',
        payload: {
          users: usersInSession
        }
      });

      // After a player leaves, re-calculate the taken colors and notify everyone.
      const takenColors = Array.from(sessions[sessionId])
        .map(client => client.color)
        .filter(c => c);

      broadcast(sessionId, {
        type: 'COLOR_UPDATE',
        payload: { takenColors }
      });
      console.log(`WSS Player left, broadcasting updated USERS_LIST_UPDATE to ${sessionId}:`, usersInSession);
    }

    // Remove the session from the sessions object if it is empty
    if (sessions[sessionId].size === 0) {
      delete sessions[sessionId];
    }

    // Remove the client from the database
    let remainingPlayers = 0;
    if (IS_PROD) {
      try {
        await pool.query('DELETE FROM players WHERE session_id = $1 AND user_id = $2', [sessionId, userId]);
        const result = await pool.query('SELECT COUNT(*) FROM players WHERE session_id = $1', [sessionId]);
        remainingPlayers = parseInt(result.rows[0].count, 10);

        // If no players remain, remove the session from the database
        if (remainingPlayers === 0) {
          await pool.query('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
          console.log(`WSS Session ${sessionId} was empty and has been removed from the database.`);
        } else {
          console.log(`WSS Player ${userId} removed from session ${sessionId}. Remaining players: ${remainingPlayers}`);
        }
      } catch (err) {
        console.error('Error removing player from database:', err);
      }
    }
    
    if (!sessions[sessionId] || sessions[sessionId].size === 0) {
      // Clean up intervals and session data
      if (timerIntervals[sessionId]) {
        clearInterval(timerIntervals[sessionId]);
        delete timerIntervals[sessionId];
      }
      if (fruitIntervals[sessionId]) {
        clearInterval(fruitIntervals[sessionId]);
        delete fruitIntervals[sessionId];
      }
      if (fruitQueues[sessionId]) {
        delete fruitQueues[sessionId];
      }
      delete sessions[sessionId];
      console.log(`[WSS] Cleaned up session ${sessionId} after last client disconnected.`);
    }
  });
});

/**
 * Helper function to broadcast a message to all clients in a specific session
 * @param {string} sessionId The ID of the session room
 * @param {object} data The data to send
 */
function broadcast(sessionId, data) {
    if (sessions[sessionId]) {
        sessions[sessionId].forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    }
}

/**
 * Generates a random alphanumeric session ID consisting of uppercase letters and digits.
 *
 * @param {number} length - The desired length of the session ID. Defaults to 5.
 * @returns {string} A randomly generated session ID.
 */
function generateSessionId(length = 5) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < length; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Generates a unique session ID that does not exist in the given array of existing session IDs.
 *
 * @param {string[]} existingSessions - An array of session IDs that are already taken.
 * @param {number} length - The desired length of the new session ID. Defaults to 5.
 * @returns {string} A new unique session ID not present in the existingSessions array.
 *
 */
function generateUniqueSessionId(existingSessions, length = 5) {
  let newId;
  do {
    newId = generateSessionId(length);
  } while (existingSessions.includes(newId));
  return newId;
}

const PORT = process.env.PORT || 4000;
// Start the Express server
setupDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
  });
});