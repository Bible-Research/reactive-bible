import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestAuthStore } from './authStore';
import { API_BASE_URL } from '../config';

describe('authStore - Login', () => {
  const mockToken = 'test-token-123';
  const mockUsername = 'testuser';
  const mockPassword = 'testpass123';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const useTestAuthStore = createTestAuthStore();
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: mockToken }),
      });

      await useTestAuthStore.getState().login(
        mockUsername,
        mockPassword
      );

      const state = useTestAuthStore.getState();
      expect(state.token).toBe(mockToken);
      expect(state.user).toEqual({ username: mockUsername });
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should set loading state during login', async () => {
      const useTestAuthStore = createTestAuthStore();
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ token: mockToken }),
                }),
              50
            )
          )
      );

      const loginPromise = useTestAuthStore
        .getState()
        .login(mockUsername, mockPassword);

      // isLoading flips synchronously before the first await.
      expect(useTestAuthStore.getState().isLoading).toBe(true);

      await loginPromise;

      expect(useTestAuthStore.getState().isLoading).toBe(false);
    });

    it('should handle 400 error (invalid credentials)', async () => {
      const errorResponse = {
        non_field_errors: [
          'Unable to log in with provided credentials.',
        ],
      };

      const useTestAuthStore = createTestAuthStore();
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => errorResponse,
      });

      await expect(
        useTestAuthStore.getState().login(mockUsername, mockPassword)
      ).rejects.toThrow();

      const state = useTestAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toContain('credentials');
    });

    it('should handle 401 error', async () => {
      const useTestAuthStore = createTestAuthStore();
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await expect(
        useTestAuthStore.getState().login(mockUsername, mockPassword)
      ).rejects.toThrow('Invalid username or password');

      expect(useTestAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('should handle network errors', async () => {
      const useTestAuthStore = createTestAuthStore();
      global.fetch = vi.fn().mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(
        useTestAuthStore.getState().login(mockUsername, mockPassword)
      ).rejects.toThrow('Network error');

      const state = useTestAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe('Network error');
    });

    it('should send correct request format', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: mockToken }),
      });
      global.fetch = mockFetch;

      const useTestAuthStore = createTestAuthStore();
      await useTestAuthStore
        .getState()
        .login(mockUsername, mockPassword);

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/api/token/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: mockUsername,
            password: mockPassword,
          }),
        }
      );
    });
  });
});
