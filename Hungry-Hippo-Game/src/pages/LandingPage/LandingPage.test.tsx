import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LandingPage from './LandingPage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedNavigate = vi.fn();

/**
 * Mock react-router-dom's useNavigate hook
 */
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

const mockSendMessage = vi.fn();

/**
 * Mock WebSocket context for connection, message, and sendMessage
 */
vi.mock('../../contexts/WebSocketContext', () => {
  return {
    useMessage: vi.fn(),
    useWebSocket: () => ({
      isConnected: true,
      sendMessage: mockSendMessage,
      resetGameState: vi.fn(),
    }),
    WebSocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

describe('Session creation & validation', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
  });

  /**
   * Clicking "No code? Create new game!" sends CREATE_SESSION message
   */
  it('sends CREATE_SESSION when create game is clicked', () => {
    render(<LandingPage />);
    const createGameButton = screen.getByRole('button', { name: /No code\? Create new game!?/i });
    fireEvent.click(createGameButton);
    expect(mockSendMessage).toHaveBeenCalledWith({ type: 'CREATE_SESSION' });
  });

  /**
   * Entering 5-char code and clicking Join sends VALIDATE_SESSION message
   */
  it('sends VALIDATE_SESSION with 5-char code on Join Game', () => {
    render(<LandingPage />);
    const inputs = screen.getAllByRole('textbox');

    ['A', 'B', 'C', 'D', 'E'].forEach((char, i) => {
      fireEvent.change(inputs[i], { target: { value: char } });
    });

    const joinButton = screen.getByRole('button', { name: /Join Game/i });
    fireEvent.click(joinButton);

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'VALIDATE_SESSION',
      payload: { gameCode: 'ABCDE' }
    });
  });

  /**
   * Code less than 5 chars does not send VALIDATE_SESSION message
   */
  it('does NOT send VALIDATE_SESSION if code is less than 5 chars', () => {
    render(<LandingPage />);
    const inputs = screen.getAllByRole('textbox');

    ['A', 'B', 'C', '', ''].forEach((char, i) => {
      fireEvent.change(inputs[i], { target: { value: char } });
    });

    const joinButton = screen.getByRole('button', { name: /Join Game/i });
    fireEvent.click(joinButton);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
