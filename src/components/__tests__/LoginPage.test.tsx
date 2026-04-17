import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '../LoginPage';
import { renderWithProviders } from '../../__tests__/helpers';
import { useAuthStore } from '../../stores/authStore';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<
    typeof import('react-router-dom')
  >('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null }),
  };
});

// Mock notifications
vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

describe.skip('LoginPage', () => {
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

  it('should render login form', () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByText('Welcome to Bible Research')).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('should show helper text about account creation', () => {
    renderWithProviders(<LoginPage />);

    expect(
      screen.getByText(/You need a user account with a password/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Auto-created accounts/i)
    ).toBeInTheDocument();
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

  it('should call login on form submit', async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockResolvedValue(undefined);
    
    useAuthStore.setState({
      login: mockLogin as any,
    });

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'testpass123');
    });
  });

  it('should navigate to /notes after successful login', async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockResolvedValue(undefined);
    
    useAuthStore.setState({
      login: mockLogin as any,
    });

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/notes', { replace: true });
    });
  });

  it('should display error message on login failure', async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockRejectedValue(
      new Error('Invalid credentials')
    );
    
    useAuthStore.setState({
      login: mockLogin as any,
      error: 'Invalid credentials',
    });

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument();
    });
  });

  it('should show loading state during login', async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );
    
    useAuthStore.setState({
      login: mockLogin as any,
    });

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);

    // Button should show loading state
    await waitFor(() => {
      expect(submitButton).toBeDisabled();
    });
  });

  it('should disable inputs during loading', async () => {
    useAuthStore.setState({
      isLoading: true,
    });

    renderWithProviders(<LoginPage />);

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);

    expect(usernameInput).toBeDisabled();
    expect(passwordInput).toBeDisabled();
  });

  it('should clear error when clearError is called', async () => {
    const user = userEvent.setup();
    const mockClearError = vi.fn();
    
    useAuthStore.setState({
      error: 'Test error',
      clearError: mockClearError,
    });

    renderWithProviders(<LoginPage />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    expect(mockClearError).toHaveBeenCalled();
  });

  it('should require username and password', () => {
    renderWithProviders(<LoginPage />);

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);

    expect(usernameInput).toBeRequired();
    expect(passwordInput).toBeRequired();
  });

  it('should autofocus username input', () => {
    renderWithProviders(<LoginPage />);

    const usernameInput = screen.getByLabelText(/username/i);
    expect(usernameInput).toHaveAttribute('autofocus');
  });
});
