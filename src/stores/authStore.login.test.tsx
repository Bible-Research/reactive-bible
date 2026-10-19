import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createTestAuthStore } from './authStore';
import { server } from '../mocks/server';
import { API_BASE_URL } from '../config';

const TOKEN_URL = `${API_BASE_URL}/api/token/`;

// The auth store is a vanilla zustand store — tests exercise it
// through getState() directly against the MSW token endpoint,
// no React render required.
describe('authStore - Login', () => {
  const mockToken = 'test-token-123';
  const mockUsername = 'testuser';
  const mockPassword = 'testpass123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      server.use(
        http.post(TOKEN_URL, () =>
          HttpResponse.json({ token: mockToken })
        )
      );
      const store = createTestAuthStore();

      await store.getState().login(mockUsername, mockPassword);

      const state = store.getState();
      expect(state.token).toBe(mockToken);
      expect(state.user).toEqual({ username: mockUsername });
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should set loading state during login', async () => {
      server.use(
        http.post(TOKEN_URL, async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return HttpResponse.json({ token: mockToken });
        })
      );
      const store = createTestAuthStore();

      const loginPromise = store
        .getState()
        .login(mockUsername, mockPassword);

      // isLoading flips synchronously at the start of login.
      expect(store.getState().isLoading).toBe(true);

      await loginPromise;

      expect(store.getState().isLoading).toBe(false);
      expect(store.getState().isAuthenticated).toBe(true);
    });

    it('should handle 400 error (invalid credentials)', async () => {
      server.use(
        http.post(TOKEN_URL, () =>
          HttpResponse.json(
            {
              non_field_errors: [
                'Unable to log in with provided credentials.',
              ],
            },
            { status: 400 }
          )
        )
      );
      const store = createTestAuthStore();

      await expect(
        store.getState().login(mockUsername, mockPassword)
      ).rejects.toThrow();

      const state = store.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toContain('credentials');
    });

    it('should handle 401 error', async () => {
      server.use(
        http.post(TOKEN_URL, () =>
          HttpResponse.json({}, { status: 401 })
        )
      );
      const store = createTestAuthStore();

      await expect(
        store.getState().login(mockUsername, mockPassword)
      ).rejects.toThrow('Invalid username or password');

      const state = store.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.token).toBeNull();
      expect(state.error).toBe('Invalid username or password');
    });

    it('should handle network errors', async () => {
      server.use(http.post(TOKEN_URL, () => HttpResponse.error()));
      const store = createTestAuthStore();

      let thrown: unknown;
      await store
        .getState()
        .login(mockUsername, mockPassword)
        .catch((error) => {
          thrown = error;
        });

      const state = store.getState();
      expect(thrown).toBeInstanceOf(Error);
      expect(state.isAuthenticated).toBe(false);
      expect(state.token).toBeNull();
      // The store surfaces the fetch error's own message.
      expect(state.error).toBe((thrown as Error).message);
    });

    it('should send correct request format', async () => {
      let capturedUrl = '';
      let capturedContentType: string | null = null;
      let capturedBody: unknown;
      server.use(
        http.post(TOKEN_URL, async ({ request }) => {
          capturedUrl = request.url;
          capturedContentType = request.headers.get('Content-Type');
          capturedBody = await request.json();
          return HttpResponse.json({ token: mockToken });
        })
      );
      const store = createTestAuthStore();

      await store.getState().login(mockUsername, mockPassword);

      expect(capturedUrl).toBe(TOKEN_URL);
      expect(capturedContentType).toBe('application/json');
      expect(capturedBody).toEqual({
        username: mockUsername,
        password: mockPassword,
      });
    });

    it('should not log the submitted password in plaintext', async () => {
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined);
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const renderedCalls = (calls: unknown[][]) =>
        calls.map((call) =>
          call
            .map((arg) =>
              typeof arg === 'string'
                ? arg
                : JSON.stringify(arg)
            )
            .join(' ')
        );
      server.use(
        http.post(TOKEN_URL, () =>
          HttpResponse.json({ token: mockToken })
        )
      );
      const store = createTestAuthStore();

      await store.getState().login(mockUsername, mockPassword);

      expect(logSpy).toHaveBeenCalled();
      for (const rendered of renderedCalls(logSpy.mock.calls)) {
        expect(rendered).not.toContain(mockPassword);
      }
      // The pre-submit "Login attempt" log was removed
      // outright — nothing carrying the request body may be
      // logged at all.
      const attemptLog = logSpy.mock.calls
        .map((call) => JSON.stringify(call))
        .find((entry) => entry.includes('Login attempt'));
      expect(attemptLog).toBeUndefined();

      // The error path must not leak either — a backend that
      // echoes the request body would otherwise resurface the
      // password through console.error.
      server.use(
        http.post(TOKEN_URL, () =>
          HttpResponse.json(
            {
              detail: 'Invalid credentials',
              echo: { password: mockPassword },
            },
            { status: 400 }
          )
        )
      );

      await expect(
        store.getState().login(mockUsername, mockPassword)
      ).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalled();
      for (const rendered of renderedCalls(errorSpy.mock.calls)) {
        expect(rendered).not.toContain(mockPassword);
      }
    });
  });
});
