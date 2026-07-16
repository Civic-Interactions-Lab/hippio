require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { Pool } = require('pg');
const assert = require('assert');
// const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase-admin/firestore');

const allFoods = require('./src/data/food.json').categories.flatMap(c => c.foods);

const admin = require('firebase-admin');
let serviceAccount;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS.trim().startsWith('{')) {
        serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    } else {
        serviceAccount = require(path.resolve(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS));
    }
    console.log("serviceAccount from ", process.env.GOOGLE_APPLICATION_CREDENTIALS, " is ", serviceAccount)
} else {
    console.error("GOOGLE_APPLICATION_CREDENTIALS not set")
    process.exit(1)
}


/**
 * sessionAPI.js 
 */


// Helper function to append to CSV
function logPlayerAction(sessionId, playerId, actionType, details) {
    if (sessionId === undefined) sessionId = "undefined";
    if (playerId === undefined) playerId = "undefined";
    if (actionType === undefined) actionType = "undefined";

    if (details !== undefined && details !== null && typeof details === 'object') {
        for (let key in details) {
            if (details[key] === undefined) {
                details[key] = "undefined";
            }
        }
    } else if (details === undefined) {
        details = "undefined";
    }

    // const logFilePath = path.join(__dirname, "logs", sessionId + "_player_actions_log.csv");
    const timestamp = new Date().toISOString();
    // const row = `${timestamp},${playerId},${actionType},"${details.replace(/"/g, '""')}"\n`;
    // fs.appendFile(logFilePath, row, (err) => {
    //     if (err) console.error("Error writing to CSV log:", err);
    // });

    if (!sessionLogQueue[sessionId]) {
        sessionLogQueue[sessionId] = [];
    }

    let actionData = {
        timestamp,
        playerId,
        actionType,
        details
    };

    // if (details) {
    //     if (typeof details === 'object' && details !== null) {
    //         // Append detail field onto actionData alongside its other fields 
    //         // using Object.assign() method to copy properties from details to actionData
    //         Object.assign(actionData, details);
    //     } else {
    //         actionData.details = details;
    //     }
    // }
    if (actionType === 'moved') {
        sessionLogQueue[sessionId].push(actionData);
    } else {
        if (sessionLogDocument[sessionId]) {
            if (!sessionLogDocument[sessionId].actions) {
                sessionLogDocument[sessionId].actions = [];
            }
            sessionLogDocument[sessionId].actions.push(actionData);
            writeSessionLogDocument(sessionId);
        }
    }

    // Write Log Document To File 
    // writeSessionLogDocument(sessionId);

}

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
let app = null;
let db = null;
// Target food will have 40% spawn chance, remaining 60% split among all other foods
const TARGET_FOOD_PROBABILITY = 0.4; // 40% chance for target item

const sessionGameModes = {};
let foodInstanceCounter = 0

const activeFoods = {};
const lastSpawnAt = {};
const aacLastActivityTime = {};
const idleCheckIntervals = {};

const QUEUE_MAX = 10;

const sessionLogQueue = {};
const sessionLogDocument = {};

function writeSessionLogDocument(sessionId) {
    console.assert(sessionId !== undefined, "[WSS] Session ID is undefined");
    // Get or create the session log file
    if (!sessionLogDocument[sessionId]) {
        try {
            const logFilePath = path.join(__dirname, "logs", sessionId + "_player_actions_log.json");
            sessions[sessionId].filePath = logFilePath;
            // Create directory if it doesn't exist
            const logsDir = path.join(__dirname, "logs");
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir);
            }

            // Initialize log file with empty arrays
            if (!fs.existsSync(logFilePath)) {
                fs.writeFileSync(logFilePath, JSON.stringify({ actions: [], heartbeats: [] }));
            }

            const fileContent = JSON.parse(fs.readFileSync(logFilePath, "utf-8"));
            sessionLogDocument[sessionId] = {
                filePath: logFilePath,
                actions: fileContent.actions || [],
                heartbeats: fileContent.heartbeats || [],
            };
        } catch (err) {
            console.error(`Error initializing session ${sessionId} log file:`, err);
            return;
        }
    }

    sessionLogDocument[sessionId].lastUpdated = new Date().toISOString();
    sessionLogDocument[sessionId].totalActions++;
    sessionLogDocument[sessionId].total_time_open_seconds = (new Date() - new Date(sessionLogDocument[sessionId].session_created)) / 1000;

    if (sessionLogDocument[sessionId].game_started) {
        sessionLogDocument[sessionId].total_time_playtime_seconds = (new Date() - new Date(sessionLogDocument[sessionId].game_started)) / 1000;
    }
    if (IS_PROD) {
        try {
            const sessionRef = db.collection('sessions').doc(sessionId);
            sessionRef.set(sessionLogDocument[sessionId], { merge: true });
        } catch (err) {
            console.error(`Error writing session ${sessionId} log file:`, err);
        }

    } else {
        try {
            fs.writeFileSync(sessions[sessionId].filePath, JSON.stringify(sessionLogDocument[sessionId], null, 2));
        } catch (err) {
            console.error(`Error writing session ${sessionId} log file:`, err);
        }
    }
}

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

server.on('request', (req, res) => {
    if (req.url === '/health') {
        res.writeHead(200);
        res.end('OK');
    }
});

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


// Temporary Check before full migration 
// error if not in production
// assert(!IS_PROD, "Error: Production environment transition to NoSQL not implemented yet... ");

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
}

// Function to get a weighted random food item from the list
// This function will give more weight to the target food, making it more likely to be selected
/**
 * (default 40%) and all other items share the remaining probability equally.
 *
 * @param {Array} allFoods - All available food items
 * @param {string} targetId - The ID of the current target food
 * @returns {Object} A randomly selected food item based on weighted probability
 */
function getWeightedRandomFood(allFoods, targetId) {
    if (!allFoods || allFoods.length === 0) {
        console.error('Food list is empty or undefined');
        return null;
    }


    // If no target is set, return random food
    if (!targetId) {
        return allFoods[Math.floor(Math.random() * allFoods.length)];
    }

    const randomValue = Math.random();

    // 40% chance to return the target food
    if (randomValue < TARGET_FOOD_PROBABILITY) {
        const targetFood = allFoods.find(f => f.id === targetId);
        return targetFood || allFoods[Math.floor(Math.random() * allFoods.length)];
    }

    // 60% chance to return a non-target food
    const nonTargetFoods = allFoods.filter(f => f.id !== targetId);
    if (nonTargetFoods.length === 0) {
        // If target is the only food, return it
        return allFoods.find(f => f.id === targetId);
    }

    return nonTargetFoods[Math.floor(Math.random() * nonTargetFoods.length)];
}

function handlePlayerJoin(ws, data) {
    const { sessionId, userId, role, color } = data.payload;
    ws.sessionId = sessionId;
    ws.userId = userId;
    ws.role = role;
    ws.color = color;
    if (ws.color === undefined) {
        ws.color = "no-color";
    }
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

    logPlayerAction(sessionId, userId, "joined session", { role, color });

    if (!scoresBySession[sessionId]) scoresBySession[sessionId] = {};
    if (role === 'Hippo Player' && !scoresBySession[sessionId][userId]) {
        scoresBySession[sessionId][userId] = 0;
    }

    if (IS_PROD) {
        // If in production, insert the player into the database
        //         try {
        //             await pool.query(`
        //   INSERT INTO players (session_id, user_id, role) VALUES ($1, $2, $3)
        //   ON CONFLICT (session_id, user_id) DO UPDATE SET role = EXCLUDED.role`, [sessionId, userId, role]);
        //         } catch (err) {
        //             console.error('Error adding player to database:', err);
        //         }
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

// Heartbeat to log sessions to NoSQL every 5 seconds 
setInterval(async () => {
    for (const sessionId of Object.keys(sessions)) {
        if (!sessionLogQueue[sessionId]) continue;

        let playerMovements = {};

        const events = sessionLogQueue[sessionId].splice(0, sessionLogQueue[sessionId].length);

        events.forEach(event => {
            if (event.actionType === 'moved') {
                const playerId = event.playerId || 'unknown';
                if (!playerMovements[playerId]) {
                    playerMovements[playerId] = { totalX: 0, totalY: 0, count: 0 };
                }
                // The x and y values are now inside the details object
                const details = event.details || {};
                playerMovements[playerId].totalX += details.x || 0;
                playerMovements[playerId].totalY += details.y || 0;
                playerMovements[playerId].count++;
            }
        });

        let quadrants = {
            target: {},
            distractor: {}
        };

        const currentTargetId = sessions[sessionId].currentTargetFoodId;

        if (activeFoods[sessionId]) {
            activeFoods[sessionId].forEach(food => {
                // Derive hippo player id from food instanceId
                const parts = food.instanceId.split('-');
                const userId = parts.length > 2 ? parts.slice(2).join('-') : 'unknown';

                // UserID defines the quadrant 
                if (quadrants.target[userId] === undefined) {
                    quadrants.target[userId] = 0;
                    quadrants.distractor[userId] = 0;
                }

                if (food.id === currentTargetId) {
                    quadrants.target[userId]++;
                } else {
                    quadrants.distractor[userId]++;
                }
            });
        }

        if (!sessionLogDocument[sessionId]) {
            writeSessionLogDocument(sessionId);
        }

        if (sessionLogDocument[sessionId]) {
            if (!sessionLogDocument[sessionId].heartbeats) {
                sessionLogDocument[sessionId].heartbeats = [];
            }
            sessionLogDocument[sessionId].heartbeats.push({
                timestamp: new Date().toISOString(),
                playerMovements: playerMovements,
                fruitsInQuadrants: quadrants
            });




            writeSessionLogDocument(sessionId);
        }
    }
}, 5000);


// Websocket Server
wss.on('connection', (ws) => {
    console.log('WSS Client connected');

    if (!app && admin.getApps().length === 0) {
        app = admin.initializeApp({
            credential: admin.cert(serviceAccount)
        });
        db = getFirestore(app);
        console.log("Firebase initialized with service account from ", process.env.GOOGLE_APPLICATION_CREDENTIALS);
    } else if (!db) {
        app = admin.getApp();
        db = getFirestore(app);
    }

    if (!db && IS_PROD) {
        console.error("Firebase not initialized");
        process.exit(1);
    }

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            // console.log('WSS Received:', data);
            // Validate session request
            if (data.type === 'VALIDATE_SESSION') {
                const { gameCode } = data.payload;

                // If the session id exists in sessions.json, then the session is valid
                let isValid = validateSession(gameCode);

                ws.send(JSON.stringify({
                    type: 'SESSION_VALIDATED',
                    payload: { isValid, gameCode }
                }));
            }

            // Handle session creation request
            if (data.type === 'CREATE_SESSION') {

                // If local development, skip database operations
                let sessionId = await createNewSession();

                ws.send(JSON.stringify({
                    type: 'SESSION_CREATED',
                    payload: { sessionId }
                }));
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

                logPlayerAction(sessionId, userId, "moved", { x: x, y: y });

            }

            // When a player joins, store their WebSocket connection in the correct session room
            if (data.type === 'PLAYER_JOIN') {
                handlePlayerJoin(ws, data);
            }

            // When the presenter clicks "Start Game", broadcast to all clients in the session
            // to signal that the game has begun. Clients will navigate to the game screen.
            if (data.type === 'START_GAME') {
                const { sessionId, mode } = data.payload;
                console.log(`[WSS] Start game received for session ${sessionId} with mode ${mode}`);

                startGame(sessionId, mode);

                broadcast(sessionId, {
                    type: 'START_GAME_BROADCAST',
                    payload: { sessionId, mode },
                });
            }


            if (data.type === 'START_TIMER') {
                const { sessionId } = data.payload;
                //console.log(`[WSS] Starting timer for session ${sessionId}`);
                logPlayerAction(sessionId, "None", "Timer Start");
                let secondsLeft = 180;
                //console.log('[WSS] SECONDSLEFT INIT:', secondsLeft); 
                const interval = setInterval(() => {
                    if (secondsLeft <= 0) {
                        //console.log(`[WSS] Timer ended for session ${sessionId}`);
                        logPlayerAction(sessionId, "None", "Timer Ended / Game Over", { finalScores: scoresBySession[sessionId] });
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

                // Reset idle timer when AAC user selects a food
                await selectFood(sessionId, food, effect);
            }

            // When a player eats a target food with an effect, broadcast it to the session
            if (data.type === 'PLAYER_EFFECT_APPLIED') {
                const { sessionId, targetUserId, effect } = data.payload;
                broadcast(sessionId, {
                    type: 'PLAYER_EFFECT_BROADCAST',
                    payload: { targetUserId, effect }
                });
            }


            // Notify all players in the session to remove the fruit
            if (data.type === 'FRUIT_EATEN') {
                const { sessionId, instanceId } = data.payload;
                if (activeFoods[sessionId]) {
                    activeFoods[sessionId] = activeFoods[sessionId].filter(f => f.instanceId !== instanceId);
                }
                logPlayerAction(sessionId, "presenter", `fruit eaten`, { instanceId });
                broadcast(sessionId, {
                    type: 'REMOVE_FOOD',
                    payload: { instanceId }
                });
            }

            // Broadcast updated scores
            if (data.type === 'FRUIT_EATEN_BY_PLAYER') {
                const { sessionId, userId, isCorrect, allowPenalty, effect } = data.payload;
                // logPlayerAction(sessionId, userId, "fruit eaten", `isCorrect: ${isCorrect}, effect: ${effect}, allowPenalty: ${allowPenalty}`);
                logPlayerAction(sessionId, userId, "fruit eaten", { isCorrect: isCorrect, effect: effect, allowPenalty: allowPenalty });
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
                logPlayerAction(sessionId, userId, "color selected", { color });
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
                    //         await pool.query(
                    //             `UPDATE game_statistics SET hippo_color_counts = jsonb_set(
                    //   hippo_color_counts,
                    //   '{${color}}',
                    //   (COALESCE(hippo_color_counts->>'${color}', '0')::int + 1)::text::jsonb
                    // ) WHERE id = 1`
                    //         );
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
                logPlayerAction(sessionId, "None", "Game Reset");
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
                        // try {
                        //     await pool.query('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
                        //     console.log(`[WSS] Deleted timed-out session ${sessionId} from database.`);
                        // } catch (err) {
                        //     console.error(`[WSS] Error deleting timed-out session ${sessionId} from DB:`, err);
                        // }
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

async function selectFood(sessionId, food, effect) {
    aacLastActivityTime[sessionId] = Date.now();

    // logPlayerAction(sessionId, "None", "aac food selected", `food name: ${food.name}, food color: ${food.color}, effect: ${effect}`);
    logPlayerAction(sessionId, "None", "aac food selected", { foodName: food.name, foodColor: food.color, effect: effect });
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

    // Updates the session's current weighted target
    sessions[sessionId].currentTargetFoodId = food.id;
    sessions[sessionId].currentTargetEffect = finalEffect;

    // Rebuild the entire queue with the new target food probability
    // This ensures the 40% spawn rate kicks in immediately
    if (fruitQueues[sessionId]) {
        rebuildFruitQueue(sessionId, food.id);
        enqueueFruit(sessionId, food, { front: true });
    }

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

async function createNewSession() {
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
        sessionId = generateUniqueSessionId(Object.keys(sessions));
        sessions[sessionId] = [];
        fs.writeFileSync(sessionFilePath, JSON.stringify(sessionsData, null, 2), 'utf-8');
    } else {
        // In production, we generate a session ID (Postgres insertion was removed/commented)
        // Read all sessionIDs from Firebase and create a string of keys
        try {
            const sessionsSnapshot = await db.collection('sessions').get();
            const existingSessionIds = sessionsSnapshot.docs.map(doc => doc.id);
            sessionId = generateUniqueSessionId(existingSessionIds);
        } catch (err) {
            console.error('Error fetching sessions from Firebase:', err);
            // Fallback to purely local unique ID generation if Firebase fails
            sessionId = generateUniqueSessionId(Object.keys(sessions));
        }
    }
    // Create JSON file for this session
    const logsDir = path.join(__dirname, "logs");
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir);
    }
    const logFilePath = path.join(__dirname, "logs", sessionId + "_player_actions_log.json");
    if (!fs.existsSync(logFilePath)) {
        fs.writeFileSync(logFilePath, JSON.stringify({ actions: [], heartbeats: [] }));

    }

    sessions[sessionId] = new Set();
    sessions[sessionId].statsLogged = false;
    sessions[sessionId].filePath = logFilePath;
    sessionLogDocument[sessionId] = { actions: [], heartbeats: [] };
    sessionLogDocument[sessionId].session_created = new Date().toISOString();
    sessionLogDocument[sessionId].last_updated = new Date().toISOString();
    sessionLogDocument[sessionId].total_actions = 0;
    sessionLogDocument[sessionId].total_time = 0;
    return sessionId;
}

function validateSession(gameCode) {
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
        // try {
        //     const result = await pool.query('SELECT EXISTS (SELECT 1 FROM sessions WHERE session_id = $1)', [gameCode]);
        //     isValid = result.rows[0].exists;
        // } catch (err) {
        //     console.error('Error validating session:', err);
        // }
    }
    return isValid;
}

function startGame(sessionId, mode) {
    if (IS_PROD && sessions[sessionId]) {
        //         if (!sessions[sessionId].statsLogged) {
        //             try {
        //                 await pool.query(
        //                     "DELETE FROM players WHERE session_id = $1 AND role = 'Presenter'",
        //                     [sessionId]
        //                 );
        //                 await pool.query(
        //                     `UPDATE game_statistics SET mode_counts = jsonb_set(
        //     mode_counts,
        //     '{${mode}}',
        //     (COALESCE(mode_counts->>'${mode}', '0')::int + 1)::text::jsonb
        //   ) WHERE id = 1`
        //                 );
        //                 let hippoCount = 0;
        //                 let aacCount = 0;
        //                 for (const client of sessions[sessionId]) {
        //                     if (client.role === 'Hippo Player') {
        //                         hippoCount++;
        //                     } else if (client.role === 'AAC User') {
        //                         aacCount++;
        //                     }
        //                 }
        //                 if (hippoCount > 0 || aacCount > 0) {
        //                     await pool.query(
        //                         `UPDATE game_statistics SET 
        //         total_hippo_players = total_hippo_players + $1, 
        //         total_aac_users = total_aac_users + $2,
        //         last_updated = NOW()
        //       WHERE id = 1`,
        //                         [hippoCount, aacCount]
        //                     );
        //                 }
        //                 sessions[sessionId].statsLogged = true;
        //             } catch (err) {
        //                 console.error('[WSS] Error cleaning up presenter role:', err);
        //             }
        //         }
    }

    if (sessions[sessionId]) {
        sessions[sessionId].gameStarted = true;
    }

    logPlayerAction(sessionId, "None", "GAME_START", { mode });

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
                        // Rebuild queue with weighted probability for the initial target
                        rebuildFruitQueue(sessionId, nextFoodId);
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
        activeFoods[sessionId] = activeFoods[sessionId].filter(food => food.x > -BOUNDARY_BUFFER &&
            food.x < 1024 + BOUNDARY_BUFFER &&
            food.y > -BOUNDARY_BUFFER &&
            food.y < 1024 + BOUNDARY_BUFFER
        );
    }, TICK_INTERVAL);

    // Start idle check timer for AAC users
    aacLastActivityTime[sessionId] = Date.now();
    const IDLE_CHECK_INTERVAL = 1000; // Check every second
    const IDLE_THRESHOLD = 15000; // 15 seconds

    idleCheckIntervals[sessionId] = setInterval(() => {
        if (!sessions[sessionId]) {
            clearInterval(idleCheckIntervals[sessionId]);
            delete idleCheckIntervals[sessionId];
            return;
        }

        const now = Date.now();
        const timeSinceLastActivity = now - (aacLastActivityTime[sessionId] || now);

        // If AAC user has been idle for 15 seconds, send audio prompt
        if (timeSinceLastActivity >= IDLE_THRESHOLD) {
            logPlayerAction(sessionId, "None", "idle player detected", { thresholdMs: IDLE_THRESHOLD });
            broadcast(sessionId, {
                type: 'AAC_IDLE_PROMPT',
                payload: {
                    audioPath: '/audio/idleMessage.mp3'
                }
            });
            // Reset the timer to avoid spamming the prompt
            aacLastActivityTime[sessionId] = now;
        }
    }, IDLE_CHECK_INTERVAL);
}

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
    // Clear idle check interval if present
    if (idleCheckIntervals[sessionId]) {
        clearInterval(idleCheckIntervals[sessionId]);
        delete idleCheckIntervals[sessionId];
    }
    // Remove all per-session state
    delete activeFoods[sessionId];
    delete fruitQueues[sessionId];
    delete scoresBySession[sessionId];
    delete sessionGameModes[sessionId];
    delete lastSpawnAt[sessionId];
    delete aacLastActivityTime[sessionId];
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

/**
 * Rebuilds the fruit queue with weighted items based on the current target food.
 * @param {string} sessionId
 * @param {string} targetFoodId
 */
function rebuildFruitQueue(sessionId, targetFoodId) {
    clearFruitQueue(sessionId);
    for (let i = 0; i < QUEUE_MAX; i++) {
        const weightedFood = getWeightedRandomFood(allFoods, targetFoodId);
        enqueueFruit(sessionId, weightedFood);
    }
    console.log(`[WSS] Rebuilt fruit queue for session ${sessionId} with target ${targetFoodId}`);
}

function sendError(ws, { code = 'SERVER_ERROR', message, ...meta }) {
    ws.send(
        JSON.stringify({
            type: 'ERROR_MESSAGE',
            payload: { code, message, ...meta },
        }),
    );
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