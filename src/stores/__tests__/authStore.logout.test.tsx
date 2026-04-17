import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { createTestAuthStore } from '../authStore';

describe('authStore - Logout', () => {
  const mockToken = 'test-token-123';
  const mockUsername = 'testuser';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.removeItem('auth-storage');
    vi.restoreAllMocks();
  });

  describe('logout', () => {
    it('should clear auth state on logout', () => {
      const useTestAuthStore = createTestAuthStore();
      const { result } = renderHook(() => useTestAuthStore());

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
