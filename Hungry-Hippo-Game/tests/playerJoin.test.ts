// @vitest-environment node
import { createRequire } from 'module';
import { EventEmitter } from 'events';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const require = createRequire(import.meta.url);
const api = require('../sessionAPI.js');

// A stand-in for an open client connection that records what the server sends it
function fakeSocket() {
  const ws = new EventEmitter() as EventEmitter & {
    readyState: number;
    send: ReturnType<typeof vi.fn>;
    ping: ReturnType<typeof vi.fn>;
    color?: string;
  };
  ws.readyState = 1; // OPEN
  ws.send = vi.fn();
  ws.ping = vi.fn();
  return ws;
}

// Sends a message to the server as if it came from the client, and waits for it to be handled
async function receive(ws: EventEmitter, message: object) {
  ws.emit('message', JSON.stringify(message));
  await new Promise((resolve) => setImmediate(resolve));
}

function lastUsersList(ws: ReturnType<typeof fakeSocket>) {
  const lists = ws.send.mock.calls
    .map(([raw]) => JSON.parse(raw))
    .filter((m) => m.type === 'USERS_LIST_UPDATE');
  return lists[lists.length - 1].payload.users;
}

describe('PLAYER_JOIN', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.sessions['ABCDE'] = new Set();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete api.sessions['ABCDE'];
  });

  it('keeps a hippo color when the same player joins again without one', async () => {
    const ws = fakeSocket();
    api.wss.emit('connection', ws);

    // Rejoin after a refresh: sent automatically with the saved color
    await receive(ws, {
      type: 'PLAYER_JOIN',
      payload: { sessionId: 'ABCDE', userId: 'User1', role: 'Hippo Player', color: 'green', isReconnecting: true },
    });
    // The game page's own join, queued until the connection opened, without a color
    await receive(ws, {
      type: 'PLAYER_JOIN',
      payload: { sessionId: 'ABCDE', userId: 'User1', role: 'Hippo Player' },
    });

    expect(ws.color).toBe('green');
    expect(lastUsersList(ws)).toEqual([{ userId: 'User1', role: 'Hippo Player', color: 'green' }]);
  });
});