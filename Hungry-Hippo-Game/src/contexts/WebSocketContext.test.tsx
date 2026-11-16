import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketProvider, useWebSocket, getReconnectDelay } from './WebSocketContext';

// A fake WebSocket the tests can open and drop on demand
class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    static instances: MockWebSocket[] = [];
    
    readyState = MockWebSocket.CONNECTING;
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((err: unknown) => void) | null = null;
    
    constructor(public url: string) {
        MockWebSocket.instances.push(this);
    }
    send(data: string) {
        this.sent.push(data);
    }
    close() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.();
    }
    // Test helpers
    open() {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
    }
    drop() {
        this.close();
    }
}

const latestSocket = () => MockWebSocket.instances[MockWebSocket.instances.length - 1];

// Renders the provider and returns the context so tests can call sendMessage
function renderProvider() {
    const ctx: { current: ReturnType<typeof useWebSocket> | null } = { current: null };
    const Probe = () => {
        ctx.current = useWebSocket();
        return null;
    };
    const utils = render(
        <WebSocketProvider>
        <Probe />
        </WebSocketProvider>
    );
    return { ctx, ...utils };
}

describe('WebSocketContext reconnect and message queue', () => {
    beforeEach(() => {
        MockWebSocket.instances = [];
        vi.stubGlobal('WebSocket', MockWebSocket);
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });
    
    it('queues messages sent before the socket opens and sends them in order once it opens', () => {
        const { ctx } = renderProvider();
        
        act(() => {
            ctx.current!.sendMessage({ type: 'START_TIMER', payload: { sessionId: 'ABCDE' } });
            ctx.current!.sendMessage({ type: 'AAC_FOOD_SELECTED', payload: { sessionId: 'ABCDE' } });
        });
        expect(latestSocket().sent).toHaveLength(0);
        
        act(() => latestSocket().open());
        
        expect(latestSocket().sent.map((m) => JSON.parse(m).type)).toEqual(['START_TIMER', 'AAC_FOOD_SELECTED']);
    });
    
    it('does not queue movement updates', () => {
        const { ctx } = renderProvider();
        
        act(() => {
            ctx.current!.sendMessage({ type: 'PLAYER_MOVE', payload: { x: 1, y: 2 } });
        });
        act(() => latestSocket().open());
        
        expect(latestSocket().sent).toHaveLength(0);
    });
    
    it('reconnects after the connection drops, waiting longer after each failure', () => {
        const { ctx } = renderProvider();
        act(() => latestSocket().open());
        expect(ctx.current!.isConnected).toBe(true);
        
        // First drop: retry after 500ms
        act(() => latestSocket().drop());
        expect(ctx.current!.isConnected).toBe(false);
        expect(ctx.current!.isReconnecting).toBe(true);
        act(() => vi.advanceTimersByTime(499));
        expect(MockWebSocket.instances).toHaveLength(1);
        act(() => vi.advanceTimersByTime(1));
        expect(MockWebSocket.instances).toHaveLength(2);
        
        // That attempt fails too: next retry waits 1000ms
        act(() => latestSocket().drop());
        act(() => vi.advanceTimersByTime(999));
        expect(MockWebSocket.instances).toHaveLength(2);
        act(() => vi.advanceTimersByTime(1));
        expect(MockWebSocket.instances).toHaveLength(3);
        
        // Third attempt succeeds
        act(() => latestSocket().open());
        expect(ctx.current!.isConnected).toBe(true);
        expect(ctx.current!.isReconnecting).toBe(false);
    });
    
    it('sends messages queued during a disconnect once it reconnects', () => {
        const { ctx } = renderProvider();
        act(() => latestSocket().open());
        act(() => latestSocket().drop());
        
        act(() => {
            ctx.current!.sendMessage({ type: 'AAC_FOOD_SELECTED', payload: { sessionId: 'ABCDE' } });
        });
        act(() => vi.advanceTimersByTime(500));
        act(() => latestSocket().open());
        
        expect(latestSocket().sent.map((m) => JSON.parse(m).type)).toContain('AAC_FOOD_SELECTED');
    });
    
    it('stops reconnecting after the provider unmounts', () => {
        const { unmount } = renderProvider();
        act(() => latestSocket().open());
        
        unmount();
        act(() => vi.advanceTimersByTime(20000));
        
        expect(MockWebSocket.instances).toHaveLength(1);
    });
    
    it('caps the reconnect delay at 10 seconds', () => {
        expect(getReconnectDelay(0)).toBe(500);
        expect(getReconnectDelay(1)).toBe(1000);
        expect(getReconnectDelay(4)).toBe(8000);
        expect(getReconnectDelay(5)).toBe(10000);
        expect(getReconnectDelay(20)).toBe(10000);
    });
});
describe('WebSocketContext message subscriptions', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const deliver = (message: object) => latestSocket().onmessage?.({ data: JSON.stringify(message) });

  it('delivers every message to subscribers, even when several arrive together', () => {
    const { ctx } = renderProvider();
    const seen: string[] = [];
    act(() => {
      ctx.current!.subscribe('AAC_TARGET_FOOD', (m) => seen.push(`target:${m.payload.targetFoodId}`));
      ctx.current!.subscribe('REMOVE_FOOD', (m) => seen.push(`remove:${m.payload.instanceId}`));
    });

    act(() => {
      deliver({ type: 'AAC_TARGET_FOOD', payload: { targetFoodId: 'apple' } });
      deliver({ type: 'REMOVE_FOOD', payload: { instanceId: 'food-1' } });
      deliver({ type: 'REMOVE_FOOD', payload: { instanceId: 'food-2' } });
    });

    expect(seen).toEqual(['target:apple', 'remove:food-1', 'remove:food-2']);
  });

  it('only delivers the message types a listener subscribed to', () => {
    const { ctx } = renderProvider();
    const listener = vi.fn();
    act(() => {
      ctx.current!.subscribe('REMOVE_FOOD', listener);
    });

    act(() => deliver({ type: 'FOOD_STATE_UPDATE', payload: { foods: [] } }));

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribing', () => {
    const { ctx } = renderProvider();
    const listener = vi.fn();
    let unsubscribe = () => {};
    act(() => {
      unsubscribe = ctx.current!.subscribe('REMOVE_FOOD', listener);
    });

    act(() => deliver({ type: 'REMOVE_FOOD', payload: { instanceId: 'food-1' } }));
    unsubscribe();
    act(() => deliver({ type: 'REMOVE_FOOD', payload: { instanceId: 'food-2' } }));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps delivering to other listeners if one throws', () => {
    const { ctx } = renderProvider();
    const good = vi.fn();
    act(() => {
      ctx.current!.subscribe('REMOVE_FOOD', () => {
        throw new Error('broken handler');
      });
      ctx.current!.subscribe('REMOVE_FOOD', good);
    });

    act(() => deliver({ type: 'REMOVE_FOOD', payload: { instanceId: 'food-1' } }));

    expect(good).toHaveBeenCalledTimes(1);
  });
});
