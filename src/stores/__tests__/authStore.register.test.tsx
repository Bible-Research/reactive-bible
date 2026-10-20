import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createTestAuthStore } from '../authStore';
import { server } from '../../mocks/server';
import { API_BASE_URL } from '../../config';

const REGISTER_URL = `${API_BASE_URL}/api/v1/users/register/`;

// The auth store is a vanilla zustand store — tests exercise it
// through getState() directly against the MSW register endpoint.
describe('authStore - Register', () => {
  const mockToken = 'test-token-123';
  const mockUsername = 'testuser';
  const mockPassword = 'testpass123';
  const mockEmail = 'test@example.com';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('register', () => {
    it('should successfully register with valid data', async () => {
      let capturedBody: Record<string, unknown> = {};
      server.use(
        http.post(REGISTER_URL, async ({ request }) => {
          capturedBody = (await request.json()) as Record<
            string,
            unknown
          >;
          return HttpResponse.json(
            {
              user: {
                id: 1,
                username: mockUsername,
                email: mockEmail,
                date_joined: '2026-03-01T05:18:57.243006Z',
              },
              token: mockToken,
              message: 'User registered successfully',
            },
            { status: 201 }
          );
        })
      );
      const store = createTestAuthStore();

      await store
        .getState()
        .register(mockUsername, mockPassword, mockPassword, mockEmail);

      const state = store.getState();
      expect(state.token).toBe(mockToken);
      // The register payload's user id is kept for comment
      // author matching — login's /api/token/ response has
      // no id and falls back to username matching.
      expect(state.user).toEqual({
        id: 1,
        username: mockUsername,
      });
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(capturedBody).toEqual({
        username: mockUsername,
        password: mockPassword,
        password_confirm: mockPassword,
        email: mockEmail,
      });
    });

    it('should register without email', async () => {
      let capturedBody: Record<string, unknown> = {};
      server.use(
        http.post(REGISTER_URL, async ({ request }) => {
          capturedBody = (await request.json()) as Record<
            string,
            unknown
          >;
          return HttpResponse.json(
            {
              user: { id: 1, username: mockUsername },
              token: mockToken,
              message: 'User registered successfully',
            },
            { status: 201 }
          );
        })
      );
      const store = createTestAuthStore();

      await store
        .getState()
        .register(mockUsername, mockPassword, mockPassword);

      const state = store.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(capturedBody).toEqual({
        username: mockUsername,
        password: mockPassword,
        password_confirm: mockPassword,
      });
      expect(capturedBody).not.toHaveProperty('email');
    });

    it('should handle username already exists error', async () => {
      server.use(
        http.post(REGISTER_URL, () =>
          HttpResponse.json(
            {
              username: [
                'A user with that username already exists.',
              ],
            },
            { status: 400 }
          )
        )
      );
      const store = createTestAuthStore();

      await expect(
        store
          .getState()
          .register(mockUsername, mockPassword, mockPassword)
      ).rejects.toThrow(
        'A user with that username already exists.'
      );

      const state = store.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe(
        'A user with that username already exists.'
      );
    });

    it('should handle password validation errors', async () => {
      server.use(
        http.post(REGISTER_URL, () =>
          HttpResponse.json(
            { password: ['This password is too short.'] },
            { status: 400 }
          )
        )
      );
      const store = createTestAuthStore();

      await expect(
        store.getState().register(mockUsername, 'short', 'short')
      ).rejects.toThrow('This password is too short.');

      const state = store.getState();
      expect(state.error).toBe('This password is too short.');
      expect(state.isAuthenticated).toBe(false);
    });

    it('should handle password mismatch error', async () => {
      server.use(
        http.post(REGISTER_URL, () =>
          HttpResponse.json(
            { password_confirm: ['Passwords do not match.'] },
            { status: 400 }
          )
        )
      );
      const store = createTestAuthStore();

      await expect(
        store
          .getState()
          .register(mockUsername, mockPassword, 'differentpassword')
      ).rejects.toThrow('Passwords do not match.');

      expect(store.getState().error).toBe(
        'Passwords do not match.'
      );
    });

    it('should handle email validation errors', async () => {
      server.use(
        http.post(REGISTER_URL, () =>
          HttpResponse.json(
            { email: ['Enter a valid email address.'] },
            { status: 400 }
          )
        )
      );
      const store = createTestAuthStore();

      await expect(
        store
          .getState()
          .register(
            mockUsername,
            mockPassword,
            mockPassword,
            'invalid-email'
          )
      ).rejects.toThrow('Enter a valid email address.');

      expect(store.getState().error).toBe(
        'Enter a valid email address.'
      );
    });

    it('should set loading state during registration', async () => {
      server.use(
        http.post(REGISTER_URL, async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return HttpResponse.json(
            {
              user: { username: mockUsername },
              token: mockToken,
            },
            { status: 201 }
          );
        })
      );
      const store = createTestAuthStore();

      const registerPromise = store
        .getState()
        .register(mockUsername, mockPassword, mockPassword);

      // isLoading flips synchronously at the start of register.
      expect(store.getState().isLoading).toBe(true);

      await registerPromise;

      expect(store.getState().isLoading).toBe(false);
      expect(store.getState().isAuthenticated).toBe(true);
    });
  });
});
