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

const sentMessages = (ws: ReturnType<typeof fakeSocket>) => ws.send.mock.calls.map(([raw]) => JSON.parse(raw));

describe('messages for sessions that no longer exist', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete api.sessions['LIVE1'];
  });

  it('ignores a gameplay message for a deleted session instead of replying "Server error"', async () => {
    const ws = fakeSocket();
    api.wss.emit('connection', ws);

    // A queued AAC choice, sent after the server restarted and forgot the session
    await receive(ws, {
      type: 'AAC_FOOD_SELECTED',
      payload: { sessionId: 'GONE1', food: { id: 'apple', name: 'Apple', color: 'red' }, effect: null },
    });

    expect(sentMessages(ws)).toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('still tells a joining player that the session was not found', async () => {
    const ws = fakeSocket();
    api.wss.emit('connection', ws);

    await receive(ws, {
      type: 'PLAYER_JOIN',
      payload: { sessionId: 'GONE1', userId: 'User1', role: 'Hippo Player' },
    });

    expect(sentMessages(ws)).toEqual([
      expect.objectContaining({ type: 'ERROR_MESSAGE', payload: expect.objectContaining({ code: 'SESSION_NOT_FOUND' }) }),
    ]);
  });

  it('still handles messages for sessions that exist', async () => {
    const ws = fakeSocket();
    api.sessions['LIVE1'] = new Set([ws]);
    api.wss.emit('connection', ws);

    await receive(ws, { type: 'REQUEST_COLOR_UPDATE', payload: { sessionId: 'LIVE1' } });

    expect(sentMessages(ws)).toEqual([{ type: 'COLOR_UPDATE', payload: { takenColors: [] } }]);
  });
});
