import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestAuthStore } from '../authStore';

describe('authStore - Register', () => {
  const mockToken = 'test-token-123';
  const mockUsername = 'testuser';
  const mockPassword = 'testpass123';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.removeItem('auth-storage');
    vi.restoreAllMocks();
  });

  describe('register', () => {
    it('should successfully register with valid data', async () => {
      const mockEmail = 'test@example.com';
      const mockResponse = {
        user: {
          id: 1,
          username: mockUsername,
          email: mockEmail,
          date_joined: '2026-03-01T05:18:57.243006Z',
        },
        token: mockToken,
        message: 'User registered successfully',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      });

      const useTestAuthStore = createTestAuthStore();
      await useTestAuthStore.getState().register(
        mockUsername,
        mockPassword,
        mockPassword,
        mockEmail
      );

      const state = useTestAuthStore.getState();
      expect(state.token).toBe(mockToken);
      expect(state.user).toEqual({ username: mockUsername });
      expect(state.isAuthenticated).toBe(true);
      expect(state.error).toBeNull();
    });

    it('should register without email', async () => {
      const mockResponse = {
        user: {
          id: 1,
          username: mockUsername,
          date_joined: '2026-03-01T05:18:57.243006Z',
        },
        token: mockToken,
        message: 'User registered successfully',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      });

      const useTestAuthStore = createTestAuthStore();
      await useTestAuthStore.getState().register(
        mockUsername,
        mockPassword,
        mockPassword
      );

      expect(useTestAuthStore.getState().isAuthenticated).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/users/register/'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            username: mockUsername,
            password: mockPassword,
            password_confirm: mockPassword,
          }),
        })
      );
    });

    it('should handle username already exists error', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          username: ['A user with that username already exists.'],
        }),
      });

      const useTestAuthStore = createTestAuthStore();
      await expect(
        useTestAuthStore.getState().register(
          mockUsername,
          mockPassword,
          mockPassword
        )
      ).rejects.toThrow('A user with that username already exists.');

      const state = useTestAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe(
        'A user with that username already exists.'
      );
    });

    it('should handle password validation errors', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          password: ['This password is too short.'],
        }),
      });

      const useTestAuthStore = createTestAuthStore();
      await expect(
        useTestAuthStore.getState().register(
          mockUsername,
          'short',
          'short'
        )
      ).rejects.toThrow('This password is too short.');
    });

    it('should handle password mismatch error', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          password_confirm: ['Passwords do not match.'],
        }),
      });

      const useTestAuthStore = createTestAuthStore();
      await expect(
        useTestAuthStore.getState().register(
          mockUsername,
          mockPassword,
          'differentpassword'
        )
      ).rejects.toThrow('Passwords do not match.');
    });

    it('should handle email validation errors', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          email: ['Enter a valid email address.'],
        }),
      });

      const useTestAuthStore = createTestAuthStore();
      await expect(
        useTestAuthStore.getState().register(
          mockUsername,
          mockPassword,
          mockPassword,
          'invalid-email'
        )
      ).rejects.toThrow('Enter a valid email address.');
    });

    it('should set loading state during registration', async () => {
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 201,
                  json: async () => ({
                    user: { username: mockUsername },
                    token: mockToken,
                  }),
                }),
              50
            )
          )
      );

      const useTestAuthStore = createTestAuthStore();
      const registerPromise = useTestAuthStore
        .getState()
        .register(mockUsername, mockPassword, mockPassword);

      // isLoading flips synchronously before the first await.
      expect(useTestAuthStore.getState().isLoading).toBe(true);

      await registerPromise;

      expect(useTestAuthStore.getState().isLoading).toBe(false);
    });
  });
});
