import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import Presenter from './Presenter';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

const mockedNavigate = vi.fn();

/**
 * This test suite verifies the behavior of the Presenter component:
 * - It ensures the session ID (game code) is displayed clearly to the host.
 * - It checks that clicking the "Cancel New Game" button navigates the host back to the landing page.
 */
describe('Presenter', () => {
  it('displays the room code clearly on the host device', () => {
    const testSessionId = 'ABCDE';

    render(
      <MemoryRouter initialEntries={[`/Presenter/${testSessionId}`]}>
        <Routes>
          <Route path="/Presenter/:sessionId" element={<Presenter />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      `Game Code: ${testSessionId}`
    );
  });

  it('navigates back to landing page when cancel button is clicked', () => {
    const testSessionId = 'ABCDE';

    render(
      <MemoryRouter initialEntries={[`/Presenter/${testSessionId}`]}>
        <Routes>
          <Route path="/Presenter/:sessionId" element={<Presenter />} />
        </Routes>
      </MemoryRouter>
    );

    const cancelButton = screen.getByRole('button', { name: /cancel new game/i });
    fireEvent.click(cancelButton);

    expect(mockedNavigate).toHaveBeenCalledWith('/');
  });
});
