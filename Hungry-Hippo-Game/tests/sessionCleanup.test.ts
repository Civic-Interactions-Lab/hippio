// @vitest-environment node
import { createRequire } from 'module';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const require = createRequire(import.meta.url);
const api = require('../sessionAPI.js');

// A stand-in for a closed WebSocket connection
function fakeClient(sessionId: string, userId: string) {
    return { sessionId, userId, role: 'Hippo Player', readyState: 3 };
}

describe('empty session cleanup', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        for (const id of Object.keys(api.sessions)) delete api.sessions[id];
        for (const id of Object.keys(api.fruitIntervals)) delete api.fruitIntervals[id];
    });
    
    it('removes the session and its fruit timer after the last player leaves', async () => {
        const player = fakeClient('ABCDE', 'User1');
        api.sessions['ABCDE'] = new Set([player]);
        api.fruitIntervals['ABCDE'] = setInterval(() => {}, 1000);
        
        await api.handleClientClose(player);
        vi.advanceTimersByTime(api.EMPTY_SESSION_GRACE_MS);
        
        expect(api.sessions['ABCDE']).toBeUndefined();
        expect(api.fruitIntervals['ABCDE']).toBeUndefined();
    });
    
    it('keeps the session during the grace period so a player can rejoin', async () => {
        const player = fakeClient('ABCDE', 'User1');
        api.sessions['ABCDE'] = new Set([player]);
        
        await api.handleClientClose(player);
        vi.advanceTimersByTime(api.EMPTY_SESSION_GRACE_MS - 1);
        
        expect(api.sessions['ABCDE']).toBeDefined();
    });
    
    it('keeps the session while other players are still connected', async () => {
        const leaving = fakeClient('ABCDE', 'User1');
        const staying = fakeClient('ABCDE', 'User2');
        api.sessions['ABCDE'] = new Set([leaving, staying]);
        
        await api.handleClientClose(leaving);
        vi.advanceTimersByTime(api.EMPTY_SESSION_GRACE_MS);
        
        expect(api.sessions['ABCDE'].size).toBe(1);
    });
});