const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { Pool } = require('pg');

const allFoods = require('./src/data/food.json').categories.flatMap(c => c.foods);


// Constants for game modes and their configurations
const MODE_CONFIG = {
  Easy: {
    fruitSpeed: 100,
    allowPenalty: false,
    allowEffect: false,
  },
  Medium: {
    fruitSpeed: 125,
    allowPenalty: true,
    allowEffect: true,
  },
  Hard: {
    fruitSpeed: 150,
    allowPenalty: true,
    allowEffect: true,
  },
};

const server = http.createServer();
const wss = new WebSocket.Server({ noServer: true });

const sessions = {};
const reconnectionTimers = {};
const sessionFilePath = path.resolve(__dirname, './src/data/sessionID.json');
const scoresBySession = {};
const fruitQueues = {};
const fruitIntervals = {};
const TARGET_FOOD_WEIGHT = 16; // Weight for the target food in the queue

const sessionGameModes = {};
let foodInstanceCounter = 0
const activeFoods = {};
const lastSpawnAt = {};


const QUEUE_MAX = 10;

// Reject connections from unauthorized origins
// ALLOWED_ORIGINS is a comma-separated list. Example:
// "https://hippio-smoky.vercel.app, https://preview-foo.vercel.app, http://localhost:3000"
function parseAllowedOrigins(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    // strip trailing slashes and force lowercase for comparison
    .map(s => s.replace(/\/+$/, '').toLowerCase());
}

const DEFAULT_ALLOWED = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005'
].map(s => s.replace(/\/+$/, '').toLowerCase());

const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS) ?? [];
if (allowedOrigins.length === 0) {
  console.warn('[WSS] ALLOWED_ORIGINS not set. Falling back to defaults (dev only).');
}
const ORIGINS = allowedOrigins.length ? allowedOrigins : DEFAULT_ALLOWED;

server.on('upgrade', (request, socket, head) => {
  const originHeader = (request.headers.origin || '').toLowerCase().replace(/\/+$/, '');
  // Check if the origin is in the allowed list
  if (!originHeader || !ORIGINS.includes(originHeader)) {
    console.log(`[WSS] Unauthorized origin: "${originHeader}". Allowed: ${JSON.stringify(ORIGINS)}`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  // If authorized, proceed with the WebSocket handshake
  wss.handleUpgrade(request, socket, head, ws => {
    console.log(`[WSS] Connection from ${originHeader} accepted.`);
    wss.emit('connection', ws, request);
  });
});



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
    // Create a table to store session data
    await client.query(`
      CREATE TABLE IF NOT EXISTS game_statistics (
        id INT PRIMARY KEY DEFAULT 1,
        total_sessions_played INT DEFAULT 0,
        total_hippo_players INT DEFAULT 0,
        total_aac_users INT DEFAULT 0,
        hippo_color_counts JSONB DEFAULT '{}'::jsonb,
        mode_counts JSONB DEFAULT '{}'::jsonb,
        total_correct_eats INT DEFAULT 0,
        total_wrong_eats INT DEFAULT 0,
        aac_food_counts JSONB DEFAULT '{}'::jsonb,
        aac_verb_counts JSONB DEFAULT '{}'::jsonb,
        last_updated TIMESTAMPTZ
      );
    `);
    await client.query(`
      INSERT INTO game_statistics (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    `);
    console.log('Database setup complete');
  } catch (err) {
    console.error('Error setting up database:', err);
  } finally {
    client.release();
  }
}

// Function to get a weighted random food item from the list
// This function will give more weight to the target food, making it more likely to be selected
function getWeightedRandomFood(allFoods, targetId) {
  if (!allFoods || allFoods.length === 0) {
    console.error('Food list is empty or undefined');
    return null;
  }
  const weightedList = [];
  for (const food of allFoods) {
    const weight = food.id === targetId ? TARGET_FOOD_WEIGHT : 1;
    for (let i = 0; i < weight; i++) {
      weightedList.push(food);
    }
  }
  return weightedList[Math.floor(Math.random() * weightedList.length)];
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
              await pool.query('UPDATE game_statistics SET total_sessions_played = total_sessions_played + 1, last_updated = NOW() WHERE id = 1');
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
        sessions[sessionId] = new Set();
        sessions[sessionId].statsLogged = false;
      }

      if (data.type === 'PLAYER_MOVE') {
        const { sessionId, userId, x, y } = data.payload;
        broadcast(sessionId, {
          type: 'PLAYER_MOVE_BROADCAST',
          payload: {
            userId,
            x,
            y
          }
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
          sendError(ws, {
            code: 'SESSION_NOT_FOUND',
            message: `Session ${sessionId} not found`,
            sessionId,
          });
          return;
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

        if (IS_PROD && sessions[sessionId]) {
          if (!sessions[sessionId].statsLogged) {
            try {
              await pool.query(
                "DELETE FROM players WHERE session_id = $1 AND role = 'Presenter'",
                [sessionId]
              );
              await pool.query(
                `UPDATE game_statistics SET mode_counts = jsonb_set(
                mode_counts,
                '{${mode}}',
                (COALESCE(mode_counts->>'${mode}', '0')::int + 1)::text::jsonb
              ) WHERE id = 1`
              );
              let hippoCount = 0;
              let aacCount = 0;
              for (const client of sessions[sessionId]) {
                if (client.role === 'Hippo Player') {
                  hippoCount++;
                } else if (client.role === 'AAC User') {
                  aacCount++;
                }
              }
              if (hippoCount > 0 || aacCount > 0) {
                await pool.query(
                  `UPDATE game_statistics SET 
                    total_hippo_players = total_hippo_players + $1, 
                    total_aac_users = total_aac_users + $2,
                    last_updated = NOW()
                  WHERE id = 1`,
                  [hippoCount, aacCount]
                );
              }
              sessions[sessionId].statsLogged = true;
            } catch (err) {
              console.error('[WSS] Error cleaning up presenter role:', err);
            }
          }
        }

        if (sessions[sessionId]) {
          sessions[sessionId].gameStarted = true;
        }

        // Store mode and reset per-session state
        sessionGameModes[sessionId] = mode;
        activeFoods[sessionId] = [];

        // Seed queue with objects
        if (!fruitQueues[sessionId]) {
          // const allFoods = require('./src/data/food.json').categories.flatMap(c => c.foods);
          // fruitQueues[sessionId] = [];
          // for (let i = 0; i < 10; i++) {
          //   const food = allFoods[Math.floor(Math.random() * allFoods.length)];
          //   fruitQueues[sessionId].push(food);

          //   if (fruitQueues[sessionId].length > QUEUE_MAX) {
          //     fruitQueues[sessionId] = fruitQueues[sessionId].slice(0, QUEUE_MAX);
          //   }
          // }


          clearFruitQueue(sessionId);
          for (let i = 0; i < QUEUE_MAX; i++) {
            const food = allFoods[Math.floor(Math.random() * allFoods.length)];
            enqueueFruit(sessionId, food);
          }
        }

        // Target tracking
        sessions[sessionId].initialTargetSent = false;
        sessions[sessionId].currentTargetFoodId = null;
        const SCREEN_WIDTH = 1024;
        const SCREEN_HEIGHT = 1024;

        // spawn mark (first spawn after 3s)
        lastSpawnAt[sessionId] = Date.now();

        // 50ms game loop; spawns happen every 3000ms
        const TICK_INTERVAL = 50;
        fruitIntervals[sessionId] = setInterval(() => {
          if (!sessions[sessionId]) {
            clearInterval(fruitIntervals[sessionId]);
            delete fruitIntervals[sessionId];
            return;
          }
          //const allFoods = require('./src/data/food.json').categories.flatMap(c => c.foods);
          const gameMode = sessionGameModes[sessionId] || 'Easy';
          const speed = MODE_CONFIG[gameMode].fruitSpeed;

          // spawn every 3s
          const now = Date.now();
          if (now - lastSpawnAt[sessionId] >= 3000) {
            lastSpawnAt[sessionId] = now;

            if (fruitQueues[sessionId] && fruitQueues[sessionId].length > 0) {
              const dequeued = fruitQueues[sessionId].shift();


              const nextFoodId = typeof dequeued === 'string' ? dequeued : dequeued.id;
              const targetFood = allFoods.find(f => f.id === nextFoodId);
              if (nextFoodId && targetFood) {
                if (!sessions[sessionId].initialTargetSent) {
                  sessions[sessionId].currentTargetFoodId = nextFoodId;
                  sessions[sessionId].initialTargetSent = true;
                  broadcast(sessionId, {
                    type: 'AAC_TARGET_FOOD',
                    payload: { targetFoodId: nextFoodId, targetFoodData: targetFood, effect: null },
                  });
                }

                const weightedFood = getWeightedRandomFood(allFoods, sessions[sessionId].currentTargetFoodId);
                // fruitQueues[sessionId].push(weightedFood); // keep objects

                // if (fruitQueues[sessionId].length > QUEUE_MAX) {
                //     fruitQueues[sessionId] = fruitQueues[sessionId].slice(0, QUEUE_MAX);
                //   }


                enqueueFruit(sessionId, weightedFood);

                foodInstanceCounter++;
                const instanceId = `food-${foodInstanceCounter}`;
                const hippoClients = [...sessions[sessionId]].filter(c => c.role === 'Hippo Player');

                hippoClients.forEach(client => {
                  // Assign a random angle based on the edge they selected
                  // Each hippo will spawn from their selected edge
                  const edge = client.edge || 'bottom';
                  const angleRange = getAngleRangeForEdge(edge);
                  const angle = Math.random() * (angleRange.max - angleRange.min) + angleRange.min;

                  const vx = (Math.cos(angle) * speed) / SCREEN_WIDTH;
                  const vy = (Math.sin(angle) * speed) / SCREEN_HEIGHT;

                  activeFoods[sessionId].push({
                    instanceId: `${instanceId}-${client.userId}`,
                    foodId: nextFoodId,
                    x: 0.5,
                    y: 0.5,
                    vx,
                    vy,
                    effect: (nextFoodId === sessions[sessionId].currentTargetFoodId) ? sessions[sessionId].currentTargetEffect : null,
                  });
                });

                // Broadcast the new food state to all clients in the session
                broadcast(sessionId, {
                  type: 'FOOD_STATE_UPDATE',
                  payload: { foods: activeFoods[sessionId] }
                });

                //console.log('[WSS] Spawned', nextFoodId, 'queueLen=', fruitQueues[sessionId].length);
              } else {
                console.warn('[WSS] Unknown food in queue, skipping spawn:', dequeued);
              }
            }
          }

          // physics tick @ 50ms
          const timeStep = TICK_INTERVAL / 1000; // convert to seconds
          activeFoods[sessionId].forEach(food => {
            food.x += food.vx * timeStep;
            food.y += food.vy * timeStep;
          });

          // broadcast motion
          broadcast(sessionId, {
            type: 'FOOD_STATE_UPDATE',
            payload: { foods: activeFoods[sessionId] }
          });

          // cull off-screen
          const BOUNDARY_BUFFER = 100;
          activeFoods[sessionId] = activeFoods[sessionId].filter(food =>
            food.x > -BOUNDARY_BUFFER &&
            food.x < 1024 + BOUNDARY_BUFFER &&
            food.y > -BOUNDARY_BUFFER &&
            food.y < 1024 + BOUNDARY_BUFFER
          );
        }, TICK_INTERVAL);

        broadcast(sessionId, {
          type: 'START_GAME_BROADCAST',
          payload: { sessionId, mode },
        });
      }


      if (data.type === 'START_TIMER') {
        const { sessionId } = data.payload;
        //console.log(`[WSS] Starting timer for session ${sessionId}`);

        let secondsLeft = 180;
        //console.log('[WSS] SECONDSLEFT INIT:', secondsLeft); 
        const interval = setInterval(() => {
          if (secondsLeft <= 0) {
            //console.log(`[WSS] Timer ended for session ${sessionId}`);
            broadcast(sessionId, { type: 'TIMER_UPDATE', secondsLeft: 0 });
            broadcast(sessionId, { type: 'GAME_OVER' });

            clearInterval(fruitIntervals[sessionId]);

            cleanupSession(sessionId);


            delete fruitIntervals[sessionId];
            delete fruitQueues[sessionId];

            clearInterval(interval);
          }
          else {
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
            //console.log(`[WSS] Stored edge "${edge}" for user ${userId}`);
            break;
          }
        }

        const assignedEdges = [...sessions[sessionId]].map(c => `${c.userId}: ${c.edge}`);
        // console.log(`[WSS DEBUG] Current edge map for session ${sessionId}:`, assignedEdges);
      }

      // When an AAC user selects a food, broadcast it to the session
      if (data.type === 'AAC_FOOD_SELECTED') {
        const { sessionId, food, effect } = data.payload;
        //console.log(`WSS Food selected in session ${sessionId}:`, food, effect);

        const gameMode = sessionGameModes[sessionId] || 'Easy';
        const finalEffect = MODE_CONFIG[gameMode].allowEffect ? effect : null;

        if (IS_PROD) {
          await pool.query(
            `UPDATE game_statistics SET aac_food_counts = jsonb_set(
              aac_food_counts,
              '{${food.id}}',
              (COALESCE(aac_food_counts->>'${food.id}', '0')::int + 1)::text::jsonb
            ) WHERE id = 1`
          );

          if (finalEffect) {
            await pool.query(
              `UPDATE game_statistics SET aac_verb_counts = jsonb_set(
                aac_verb_counts,
                '{${finalEffect.id}}',
                (COALESCE(aac_verb_counts->>'${finalEffect.id}', '0')::int + 1)::text::jsonb
              ) WHERE id = 1`
            );
          }
        }

        if (fruitQueues[sessionId]) {
          // Pushes AAC-selected food to the front of the queue
          // Keep queue entries as full objects, not ids
          const head = fruitQueues[sessionId][0];
          const headId = head && (head.id || head); // tolerate any stray ids
          if (headId !== food.id) {
            //   fruitQueues[sessionId].unshift(food);

            // if (fruitQueues[sessionId].length > QUEUE_MAX) {
            //   fruitQueues[sessionId] = fruitQueues[sessionId].slice(0, QUEUE_MAX);
            // }
            enqueueFruit(sessionId, food, { front: true });

          }
        }

        // Updates the session's current weighted target
        sessions[sessionId].currentTargetFoodId = food.id;
        sessions[sessionId].currentTargetEffect = finalEffect;

        // Broadcasts the selected food as the official target
        broadcast(sessionId, {
          type: 'AAC_TARGET_FOOD',
          payload: {
            targetFoodId: food.id,
            targetFoodData: food,
            effect: finalEffect
          }
        });
      }

      // When a player eats a target food with an effect, broadcast it to the session
      if (data.type === 'PLAYER_EFFECT_APPLIED') {
        const { sessionId, targetUserId, effect } = data.payload;
        broadcast(sessionId, {
          type: 'PLAYER_EFFECT_BROADCAST',
          payload: { targetUserId, effect }
        });
      }

      // Defines angle ranges in radians
      function getAngleRangeForEdge(edge) {
        switch (edge) {
          case 'top': return { min: -Math.PI * 3 / 4, max: -Math.PI / 4 };     // Up: -135° to -45°
          case 'bottom': return { min: Math.PI / 4, max: Math.PI * 3 / 4 };    // Down: +45° to +135°
          case 'left': return { min: Math.PI * 7 / 8, max: Math.PI * 9 / 8 };    // Left: 157.5° to 202.5°
          case 'right': return { min: -Math.PI / 4, max: Math.PI / 4 };      // Right: -45° to +45°
          default: return { min: 0, max: 2 * Math.PI };
        }
      }

      // Notify all players in the session to remove the fruit
      if (data.type === 'FRUIT_EATEN') {
        const { sessionId, instanceId } = data.payload;
        if (activeFoods[sessionId]) {
          activeFoods[sessionId] = activeFoods[sessionId].filter(f => f.instanceId !== instanceId);
        }
        broadcast(sessionId, {
          type: 'REMOVE_FOOD',
          payload: { instanceId }
        });
      }

      // Broadcast updated scores
      if (data.type === 'FRUIT_EATEN_BY_PLAYER') {
        const { sessionId, userId, isCorrect, allowPenalty, effect } = data.payload;

        if (!scoresBySession[sessionId]) scoresBySession[sessionId] = {};
        const prev = scoresBySession[sessionId][userId] || 0;

        if (isCorrect) {
          sessions[sessionId].currentTargetEffect = null;
          if (effect === 'burn') {
            scoresBySession[sessionId][userId] = Math.max(0, prev - 2);
            //console.log(`[WSS] Player ${userId} burned, score reduced by 2 from ${prev} to ${scoresBySession[sessionId][userId]}`);
          } else if (effect === 'grow') {
            scoresBySession[sessionId][userId] = prev + 2;
            // console.log(`[WSS] Player ${userId} grew, score increased by 2 from ${prev} to ${scoresBySession[sessionId][userId]}`);
          } else {
            scoresBySession[sessionId][userId] = prev + 1;
          }
        } else if (allowPenalty) {
          scoresBySession[sessionId][userId] = Math.max(0, prev - 1);
        }

        broadcast(sessionId, {
          type: 'SCORE_UPDATE_BROADCAST',
          payload: { scores: scoresBySession[sessionId] }
        });

        if (IS_PROD) {
          if (isCorrect) {
            await pool.query('UPDATE game_statistics SET total_correct_eats = total_correct_eats + 1 WHERE id = 1');
          } else {
            await pool.query('UPDATE game_statistics SET total_wrong_eats = total_wrong_eats + 1 WHERE id = 1');
          }
        }
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
        }
        // If in production, update the database with the color selection
        if (IS_PROD && color) {
          await pool.query(
            `UPDATE game_statistics SET hippo_color_counts = jsonb_set(
              hippo_color_counts,
              '{${color}}',
              (COALESCE(hippo_color_counts->>'${color}', '0')::int + 1)::text::jsonb
            ) WHERE id = 1`
          );
        }
      }

      // When a client requests an update on taken colors, broadcast the current state
      if (data.type === 'REQUEST_COLOR_UPDATE') {
        const { sessionId } = data.payload;
        if (sessions[sessionId]) {
          const takenColors = Array.from(sessions[sessionId])
            .map(client => client.color)
            .filter(c => c);

          broadcast(sessionId, {
            type: 'COLOR_UPDATE',
            payload: { takenColors }
          });
        }
      }

      // When a presenter clicks "End Game", broadcast to all clients in the session
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

    } catch (error) {
      console.error('WSS Error processing message:', error);
      sendError(ws, { message: 'Server error' });
    }
  });

  ws.on('close', async () => {
    const { sessionId, userId } = ws;
    if (!sessionId || !userId) {
      console.log('WSS Client disconnected without session or user ID');
      return;
    }
    console.log(`WSS Client ${userId} disconnected from session ${sessionId}`);

    let remainingPlayers = 0;
    if (IS_PROD && sessionId && userId) {
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

    // Remove the session from the sessions object if it is empty
    if (sessions[sessionId] && sessions[sessionId].size === 0) {
      cleanupSession(sessionId);
      delete sessions[sessionId];
    }

    // If the role is Presenter and the game hasn't started, broadcast SESSION_CLOSED
    if (userId === 'presenter' && sessions[sessionId] && !sessions[sessionId].gameStarted) {
      console.log(`[WSS] Presenter for session ${sessionId} disconnected. Starting 5s reconnect timer...`);
      reconnectionTimers[sessionId] = setTimeout(async () => {

        // Before closing, double-check if the presenter has rejoined.
        const sessionClients = sessions[sessionId] ? Array.from(sessions[sessionId]) : [];
        const isPresenterConnected = sessionClients.some(client => client.role === 'Presenter');

        if (!isPresenterConnected) {
          console.log(`[WSS] Presenter for ${sessionId} did not reconnect in time. Closing session.`);
          broadcast(sessionId, { type: 'SESSION_CLOSED' });
          cleanupSession(sessionId);
          delete sessions[sessionId];

          if (IS_PROD) {
            try {
              await pool.query('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
              console.log(`[WSS] Deleted timed-out session ${sessionId} from database.`);
            } catch (err) {
              console.error(`[WSS] Error deleting timed-out session ${sessionId} from DB:`, err);
            }
          }
        } else {
          console.log(`[WSS] Reconnect timer for ${sessionId} fired, but presenter has returned. Aborting closure.`);
        }
        delete reconnectionTimers[sessionId];
      }, 5000);
    }

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
    // if (sessions[sessionId].size === 0) {
    //   delete sessions[sessionId];
    // }

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
        try {
          client.send(JSON.stringify(data));
        } catch (err) {
          console.error('Error broadcasting to client:', err);
        }
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
  let attempts = 0;
  const maxAttempts = 1000;
  do {
    if (attempts >= maxAttempts) {
      throw new Error('Max attempts reached');
    }
    newId = generateSessionId(length);
    attempts++;
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

function cleanupSession(sessionId) {
  // Clear fruit interval if present
  if (fruitIntervals[sessionId]) {
    clearInterval(fruitIntervals[sessionId]);
    delete fruitIntervals[sessionId];
  }
  // Remove all per-session state
  delete activeFoods[sessionId];
  delete fruitQueues[sessionId];
  delete scoresBySession[sessionId];
  delete sessionGameModes[sessionId];
  delete lastSpawnAt[sessionId];
}


// ---- Queue Management Helpers ----
function enqueueFruit(sessionId, fruit, { front = false } = {}) {
  if (!fruitQueues[sessionId]) fruitQueues[sessionId] = [];
  if (front) {
    fruitQueues[sessionId].unshift(fruit);
  } else {
    fruitQueues[sessionId].push(fruit);
  }
  // Trim after any mutation
  if (fruitQueues[sessionId].length > QUEUE_MAX) {
    fruitQueues[sessionId] = fruitQueues[sessionId].slice(0, QUEUE_MAX);
  }
}

function dequeueFruit(sessionId) {
  if (!fruitQueues[sessionId] || fruitQueues[sessionId].length === 0) return null;
  return fruitQueues[sessionId].shift();
}

function clearFruitQueue(sessionId) {
  fruitQueues[sessionId] = [];
}

function sendError(ws, { code = 'SERVER_ERROR', message, ...meta }) {
  ws.send(
    JSON.stringify({
      type: 'ERROR_MESSAGE',
      payload: { code, message, ...meta },
    }),
  );
}