import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { ProtectedRoute } from '../ProtectedRoute';
import { renderWithProviders } from '../../__tests__/helpers';

// Mock Navigate component
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<
    typeof import('react-router-dom')
  >('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to, state }: { to: string; state?: unknown }) => {
      mockNavigate(to, state);
      return <div data-testid="navigate-mock">Redirecting to {to}</div>;
    },
    useLocation: () => ({ pathname: '/notes', state: null }),
  };
});

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('When authenticated', () => {
    const authState = {
      isAuthenticated: true,
      token: 'test-token',
      user: { username: 'testuser' },
    };

    it('should render children', () => {
      renderWithProviders(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
        { authStoreState: authState }
      );

      expect(
        screen.getByText('Protected Content')
      ).toBeInTheDocument();
    });

    it('should not redirect', () => {
      renderWithProviders(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
        { authStoreState: authState }
      );

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should render children on a persisted token before ' +
      'checkAuth flips isAuthenticated', () => {
      // The token rehydrates from localStorage before App's
      // checkAuth runs — gating on isAuthenticated alone would
      // bounce logged-in users on refresh.
      renderWithProviders(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
        {
          authStoreState: {
            isAuthenticated: false,
            token: 'test-token',
            user: { username: 'testuser' },
          },
        }
      );

      expect(
        screen.getByText('Protected Content')
      ).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('When not authenticated', () => {
    it('should not render children', () => {
      renderWithProviders(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(
        screen.queryByText('Protected Content')
      ).not.toBeInTheDocument();
    });

    it('should redirect to /login', () => {
      renderWithProviders(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(mockNavigate).toHaveBeenCalledWith(
        '/login',
        expect.objectContaining({
          from: expect.objectContaining({
            pathname: '/notes',
          }),
        })
      );
    });

    it('should preserve intended location in state', () => {
      renderWithProviders(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      const callArgs = mockNavigate.mock.calls[0];
      expect(callArgs[0]).toBe('/login');
      expect(callArgs[1].from.pathname).toBe('/notes');
    });
  });
});
