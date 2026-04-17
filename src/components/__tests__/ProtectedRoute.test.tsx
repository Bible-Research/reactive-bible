import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { ProtectedRoute } from '../ProtectedRoute';
import { renderWithProviders } from '../../__tests__/helpers';
import { useAuthStore } from '../../stores/authStore';

// Mock Navigate component
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<
    typeof import('react-router-dom')
  >('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to, state }: any) => {
      mockNavigate(to, state);
      return <div data-testid="navigate-mock">Redirecting to {to}</div>;
    },
    useLocation: () => ({ pathname: '/notes', state: null }),
  };
});

describe.skip('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe.skip('When authenticated', () => {
    beforeEach(() => {
      useAuthStore.setState({
        isAuthenticated: true,
      });
    });

    it('should render children', () => {
      renderWithProviders(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('should not redirect', () => {
      renderWithProviders(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe.skip('When not authenticated', () => {
    beforeEach(() => {
      useAuthStore.setState({
        isAuthenticated: false,
      });
    });

    it('should not render children', () => {
      renderWithProviders(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
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
          state: expect.objectContaining({
            from: expect.objectContaining({
              pathname: '/notes',
            }),
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
      expect(callArgs[1].state.from.pathname).toBe('/notes');
    });
  });
});
