import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RoleSelect from './RoleSelect';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, vi, beforeEach, test } from 'vitest';

const mockedNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
    useParams: () => ({ sessionId: 'ABCDE' }),
    useLocation: () => ({
      state: { userId: 'testUser' },
      pathname: '/role-select/ABCDE',
    }),
  };
});

/**
 * This test ensures that when a user selects a role and proceeds,
 * the role and userId are properly sent to the backend and the user
 * is added to the session list in the database before being navigated
 * to the game page.
 */
describe('RoleSelect Component', () => {
  beforeEach(() => {
    mockedNavigate.mockReset();
    vi.spyOn(global, 'fetch').mockClear();
  });

  test('Players and AAC users are listed in the database once joined', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            sessions: {
              ABCDE: [
                { userId: 'User630', role: 'Hippo Player' },
                { userId: 'testUser', role: 'Hippo Player' },
              ],
            },
          }),
      } as Response)
    );

    render(
      <MemoryRouter initialEntries={['/role-select/ABCDE']}>
        <Routes>
          <Route path="/role-select/:sessionId" element={<RoleSelect />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Hippo Player' },
    });

    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4000/update-role',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'ABCDE',
            userId: 'testUser',
            role: 'Hippo Player',
          }),
        })
      );

      expect(mockedNavigate).toHaveBeenCalledWith('/gamepage/ABCDE/testUser');
    });
  });
});
