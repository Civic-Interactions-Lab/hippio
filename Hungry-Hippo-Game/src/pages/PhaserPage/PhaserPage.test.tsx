
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import PhaserPage from './PhaserPage';
import { createMemoryHistory } from 'history';
import { Router, Route, Routes } from 'react-router-dom';

// ---- MOCKS ----

const mockSendMessage = vi.fn();
const updateRemotePlayer = vi.fn();
const sceneMock = { updateRemotePlayer };


vi.stubGlobal('localStorage', {
  getItem: vi.fn(() => JSON.stringify({ ABC12: [{ userId: 'user1', edge: 'bottom' }] })),
  setItem: vi.fn(),
});

// Handlers registered through useMessage, so tests can deliver server messages
const messageHandlers = new Map<string, (message: any) => void>();
const deliver = (message: { type: string; payload?: any }) => messageHandlers.get(message.type)?.(message);

vi.mock('../../contexts/WebSocketContext', () => ({
  useMessage: (type: string, handler: (message: any) => void) => {
    messageHandlers.set(type, handler);
  },
  useWebSocket: () => ({
    connectedUsers: [
      { userId: 'other-user', role: 'Hippo Player', color: 'green' },
      { userId: 'aac1', role: 'AAC User' },
    ],
    sendMessage: mockSendMessage,
    isConnected: true,
  }),
}));


vi.mock('../../game/EventBus', () => ({
  EventBus: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
}));

vi.mock('../../PhaserGame', () => ({
  PhaserGame: vi
    .fn()
    .mockImplementation(({ currentActiveScene }, ref) => {
      if (typeof ref === 'function') {
        ref({ game: {}, scene: sceneMock });
      } else if (ref) {
        ref.current = { game: {}, scene: sceneMock };
      }

      currentActiveScene?.(sceneMock);
      return <div>Mock Game</div>;
    }),
}));

vi.mock('../../components/Leaderboard/Leaderboard', () => ({
  default: () => <div>Leaderboard</div>,
}));

vi.mock('../../components/Storage/Storage', () => ({
  updatePlayerInSessionStorage: vi.fn(),
}));


// ---- TESTS ----
describe('PhaserPage', () => {
  afterEach(() => {
    updateRemotePlayer.mockClear();
    });

    beforeEach(() => {
    mockSendMessage.mockClear();
    messageHandlers.clear();
  });

  it('renders game container and leaderboard', () => {
    const history = createMemoryHistory();
    history.push('/hippo/ABC12/user1', { role: 'Hippo Player', color: 'blue' });

    render(
      <Router location={history.location} navigator={history}>
        <Routes>
          <Route path="/hippo/:sessionId/:userId" element={<PhaserPage />} />
        </Routes>
      </Router>
    );

    expect(screen.getByText('Mock Game')).toBeInTheDocument();
    expect(screen.getByText('Leaderboard')).toBeInTheDocument();
    expect(screen.getByText(/Time Left:/i)).toBeInTheDocument();
  });

  it('shows the AAC target food even when a food update arrives right after it', () => {
    const history = createMemoryHistory();
    history.push('/hippo/ABC12/user1', { role: 'Hippo Player', color: 'blue' });

    render(
      <Router location={history.location} navigator={history}>
        <Routes>
          <Route path="/hippo/:sessionId/:userId" element={<PhaserPage />} />
        </Routes>
      </Router>
    );

    // The server sends these back to back: the AAC player's choice, then the next 50ms food tick
    act(() => {
      deliver({
        type: 'AAC_TARGET_FOOD',
        payload: { targetFoodId: 'apple', targetFoodData: { id: 'apple', name: 'Apple', imagePath: '/apple.png' } },
      });
      deliver({ type: 'FOOD_STATE_UPDATE', payload: { foods: [] } });
    });

    expect(screen.getByText('Apple')).toBeInTheDocument();
  });

  it('displays "No Food Selected" if currentFood is null', () => {
    const history = createMemoryHistory();
    history.push('/hippo/ABC12/user1', { role: 'Hippo Player', color: 'blue' });

    render(
      <Router location={history.location} navigator={history}>
        <Routes>
          <Route path="/hippo/:sessionId/:userId" element={<PhaserPage />} />
        </Routes>
      </Router>
    );

    expect(screen.getByText(/No Food Selected/i)).toBeInTheDocument();
  });

  it('sends PLAYER_JOIN and SELECT_COLOR on mount if not already joined', () => {
    const history = createMemoryHistory();
    history.push('/hippo/ABC12/user1', { role: 'Hippo Player', color: 'blue' });

    render(
      <Router location={history.location} navigator={history}>
        <Routes>
          <Route path="/hippo/:sessionId/:userId" element={<PhaserPage />} />
        </Routes>
      </Router>
    );

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'PLAYER_JOIN',
      payload: {
        sessionId: 'ABC12',
        userId: 'user1',
        role: 'Hippo Player',
      },
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'SELECT_COLOR',
      payload: {
        sessionId: 'ABC12',
        userId: 'user1',
        color: 'blue',
      },
    });
  });

});


