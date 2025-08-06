import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, vi, beforeEach, test } from 'vitest';
import RoleSelect from './RoleSelect';

// Mocks for dependencies
const mockedNavigate = vi.fn();
const mockSendMessage = vi.fn();
const mockClearLastMessage = vi.fn();

// Mock the useNavigate hook from react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
    useParams: () => ({ sessionId: 'TEST123' }),
    useLocation: () => ({ state: { userId: 'testUser' } }),
  };
});

// Mock the WebSocket context to provide necessary functions and state
vi.mock('../../contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    connectedUsers: [],
    gameStarted: false,
    sendMessage: mockSendMessage,
    isConnected: true,
    lastMessage: null,
    clearLastMessage: mockClearLastMessage,
  }),
}));

// Mock the AudioContext to prevent errors in tests
vi.mock('../../game/EventBus', () => ({
  EventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));


// This is the test suite for the RoleSelect component
describe('RoleSelect Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper function to render the component with the necessary router context
  const renderComponent = () => {
    render(
      <MemoryRouter initialEntries={['/roleselect/TEST123']}>
        <Routes>
          <Route path="/roleselect/:sessionId" element={<RoleSelect />} />
        </Routes>
      </MemoryRouter>
    );
  };

  // Test #1 - Check if the initial role selection view renders correctly
  test('renders the initial role selection view', () => {
    renderComponent();
    expect(screen.getByText('Select Your Role')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hippo Player/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AAC User/i })).toBeInTheDocument();
  });

  // Test #2 - Selecting "Hippo Player" shows the color selection grid
  test('selecting "Hippo Player" shows the color selection grid', () => {
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Hippo Player/i }));

    expect(screen.getByText('Choose your Hippo')).toBeInTheDocument();
    expect(screen.getByAltText('brown')).toBeInTheDocument();
  });

  // Test #3 - Next button is disabled until a role and color are selected as a Hippo Player
  test('"Next" button is disabled until a role and color are selected', () => {
    renderComponent();
    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Hippo Player/i }));
    expect(nextButton).toBeDisabled();

    const brownHippoButton = screen.getByAltText('brown').closest('button');
    if (brownHippoButton) {
      fireEvent.click(brownHippoButton);
    }
    expect(nextButton).toBeEnabled();
  });
  
  // Test #4 - Clicking next sends PLAYER_JOIN message and shows waiting screen
  test('clicking "Next" sends PLAYER_JOIN and shows the waiting screen', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /Hippo Player/i }));
    const brownHippoButton = screen.getByAltText('brown').closest('button');
    if (brownHippoButton) {
      fireEvent.click(brownHippoButton);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText(/Waiting \. \. \./i)).toBeInTheDocument();
    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'PLAYER_JOIN',
      payload: {
        sessionId: 'TEST123',
        userId: 'testUser',
        role: 'Hippo Player',
        color: 'brown',
      },
    });
  });

  // Test #5 - Clicking the X button navigates to the home page
  test('clicking the main close button navigates to the home page', () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(mockedNavigate).toHaveBeenCalledWith('/');
  });

  // Test #6 - Selecting "AAC User" does not show color selection
  test('selecting "AAC User" does not show the color grid', () => {
    renderComponent();
    
    const aacButton = screen.getByRole('button', { name: /AAC User/i });
    fireEvent.click(aacButton);
    expect(screen.queryByText('Choose your Hippo')).not.toBeInTheDocument();

    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toBeEnabled();
  });
});