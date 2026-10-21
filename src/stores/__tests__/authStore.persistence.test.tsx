import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createTestAuthStore } from '../authStore';
import { server } from '../../mocks/server';
import { API_BASE_URL } from '../../config';

const TOKEN_URL = `${API_BASE_URL}/api/token/`;

describe('authStore - Persistence', () => {
  const mockToken = 'test-token-123';
  const mockUsername = 'testuser';
  const mockPassword = 'testpass123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Persistence', () => {
    it('should persist token and user to localStorage', async () => {
      server.use(
        http.post(TOKEN_URL, () =>
          HttpResponse.json({ token: mockToken })
        )
      );
      const store = createTestAuthStore();

      await store.getState().login(mockUsername, mockPassword);

      // Check localStorage
      const stored = localStorage.getItem('auth-storage');
      if (!stored) {
        throw new Error('expected persisted auth state');
      }
      const parsed = JSON.parse(stored);
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

      // Create new store instance
      const store = createTestAuthStore();

      expect(store.getState().token).toBe(mockToken);
      expect(store.getState().user).toEqual({
        username: mockUsername,
      });
    });

    it('should keep isAuthenticated false when no token is stored', () => {
      const store = createTestAuthStore();

      expect(store.getState().token).toBeNull();
      expect(store.getState().isAuthenticated).toBe(false);
    });

    it('authenticates optimistically on token rehydrate', () => {
      const authData = {
        state: {
          token: mockToken,
          user: { username: mockUsername },
        },
        version: 0,
      };
      localStorage.setItem('auth-storage', JSON.stringify(authData));

      const store = createTestAuthStore();

      // merge() derives isAuthenticated from the persisted
      // token so the first render after rehydration already
      // knows the session — checkAuth then validates it
      // against the API and can still log a stale token out.
      expect(store.getState().token).toBe(mockToken);
      expect(store.getState().isAuthenticated).toBe(true);

      store.getState().checkAuth();

      expect(store.getState().isAuthenticated).toBe(true);
    });
  });
});
