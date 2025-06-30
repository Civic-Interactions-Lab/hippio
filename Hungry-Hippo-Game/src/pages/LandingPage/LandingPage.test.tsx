import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LandingPage from './LandingPage';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('react-router-dom', () => {
  const actual = vi.importActual('react-router-dom') as object;
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

const mockedNavigate = vi.fn();

/**
 * This test verifies that when the user clicks the "No code? Create new game!" button
 * on the LandingPage component, a session creation request is sent to the backend
 * and the user is navigated to the Presenter view using the returned session ID.
 */
describe('The host device sends a session creation request ', () => {
  beforeEach(() => {
    mockedNavigate.mockReset();

  });

  it('sends a session creation request when "No code? Create new game!" is clicked', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ sessionId: 'ABCDE' }),
      })
    ) as any;

    render(<LandingPage />);

    const createGameButton = screen.getByText(/No code\? Create new game!/i);
    fireEvent.click(createGameButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:4000/create-session', expect.any(Object));
      expect(mockedNavigate).toHaveBeenCalledWith('/Presenter/ABCDE');
    });

    (global.fetch as any).mockRestore?.();
  });
});
