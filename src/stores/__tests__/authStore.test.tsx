import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { showNotification } from '@mantine/notifications';
import { server } from '../../mocks/server';
import { API_BASE_URL } from '../../config';
import { createTestAuthStore } from '../authStore';

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

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

    it('keeps the session when the token validates', async () => {
      // The default MSW handler answers 200 for
      // GET /api/v1/tags/ — a validating token stays
      // authenticated.
      const useTestAuthStore = createTestAuthStore();
      const { result } = renderHook(() => useTestAuthStore());

      act(() => {
        useTestAuthStore.setState({ token: mockToken });
      });

      act(() => {
        result.current.checkAuth();
      });

      // Optimistically authenticated; validation must not
      // flip it back on success.
      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });
      expect(result.current.token).toBe(mockToken);
    });

    it('logs out when the persisted token is rejected (401)',
      async () => {
        server.use(
          http.get(`${API_BASE_URL}/api/v1/tags/`, () =>
            new HttpResponse(null, { status: 401 })
          )
        );
        const useTestAuthStore = createTestAuthStore();
        const { result } = renderHook(() => useTestAuthStore());

        act(() => {
          useTestAuthStore.setState({ token: mockToken });
        });

        act(() => {
          result.current.checkAuth();
        });

        // Optimistically authenticated until validation
        // resolves.
        expect(result.current.isAuthenticated).toBe(true);
        await waitFor(() => {
          expect(result.current.isAuthenticated).toBe(false);
        });
        expect(result.current.token).toBeNull();
        expect(showNotification).toHaveBeenCalledTimes(1);
      });

    it('logs out when the persisted token is rejected (403)',
      async () => {
        server.use(
          http.get(`${API_BASE_URL}/api/v1/tags/`, () =>
            new HttpResponse(null, { status: 403 })
          )
        );
        const useTestAuthStore = createTestAuthStore();
        const { result } = renderHook(() => useTestAuthStore());

        act(() => {
          useTestAuthStore.setState({ token: mockToken });
        });

        act(() => {
          result.current.checkAuth();
        });

        await waitFor(() => {
          expect(result.current.isAuthenticated).toBe(false);
        });
        expect(result.current.token).toBeNull();
      });

    it('keeps the new session when the stale token ' +
      'rejection lands after login() rotated the token',
      async () => {
        // Hold the validation ping in flight while a real
        // login() rotates the token. The stale 401 must not
        // wipe the fresh session.
        let resolvePing: (value: Response) => void =
          () => undefined;
        const ping = new Promise<Response>((resolve) => {
          resolvePing = resolve;
        });
        vi.spyOn(global, 'fetch').mockImplementation(
          (input) =>
            String(input).includes('/api/token/')
              ? Promise.resolve(
                  new Response(
                    JSON.stringify({ token: 'fresh-token' }),
                    { status: 200 }
                  )
                )
              : ping
        );
        const useTestAuthStore = createTestAuthStore();
        const { result } = renderHook(() => useTestAuthStore());

        act(() => {
          useTestAuthStore.setState({ token: 'stale-token' });
        });

        act(() => {
          result.current.checkAuth();
        });

        // login() completes — and rotates the token —
        // while the stale ping is still in flight.
        await act(async () => {
          await result.current.login(mockUsername, 'pw');
        });
        expect(result.current.token).toBe('fresh-token');

        // The stale token's 401 lands now; resolving the
        // ping inside act flushes its .then handler.
        await act(async () => {
          resolvePing(new Response(null, { status: 401 }));
        });

        expect(result.current.token).toBe('fresh-token');
        expect(result.current.user)
          .toEqual({ username: mockUsername });
        expect(result.current.isAuthenticated).toBe(true);
        expect(showNotification).not.toHaveBeenCalled();
      });

    it('keeps the session when validation cannot reach the ' +
      'server', async () => {
        vi.spyOn(global, 'fetch').mockRejectedValue(
          new TypeError('Failed to fetch')
        );
        const useTestAuthStore = createTestAuthStore();
        const { result } = renderHook(() => useTestAuthStore());

        act(() => {
          useTestAuthStore.setState({ token: mockToken });
        });

        act(() => {
          result.current.checkAuth();
        });

        // Flush the rejected ping's .catch — offline
        // users keep their local session. A 0ms timer
        // drains the microtask queue deterministically.
        await act(async () => {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
          });
        });
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.token).toBe(mockToken);
      });
  });

});
