// @vitest-environment node
import { createRequire } from 'module';
import { EventEmitter } from 'events';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const require = createRequire(import.meta.url);
const api = require('../sessionAPI.js');

// A stand-in for a client connection that records pings and disconnects
function fakeClient() {
    const ws = new EventEmitter() as EventEmitter & {
        isAlive?: boolean;
        ping: ReturnType<typeof vi.fn>;
        terminate: ReturnType<typeof vi.fn>;
    };
    ws.ping = vi.fn();
    ws.terminate = vi.fn();
    return ws;
}

describe('connection heartbeat', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    
    afterEach(() => {
        vi.restoreAllMocks();
    });
    
    it('pings every connected client', () => {
        const a = fakeClient();
        const b = fakeClient();
        api.trackHeartbeat(a);
        api.trackHeartbeat(b);
        
        api.checkHeartbeats([a, b]);
        
        expect(a.ping).toHaveBeenCalledTimes(1);
        expect(b.ping).toHaveBeenCalledTimes(1);
        expect(a.terminate).not.toHaveBeenCalled();
    });
    
    it('keeps a client that answered the last ping', () => {
        const ws = fakeClient();
        api.trackHeartbeat(ws);
        
        api.checkHeartbeats([ws]); // ping sent
        ws.emit('pong'); // browser answers
        api.checkHeartbeats([ws]); // next check
        
        expect(ws.terminate).not.toHaveBeenCalled();
        expect(ws.ping).toHaveBeenCalledTimes(2);
    });
    
    it('disconnects a client that did not answer the last ping', () => {
        const ws = fakeClient();
        api.trackHeartbeat(ws);
        
        api.checkHeartbeats([ws]); // ping sent, no answer
        api.checkHeartbeats([ws]); // next check
        
        expect(ws.terminate).toHaveBeenCalledTimes(1);
        expect(ws.ping).toHaveBeenCalledTimes(1);
    });
});