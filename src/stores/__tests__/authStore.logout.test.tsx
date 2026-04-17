import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithAuthStore } from './helpers';
import { useAuthStore } from '../authStore';

describe('authStore - Logout', () => {
  const mockToken = 'test-token-123';
  const mockUsername = 'testuser';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      useAuthStore.setState({
        token: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    });
    localStorage.removeItem('auth-storage');
    vi.restoreAllMocks();
  });

  describe('logout', () => {
    it('should clear auth state on logout', () => {
      const { result } = renderWithAuthStore();

      // Set authenticated state
      act(() => {
        result.current.setToken(mockToken, mockUsername);
      });

      expect(result.current.isAuthenticated).toBe(true);

      // Logout
      act(() => {
        result.current.logout();
      });

      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });
});
