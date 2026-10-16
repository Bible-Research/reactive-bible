import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '../LoginPage';
import { renderWithProviders } from '../../__tests__/helpers';
import { useAuthStore } from '../../stores/authStore';

// Mock useNavigate; useLocation serves the mutable redirect
// state below.
const mockNavigate = vi.fn();
const mockLocation = vi.hoisted(() => ({
  state: null as { from?: { pathname?: string } } | null,
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<
    typeof import('react-router-dom')
  >('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  };
});

// Mock notifications
vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

const usernameInput = () => screen.getByLabelText(/username/i);
const passwordInput = () =>
  screen.getByPlaceholderText('Your password');
const signInButton = () =>
  screen.getByRole('button', { name: /sign in/i });

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.state = null;
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('should render login form', () => {
    renderWithProviders(<LoginPage />);

    expect(
      screen.getByText('Welcome to Bible Research')
    ).toBeInTheDocument();
    expect(usernameInput()).toBeInTheDocument();
    expect(passwordInput()).toBeInTheDocument();
    expect(signInButton()).toBeInTheDocument();
  });

  it('should show helper text and the register link', () => {
    renderWithProviders(<LoginPage />);

    expect(
      screen.getByText(/Sign in to access your notes and tags/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Don't have an account/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Create one now')).toBeInTheDocument();
  });

  it('should handle user input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(usernameInput(), 'testuser');
    await user.type(passwordInput(), 'testpass123');

    expect(usernameInput()).toHaveValue('testuser');
    expect(passwordInput()).toHaveValue('testpass123');
  });

  it('should call login on form submit', async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockResolvedValue(undefined);

    useAuthStore.setState({ login: mockLogin });

    renderWithProviders(<LoginPage />);

    await user.type(usernameInput(), 'testuser');
    await user.type(passwordInput(), 'testpass123');
    await user.click(signInButton());

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        'testuser',
        'testpass123'
      );
    });
  });

  it('should navigate to /notes after successful login', async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockResolvedValue(undefined);

    useAuthStore.setState({ login: mockLogin });

    renderWithProviders(<LoginPage />);

    await user.type(usernameInput(), 'testuser');
    await user.type(passwordInput(), 'testpass123');
    await user.click(signInButton());

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/notes',
        { replace: true }
      );
    });
  });

  it('should navigate back to the protected page that ' +
    'redirected here', async () => {
      const user = userEvent.setup();
      const mockLogin = vi.fn().mockResolvedValue(undefined);
      useAuthStore.setState({ login: mockLogin });
      mockLocation.state = { from: { pathname: '/tags' } };

      renderWithProviders(<LoginPage />);

      await user.type(usernameInput(), 'testuser');
      await user.type(passwordInput(), 'testpass123');
      await user.click(signInButton());

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/tags',
          { replace: true }
        );
      });
    });

  it('should display an auth error set after mount', () => {
    renderWithProviders(<LoginPage />);

    act(() => {
      useAuthStore.setState({ error: 'Invalid credentials' });
    });

    expect(
      screen.getByText(/invalid credentials/i)
    ).toBeInTheDocument();
  });

  it('should clear a stale auth error on mount', () => {
    renderWithProviders(<LoginPage />, {
      authStoreState: { error: 'Stale error' },
    });

    // The mount effect calls clearError — the stale error
    // must not render.
    expect(
      screen.queryByText('Stale error')
    ).not.toBeInTheDocument();
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('should disable inputs during loading', () => {
    renderWithProviders(<LoginPage />, {
      authStoreState: { isLoading: true },
    });

    expect(usernameInput()).toBeDisabled();
    expect(passwordInput()).toBeDisabled();
  });

  it('should clear the error via the alert close button',
    async () => {
      const user = userEvent.setup();
      const mockClearError = vi.fn();

      renderWithProviders(<LoginPage />);

      act(() => {
        useAuthStore.setState({
          error: 'Test error',
          clearError: mockClearError,
        });
      });

      const alert = screen.getByRole('alert');
      const closeButton = alert.querySelector('button');
      expect(closeButton).not.toBeNull();
      await user.click(closeButton as HTMLElement);

      expect(mockClearError).toHaveBeenCalled();
    });

  it('should require username and password', () => {
    renderWithProviders(<LoginPage />);

    expect(usernameInput()).toBeRequired();
    expect(passwordInput()).toBeRequired();
  });

  it('should autofocus username input', () => {
    renderWithProviders(<LoginPage />);

    // React's autoFocus focuses the element — no attribute.
    expect(usernameInput()).toHaveFocus();
  });
});
