import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { createTestAuthStore } from '../authStore';

describe('authStore', () => {
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

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const useTestAuthStore = createTestAuthStore();
      const { result } = renderHook(() => useTestAuthStore());
      
      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });


  describe('clearError', () => {
    it('should clear error message', () => {
      const useTestAuthStore = createTestAuthStore();
      const { result } = renderHook(() => useTestAuthStore());

      // Set error
      act(() => {
        result.current.setToken(mockToken, mockUsername);
      });
      
      // Manually set error for testing
      act(() => {
        useTestAuthStore.setState({ error: 'Test error' });
      });

      expect(result.current.error).toBe('Test error');

      // Clear error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('setToken', () => {
    it('should set token and user manually', () => {
      const useTestAuthStore = createTestAuthStore();
      const { result } = renderHook(() => useTestAuthStore());

      act(() => {
        result.current.setToken(mockToken, mockUsername);
      });

      expect(result.current.token).toBe(mockToken);
      expect(result.current.user).toEqual({ username: mockUsername });
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe('login security', () => {
    it('never logs the plaintext password', async () => {
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined);
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: mockToken,
          user: { username: 'canonical' },
        }),
      });

      const useTestAuthStore = createTestAuthStore();
      const { result } = renderHook(() => useTestAuthStore());

      await act(async () => {
        await result.current.login('typed-name', 'secret-pw');
      });

      const logged = JSON.stringify(logSpy.mock.calls);
      expect(logged).not.toContain('secret-pw');
      expect(logged).toContain('***');
    });

    it('stores the server canonical username, not the ' +
      'as-typed one', async () => {
      vi.spyOn(console, 'log').mockImplementation(
        () => undefined
      );
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: mockToken,
          user: { username: 'Canonical_Name' },
        }),
      });

      const useTestAuthStore = createTestAuthStore();
      const { result } = renderHook(() => useTestAuthStore());

      await act(async () => {
        await result.current.login('canonical_name', 'pw');
      });

      expect(result.current.user).toEqual({
        username: 'Canonical_Name',
      });
    });

    it('rehydrates isAuthenticated from a persisted token ' +
      'before checkAuth runs', () => {
      // A pre-change blob carries only token+user — merge must
      // still derive isAuthenticated so first-pass effects do
      // not double-fetch.
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            token: mockToken,
            user: { username: mockUsername },
          },
          version: 0,
        })
      );

      const useTestAuthStore = createTestAuthStore();
      const { result } = renderHook(() => useTestAuthStore());

      // No checkAuth() call — the flag is derived at
      // rehydration.
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe('checkAuth', () => {
    it('should set isAuthenticated to true if token exists', () => {
      const useTestAuthStore = createTestAuthStore();
      const { result } = renderHook(() => useTestAuthStore());

      // Set token
      act(() => {
        useTestAuthStore.setState({ token: mockToken });
      });

      // Check auth
      act(() => {
        result.current.checkAuth();
      });

      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should set isAuthenticated to false if no token', () => {
      const useTestAuthStore = createTestAuthStore();
      const { result } = renderHook(() => useTestAuthStore());

      act(() => {
        result.current.checkAuth();
      });

      expect(result.current.isAuthenticated).toBe(false);
    });
  });

});
