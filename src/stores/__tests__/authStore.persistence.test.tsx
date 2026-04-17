import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { createTestAuthStore } from '../authStore';

describe('authStore - Persistence', () => {
  const mockToken = 'test-token-123';
  const mockUsername = 'testuser';
  const mockPassword = 'testpass123';

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

  describe('Persistence', () => {
    it('should persist token and user to localStorage', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: mockToken }),
      });

      const { result } = renderWithAuthStore();

      await act(async () => {
        await result.current.login(mockUsername, mockPassword);
      });

      // Check localStorage
      const stored = localStorage.getItem('auth-storage');
      expect(stored).toBeTruthy();
      
      const parsed = JSON.parse(stored!);
      expect(parsed.state.token).toBe(mockToken);
      expect(parsed.state.user.username).toBe(mockUsername);
    });

    it('should load token from localStorage on init', () => {
      // Set localStorage
      const authData = {
        state: {
          token: mockToken,
          user: { username: mockUsername },
        },
        version: 0,
      };
      localStorage.setItem('auth-storage', JSON.stringify(authData));

      // Create new hook instance
      const useTestAuthStore = createTestAuthStore();
      const { result } = renderHook(() => useTestAuthStore());

      expect(result.current.token).toBe(mockToken);
      expect(result.current.user).toEqual({ username: mockUsername });
    });
  });
});
