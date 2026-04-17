import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserMenu } from '../UserMenu';
import { renderWithProviders, createMockFetch } from '../../__tests__/helpers';
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
  };
});

// Mock notifications
vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

describe('UserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('When not authenticated', () => {
    it('should show Sign In button', () => {
      renderWithProviders(<UserMenu />, { authStoreState: { isAuthenticated: false, user: null } });
      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });

    it('should navigate to /login when Sign In clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserMenu />, { authStoreState: { isAuthenticated: false, user: null } });

      await user.click(screen.getByText('Sign In'));

      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  describe('When authenticated', () => {
    const authState = { isAuthenticated: true, user: { username: 'testuser' } };

    it('should show username', () => {
      renderWithProviders(<UserMenu />, { authStoreState: authState });
      expect(screen.getByText('testuser')).toBeInTheDocument();
    });

    it('should show user avatar with first letter', () => {
      renderWithProviders(<UserMenu />, { authStoreState: authState });
      expect(screen.getByText('T')).toBeInTheDocument(); // First letter
    });

    it('should show dropdown menu when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserMenu />, { authStoreState: authState });

      await user.click(screen.getByText('testuser'));

      expect(screen.getByText('Account')).toBeInTheDocument();
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });

    it('should call logout when Logout clicked', async () => {
      const user = userEvent.setup();
      const mockLogout = vi.fn();

      renderWithProviders(<UserMenu />, { 
        authStoreState: { ...authState, logout: mockLogout }
      });

      await user.click(screen.getByText('testuser'));
      await user.click(screen.getByText('Logout'));

      expect(mockLogout).toHaveBeenCalled();
    });

    it('should navigate to /login after logout', async () => {
      const user = userEvent.setup();
      const mockLogout = vi.fn(() => {
        // Simulate logout behavior
        useAuthStore.setState({ isAuthenticated: false, user: null, token: null });
      });

      renderWithProviders(<UserMenu />, {
        authStoreState: { ...authState, logout: mockLogout },
      });

      await user.click(screen.getByText('testuser'));
      await user.click(screen.getByText('Logout'));

      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });
});
