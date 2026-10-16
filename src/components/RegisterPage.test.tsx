import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegisterPage } from './RegisterPage';
import { renderWithProviders } from '../__tests__/helpers';
import { useAuthStore } from '../stores/authStore';

// Mock useNavigate
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

// Mock notifications (hoisted — vi.mock factories run before
// module-level consts).
const mockShowNotification = vi.hoisted(() => vi.fn());
vi.mock('@mantine/notifications', () => ({
  showNotification: mockShowNotification,
}));

// Mantine's PasswordInput label is not associated with the
// inner input via `for`, so password fields are located by
// their placeholders instead of labels.
const usernameInput = () => screen.getByLabelText(/username/i);
const emailInput = () => screen.getByLabelText(/email/i);
const passwordInput = () =>
  screen.getByPlaceholderText('Create a strong password');
const confirmInput = () =>
  screen.getByPlaceholderText('Re-enter your password');
const submitButton = () =>
  screen.getByRole('button', { name: /create account/i });

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('should render registration form', () => {
    renderWithProviders(<RegisterPage />);

    expect(
      screen.getByRole('heading', { name: 'Create Account' })
    ).toBeInTheDocument();
    expect(usernameInput()).toBeInTheDocument();
    expect(emailInput()).toBeInTheDocument();
    expect(passwordInput()).toBeInTheDocument();
    expect(confirmInput()).toBeInTheDocument();
    expect(submitButton()).toBeInTheDocument();
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
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('should handle user input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await user.type(usernameInput(), 'newuser');
    await user.type(emailInput(), 'test@example.com');
    await user.type(passwordInput(), 'SecurePass123');
    await user.type(confirmInput(), 'SecurePass123');

    expect(usernameInput()).toHaveValue('newuser');
    expect(emailInput()).toHaveValue('test@example.com');
    expect(passwordInput()).toHaveValue('SecurePass123');
    expect(confirmInput()).toHaveValue('SecurePass123');
  });

  it('should show error if passwords do not match', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await user.type(usernameInput(), 'newuser');
    await user.type(passwordInput(), 'password123');
    await user.type(confirmInput(), 'differentpass');
    await user.click(submitButton());

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          message: 'Passwords do not match',
          color: 'red',
        })
      );
    });
  });

  it('should show error if password is too short', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await user.type(usernameInput(), 'newuser');
    await user.type(passwordInput(), 'short');
    await user.type(confirmInput(), 'short');
    await user.click(submitButton());

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          message: 'Password must be at least 8 characters long',
          color: 'red',
        })
      );
    });
  });

  it('should call register on form submit', async () => {
    const user = userEvent.setup();
    const mockRegister = vi.fn().mockResolvedValue(undefined);

    useAuthStore.setState({
      register: mockRegister,
    });

    renderWithProviders(<RegisterPage />);

    await user.type(usernameInput(), 'newuser');
    await user.type(emailInput(), 'test@example.com');
    await user.type(passwordInput(), 'SecurePass123');
    await user.type(confirmInput(), 'SecurePass123');
    await user.click(submitButton());

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        'newuser',
        'SecurePass123',
        'SecurePass123',
        'test@example.com'
      );
    });
  });

  it('should register without email if not provided', async () => {
    const user = userEvent.setup();
    const mockRegister = vi.fn().mockResolvedValue(undefined);

    useAuthStore.setState({
      register: mockRegister,
    });

    renderWithProviders(<RegisterPage />);

    await user.type(usernameInput(), 'newuser');
    await user.type(passwordInput(), 'SecurePass123');
    await user.type(confirmInput(), 'SecurePass123');
    await user.click(submitButton());

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        'newuser',
        'SecurePass123',
        'SecurePass123',
        undefined
      );
    });
  });

  it('should show success notification after registration',
    async () => {
      const user = userEvent.setup();
      const mockRegister = vi.fn().mockResolvedValue(undefined);

      useAuthStore.setState({
        register: mockRegister,
      });

      renderWithProviders(<RegisterPage />);

      await user.type(usernameInput(), 'newuser');
      await user.type(passwordInput(), 'SecurePass123');
      await user.type(confirmInput(), 'SecurePass123');
      await user.click(submitButton());

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

  it('should navigate to /notes after successful registration',
    async () => {
      const user = userEvent.setup();
      const mockRegister = vi.fn().mockResolvedValue(undefined);

      useAuthStore.setState({
        register: mockRegister,
      });

      renderWithProviders(<RegisterPage />);

      await user.type(usernameInput(), 'newuser');
      await user.type(passwordInput(), 'SecurePass123');
      await user.type(confirmInput(), 'SecurePass123');
      await user.click(submitButton());

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/notes',
          { replace: true }
        );
      });
    });

  it('should display error message on registration failure',
    async () => {
      const user = userEvent.setup();
      // Mirror the real store: a failed register records the
      // error in state before rejecting.
      const mockRegister = vi.fn().mockImplementation(async () => {
        useAuthStore.setState({
          error: 'Username already exists',
        });
        throw new Error('Username already exists');
      });

      useAuthStore.setState({
        register: mockRegister,
      });

      renderWithProviders(<RegisterPage />);

      await user.type(usernameInput(), 'existinguser');
      await user.type(passwordInput(), 'SecurePass123');
      await user.type(confirmInput(), 'SecurePass123');
      await user.click(submitButton());

      await waitFor(() => {
        expect(
          screen.getByText(/username already exists/i)
        ).toBeInTheDocument();
      });
    });

  it('should show loading state during registration', () => {
    renderWithProviders(<RegisterPage />, {
      authStoreState: { isLoading: true },
    });

    expect(submitButton()).toBeDisabled();
    expect(usernameInput()).toBeDisabled();
  });

  it('should clear a stale auth error on mount', () => {
    renderWithProviders(<RegisterPage />, {
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
    renderWithProviders(<RegisterPage />);

    act(() => {
      useAuthStore.setState({ error: 'Registration failed' });
    });

    expect(
      screen.getByText('Registration failed')
    ).toBeInTheDocument();
  });

  it('should clear the error via the alert close button',
    async () => {
      const user = userEvent.setup();
      const mockClearError = vi.fn();

      renderWithProviders(<RegisterPage />);

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

  it('should require username and passwords', () => {
    renderWithProviders(<RegisterPage />);

    expect(usernameInput()).toBeRequired();
    expect(passwordInput()).toBeRequired();
    expect(confirmInput()).toBeRequired();
  });

  it('should not require email', () => {
    renderWithProviders(<RegisterPage />);

    expect(emailInput()).not.toBeRequired();
  });

  it('should autofocus username input', () => {
    renderWithProviders(<RegisterPage />);

    // React's autoFocus focuses the element — no attribute.
    expect(usernameInput()).toHaveFocus();
  });
});
