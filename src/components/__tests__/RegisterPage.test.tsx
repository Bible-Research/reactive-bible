import type { ReactNode } from 'react';
import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from 'vitest';
import {
  act,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegisterPage } from '../RegisterPage';
import { renderWithProviders } from '../../__tests__/helpers';
import {
  useAuthStore,
  type AuthState,
} from '../../stores/authStore';

// `vi.mock` factories are hoisted above the imports, so the
// spies they capture must be created via `vi.hoisted` too.
const { mockNavigate, mockShowNotification } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockShowNotification: vi.fn(),
}));

// Mock useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<
    typeof import('react-router-dom')
  >('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ to, children }: { to: string; children: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  };
});

// Mock notifications
vi.mock('@mantine/notifications', () => ({
  showNotification: mockShowNotification,
}));

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
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password\b/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^confirm password/i)).toBeInTheDocument();
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

    expect(screen.getByText(/already have an account/i)).toBeInTheDocument();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('should handle user input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    const usernameInput = screen.getByLabelText(/username/i);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password\b/i);
    const confirmInput = screen.getByLabelText(/^confirm password/i);

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

    await user.type(screen.getByLabelText(/username/i), 'newuser');
    await user.type(screen.getByLabelText(/^password\b/i), 'password123');
    await user.type(
      screen.getByLabelText(/^confirm password/i),
      'differentpass'
    );
    await user.click(
      screen.getByRole('button', { name: /create account/i })
    );

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

    await user.type(screen.getByLabelText(/username/i), 'newuser');
    await user.type(screen.getByLabelText(/^password\b/i), 'short');
    await user.type(screen.getByLabelText(/^confirm password/i), 'short');
    await user.click(
      screen.getByRole('button', { name: /create account/i })
    );

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
      register: mockRegister as AuthState['register'],
    });

    renderWithProviders(<RegisterPage />);

    await user.type(screen.getByLabelText(/username/i), 'newuser');
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/^password\b/i), 'SecurePass123');
    await user.type(
      screen.getByLabelText(/^confirm password/i),
      'SecurePass123'
    );
    await user.click(
      screen.getByRole('button', { name: /create account/i })
    );

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
      register: mockRegister as AuthState['register'],
    });

    renderWithProviders(<RegisterPage />);

    await user.type(screen.getByLabelText(/username/i), 'newuser');
    await user.type(screen.getByLabelText(/^password\b/i), 'SecurePass123');
    await user.type(
      screen.getByLabelText(/^confirm password/i),
      'SecurePass123'
    );
    await user.click(
      screen.getByRole('button', { name: /create account/i })
    );

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        'newuser',
        'SecurePass123',
        'SecurePass123',
        undefined
      );
    });
  });

  it('should show success notification after registration', async () => {
    const user = userEvent.setup();
    const mockRegister = vi.fn().mockResolvedValue(undefined);

    useAuthStore.setState({
      register: mockRegister as AuthState['register'],
    });

    renderWithProviders(<RegisterPage />);

    await user.type(screen.getByLabelText(/username/i), 'newuser');
    await user.type(screen.getByLabelText(/^password\b/i), 'SecurePass123');
    await user.type(
      screen.getByLabelText(/^confirm password/i),
      'SecurePass123'
    );
    await user.click(
      screen.getByRole('button', { name: /create account/i })
    );

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Success',
          message: expect.stringContaining('Account created successfully'),
          color: 'green',
        })
      );
    });
  });

  it('should navigate to /notes after successful registration', async () => {
    const user = userEvent.setup();
    const mockRegister = vi.fn().mockResolvedValue(undefined);

    useAuthStore.setState({
      register: mockRegister as AuthState['register'],
    });

    renderWithProviders(<RegisterPage />);

    await user.type(screen.getByLabelText(/username/i), 'newuser');
    await user.type(screen.getByLabelText(/^password\b/i), 'SecurePass123');
    await user.type(
      screen.getByLabelText(/^confirm password/i),
      'SecurePass123'
    );
    await user.click(
      screen.getByRole('button', { name: /create account/i })
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/notes', { replace: true });
    });
  });

  it('should display error message on registration failure', async () => {
    const user = userEvent.setup();
    const mockRegister = vi.fn().mockRejectedValue(
      new Error('Username already exists')
    );

    useAuthStore.setState({
      register: mockRegister as AuthState['register'],
    });

    renderWithProviders(<RegisterPage />);

    // The page clears stale auth errors on mount — a real
    // registration failure lands in the store after render.
    await user.type(screen.getByLabelText(/username/i), 'existinguser');
    await user.type(screen.getByLabelText(/^password\b/i), 'SecurePass123');
    await user.type(
      screen.getByLabelText(/^confirm password/i),
      'SecurePass123'
    );
    act(() => {
      useAuthStore.setState({ error: 'Username already exists' });
    });

    await waitFor(() => {
      expect(
        screen.getByText(/username already exists/i)
      ).toBeInTheDocument();
    });
  });

  it('should show loading state during registration', async () => {
    // Pass via overrides — renderWithProviders resets the
    // auth store to its initial state on every render.
    renderWithProviders(<RegisterPage />, {
      stores: { auth: { isLoading: true } },
    });

    const submitButton = screen.getByRole('button', {
      name: /create account/i,
    });
    const usernameInput = screen.getByLabelText(/username/i);

    expect(submitButton).toBeDisabled();
    expect(usernameInput).toBeDisabled();
  });

  it('should clear error when clearError is called', async () => {
    const user = userEvent.setup();
    const mockClearError = vi.fn();

    useAuthStore.setState({
      clearError: mockClearError,
    });
    renderWithProviders(<RegisterPage />);
    act(() => {
      useAuthStore.setState({ error: 'Test error' });
    });

    // The Alert close button has no accessible name (the page
    // doesn't pass `closeButtonLabel`) — locate it inside the
    // alert instead.
    const alert = screen.getByRole('alert');
    await user.click(within(alert).getByRole('button'));

    expect(mockClearError).toHaveBeenCalled();
  });

  it('should require username and passwords', () => {
    renderWithProviders(<RegisterPage />);

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/^password\b/i);
    const confirmInput = screen.getByLabelText(/^confirm password/i);

    expect(usernameInput).toBeRequired();
    expect(passwordInput).toBeRequired();
    expect(confirmInput).toBeRequired();
  });

  it('should not require email', () => {
    renderWithProviders(<RegisterPage />);

    const emailInput = screen.getByLabelText(/email/i);
    expect(emailInput).not.toBeRequired();
  });

  it('should autofocus username input', () => {
    renderWithProviders(<RegisterPage />);

    const usernameInput = screen.getByLabelText(/username/i);
    expect(usernameInput).toHaveFocus();
  });
});
