import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  act,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { RegisterPage } from '../RegisterPage';
import { renderWithProviders } from '../../__tests__/helpers';
import { useAuthStore } from '../../stores/authStore';
import { server } from '../../mocks/server';
import { API_BASE_URL } from '../../config';

const REGISTER_URL = `${API_BASE_URL}/api/v1/users/register/`;

// Mock useNavigate so post-registration redirects are observable.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<
    typeof import('react-router-dom')
  >('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockShowNotification = vi.fn();
vi.mock('@mantine/notifications', () => ({
  showNotification: (...args: unknown[]) =>
    mockShowNotification(...args),
}));

// Submit tests exercise the REAL auth store against the MSW
// register endpoint — no store action mocks.
describe('RegisterPage', () => {
  beforeEach(() => {
    // renderWithProviders' mockDomApis spyOns getElementById
    // each render — restoring unwraps the nested spy chain.
    vi.restoreAllMocks();
  });

  const fillValidForm = async (
    user: ReturnType<typeof userEvent.setup>,
    {
      username = 'newuser',
      email,
      password = 'SecurePass123',
      confirm = password,
    }: {
      username?: string;
      email?: string;
      password?: string;
      confirm?: string;
    } = {}
  ) => {
    await user.type(screen.getByLabelText(/username/i), username);
    if (email !== undefined) {
      await user.type(screen.getByLabelText(/email/i), email);
    }
    await user.type(screen.getByLabelText(/^password/i), password);
    await user.type(
      screen.getByLabelText(/confirm password/i),
      confirm
    );
    await user.click(
      screen.getByRole('button', { name: /create account/i })
    );
  };

  it('should render registration form', () => {
    renderWithProviders(<RegisterPage />);

    expect(
      screen.getByRole('heading', { name: 'Create Account' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/confirm password/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create account/i })
    ).toBeInTheDocument();
  });

  it('should show email is optional', () => {
    renderWithProviders(<RegisterPage />);

    expect(
      screen.getByText(/used for password recovery/i)
    ).toBeInTheDocument();
  });

  it('should show link to login page', () => {
    renderWithProviders(<RegisterPage />);

    expect(
      screen.getByText(/already have an account/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /sign in/i })
    ).toHaveAttribute('href', '/login');
  });

  it('should handle user input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    const usernameInput = screen.getByLabelText(/username/i);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const confirmInput = screen.getByLabelText(/confirm password/i);

    await user.type(usernameInput, 'newuser');
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'SecurePass123');
    await user.type(confirmInput, 'SecurePass123');

    expect(usernameInput).toHaveValue('newuser');
    expect(emailInput).toHaveValue('test@example.com');
    expect(passwordInput).toHaveValue('SecurePass123');
    expect(confirmInput).toHaveValue('SecurePass123');
  });

  it('should show error if passwords do not match', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await fillValidForm(user, { confirm: 'differentpass' });

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          message: 'Passwords do not match',
          color: 'red',
        })
      );
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should show error if password is too short', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await fillValidForm(user, { password: 'short' });

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          message: 'Password must be at least 8 characters long',
          color: 'red',
        })
      );
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should submit the registration payload to the API', async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(REGISTER_URL, async ({ request }) => {
        capturedBody = (await request.json()) as Record<
          string,
          unknown
        >;
        return HttpResponse.json(
          { token: 'test-token', user: { username: 'newuser' } },
          { status: 201 }
        );
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await fillValidForm(user, { email: 'test@example.com' });

    await waitFor(() => {
      expect(capturedBody).toEqual({
        username: 'newuser',
        password: 'SecurePass123',
        password_confirm: 'SecurePass123',
        email: 'test@example.com',
      });
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('should register without email if not provided', async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(REGISTER_URL, async ({ request }) => {
        capturedBody = (await request.json()) as Record<
          string,
          unknown
        >;
        return HttpResponse.json(
          { token: 'test-token', user: { username: 'newuser' } },
          { status: 201 }
        );
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await fillValidForm(user);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/notes', {
        replace: true,
      });
    });
    expect(capturedBody).not.toHaveProperty('email');
  });

  it('should show success notification after registration', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await fillValidForm(user);

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Success',
          message: expect.stringContaining(
            'Account created successfully'
          ),
          color: 'green',
        })
      );
    });
  });

  it('should navigate to /notes after successful registration', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await fillValidForm(user);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/notes', {
        replace: true,
      });
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('should display error message on registration failure', async () => {
    server.use(
      http.post(REGISTER_URL, () =>
        HttpResponse.json(
          { username: ['A user with that username already exists.'] },
          { status: 400 }
        )
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await fillValidForm(user, { username: 'existinguser' });

    await waitFor(() => {
      expect(
        screen.getByText(/a user with that username already exists/i)
      ).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('clears a stale error on mount', () => {
    // A failed login followed by navigating to /register used
    // to flash the old error — the mount effect clears it.
    renderWithProviders(<RegisterPage />, {
      authStoreState: { error: 'Stale error' },
    });
    expect(useAuthStore.getState().error).toBeNull();
    expect(
      screen.queryByRole('alert')
    ).not.toBeInTheDocument();
  });

  it('should clear the error when the alert is dismissed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    // Set the error after mount — a mount-time error is cleared
    // by the stale-error effect before render settles.
    act(() => {
      useAuthStore.setState({ error: 'Test error' });
    });

    const alert = screen.getByRole('alert');
    // The alert's only button is its close (dismiss) button.
    await user.click(within(alert).getByRole('button'));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('should disable the form while the store is loading', () => {
    renderWithProviders(<RegisterPage />, {
      authStoreState: { isLoading: true },
    });

    expect(
      screen.getByRole('button', { name: /create account/i })
    ).toBeDisabled();
    expect(screen.getByLabelText(/username/i)).toBeDisabled();
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByLabelText(/^password/i)).toBeDisabled();
    expect(
      screen.getByLabelText(/confirm password/i)
    ).toBeDisabled();
  });

  it('should require username and passwords', () => {
    renderWithProviders(<RegisterPage />);

    expect(screen.getByLabelText(/username/i)).toBeRequired();
    expect(screen.getByLabelText(/^password/i)).toBeRequired();
    expect(screen.getByLabelText(/confirm password/i)).toBeRequired();
  });

  it('should not require email', () => {
    renderWithProviders(<RegisterPage />);

    expect(screen.getByLabelText(/email/i)).not.toBeRequired();
  });

  it('should autofocus username input', () => {
    renderWithProviders(<RegisterPage />);

    // React's autoFocus focuses programmatically; no attribute
    // is rendered, so assert the focus outcome itself.
    expect(screen.getByLabelText(/username/i)).toHaveFocus();
  });
});
