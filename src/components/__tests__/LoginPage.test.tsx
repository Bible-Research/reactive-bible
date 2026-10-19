import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  act,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { LoginPage } from '../LoginPage';
import { renderWithProviders } from '../../__tests__/helpers';
import { useAuthStore } from '../../stores/authStore';
import { server } from '../../mocks/server';
import { API_BASE_URL } from '../../config';

const TOKEN_URL = `${API_BASE_URL}/api/token/`;

// Mock useNavigate / useLocation so redirects are observable and
// the `from` location state can be varied per test.
const mockNavigate = vi.fn();
const mockUseLocation = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<
    typeof import('react-router-dom')
  >('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockUseLocation(),
  };
});

const mockShowNotification = vi.fn();
vi.mock('@mantine/notifications', () => ({
  showNotification: (...args: unknown[]) =>
    mockShowNotification(...args),
}));

// These tests exercise the REAL auth store against the MSW
// token endpoint — no store action mocks — so a regression in
// either the page or authStore.login surfaces here.
describe('LoginPage', () => {
  beforeEach(() => {
    // renderWithProviders' mockDomApis spyOns getElementById
    // each render — restoring unwraps the nested spy chain.
    vi.restoreAllMocks();
    // A full Location shape — a bare `{ state: null }` would
    // hand a future `location.pathname` read `undefined`.
    mockUseLocation.mockReturnValue({
      pathname: '/login',
      search: '',
      hash: '',
      state: null,
      key: 'test',
    });
  });

  const fillAndSubmit = async (
    user: ReturnType<typeof userEvent.setup>,
    username = 'testuser',
    password = 'testpass123'
  ) => {
    await user.type(screen.getByLabelText(/username/i), username);
    await user.type(screen.getByLabelText(/password/i), password);
    await user.click(
      screen.getByRole('button', { name: /sign in/i })
    );
  };

  it('should render the sign-in form', () => {
    renderWithProviders(<LoginPage />);

    expect(
      screen.getByText('Welcome to Bible Research')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sign in to access your notes and tags/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in/i })
    ).toBeInTheDocument();
  });

  it('should link to the registration page', () => {
    renderWithProviders(<LoginPage />);

    expect(
      screen.getByText(/don't have an account/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /create one now/i })
    ).toHaveAttribute('href', '/register');
  });

  it('should handle user input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(usernameInput, 'testuser');
    await user.type(passwordInput, 'testpass123');

    expect(usernameInput).toHaveValue('testuser');
    expect(passwordInput).toHaveValue('testpass123');
  });

  it('should require username and password', () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByLabelText(/username/i)).toBeRequired();
    expect(screen.getByLabelText(/password/i)).toBeRequired();
  });

  it('should login and navigate to /notes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/notes', {
        replace: true,
      });
    });

    const auth = useAuthStore.getState();
    expect(auth.token).toBe('test-token');
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.user).toEqual({ username: 'testuser' });
  });

  it('should show a success notification after login', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Welcome!',
          color: 'green',
        })
      );
    });
  });

  it('should redirect back to the originally requested page', async () => {
    mockUseLocation.mockReturnValue({
      pathname: '/login',
      search: '',
      hash: '',
      state: { from: { pathname: '/tags' } },
      key: 'test',
    });
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/tags', {
        replace: true,
      });
    });
  });

  it('should display an error alert when login fails', async () => {
    server.use(
      http.post(TOKEN_URL, () =>
        HttpResponse.json({}, { status: 401 })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(
        screen.getByText('Invalid username or password')
      ).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
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

  it('should display an auth error set after mount', () => {
    renderWithProviders(<LoginPage />);

    act(() => {
      useAuthStore.setState({ error: 'Login failed' });
    });

    expect(
      screen.getByText('Login failed')
    ).toBeInTheDocument();
  });

  it('should clear the error when the alert is dismissed', async () => {
    server.use(
      http.post(TOKEN_URL, () =>
        HttpResponse.json({}, { status: 401 })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await fillAndSubmit(user);

    const alert = await screen.findByRole('alert');
    // The alert's only button is its close (dismiss) button.
    await user.click(within(alert).getByRole('button'));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('should disable the form while the store is loading', () => {
    renderWithProviders(<LoginPage />, {
      authStoreState: { isLoading: true },
    });

    expect(screen.getByLabelText(/username/i)).toBeDisabled();
    expect(screen.getByLabelText(/password/i)).toBeDisabled();
    // Mantine's `loading` prop shows a spinner via data-loading;
    // it does not disable the button (no `disabled` prop in prod).
    expect(
      screen.getByRole('button', { name: /sign in/i })
    ).toHaveAttribute('data-loading', 'true');
  });

  it('should disable the form while a login is in flight', async () => {
    server.use(
      http.post(TOKEN_URL, async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({ token: 'test-token' });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(
      screen.getByLabelText(/password/i),
      'testpass123'
    );
    await user.click(
      screen.getByRole('button', { name: /sign in/i })
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/username/i)).toBeDisabled();
    });
    expect(screen.getByLabelText(/password/i)).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /sign in/i })
    ).toHaveAttribute('data-loading', 'true');

    // The in-flight login settles and navigation follows.
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/notes', {
        replace: true,
      });
    });
  });

  it('should autofocus the username input', () => {
    renderWithProviders(<LoginPage />);

    // React's autoFocus focuses programmatically; no attribute
    // is rendered, so assert the focus outcome itself.
    expect(screen.getByLabelText(/username/i)).toHaveFocus();
  });
});
