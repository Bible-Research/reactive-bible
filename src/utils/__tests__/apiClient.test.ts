import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  authenticatedFetch,
  authenticatedUpload,
  publicFetch,
  isAuthenticated,
  getAuthToken,
} from '../apiClient';
import { useAuthStore } from '../../stores/authStore';
import { showNotification } from '@mantine/notifications';

// Mock the notifications
vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

describe('apiClient', () => {
  const mockToken = 'test-token-123';
  const mockUrl = 'https://api.example.com/test';

  beforeEach(() => {
    // Reset auth store
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // `vi.stubGlobal('fetch', …)` survives restoreAllMocks;
    // unstub so the MSW-intercepted fetch is restored.
    vi.unstubAllGlobals();
  });

  describe('authenticatedFetch', () => {
    it('should add Authorization header when token exists', async () => {
      useAuthStore.setState({ token: mockToken });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await authenticatedFetch(mockUrl);

      expect(mockFetch).toHaveBeenCalledWith(mockUrl, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${mockToken}`,
        },
      });
    });

    it('should not add Authorization header when no token', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      vi.stubGlobal('fetch', mockFetch);

      await authenticatedFetch(mockUrl);

      expect(mockFetch).toHaveBeenCalledWith(mockUrl, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('should use Token prefix not Bearer', async () => {
      useAuthStore.setState({ token: mockToken });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      vi.stubGlobal('fetch', mockFetch);

      await authenticatedFetch(mockUrl);

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['Authorization']).toBe(`Token ${mockToken}`);
      expect(callArgs.headers['Authorization']).not.toContain('Bearer');
    });

    it('should merge custom headers with auth headers', async () => {
      useAuthStore.setState({ token: mockToken });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      vi.stubGlobal('fetch', mockFetch);

      await authenticatedFetch(mockUrl, {
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(mockUrl, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${mockToken}`,
          'X-Custom-Header': 'custom-value',
        },
      });
    });

    it('should handle 401 response and logout user', async () => {
      useAuthStore.setState({
        token: mockToken,
        isAuthenticated: true,
      });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(authenticatedFetch(mockUrl)).rejects.toThrow(
        'Session expired'
      );

      // Should have logged out
      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      // The user is told why they were signed out...
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Session Expired' })
      );
      // ...and a 401 is a response, not a network error — it
      // must NOT consume the retry.
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle 403 response with permission error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 403,
        })
      );

      await expect(authenticatedFetch(mockUrl)).rejects.toThrow(
        'You do not have permission'
      );
    });

    it('should retry once on network error', async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        });
      vi.stubGlobal('fetch', mockFetch);

      const response = await authenticatedFetch(mockUrl);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(response.ok).toBe(true);
    });

    it('should not retry on non-network errors', async () => {
      const mockFetch = vi.fn().mockRejectedValueOnce(
        new Error('Not a network error')
      );
      vi.stubGlobal('fetch', mockFetch);

      await expect(authenticatedFetch(mockUrl)).rejects.toThrow(
        'Not a network error'
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should pass through fetch options', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      vi.stubGlobal('fetch', mockFetch);

      const options = {
        method: 'POST',
        body: JSON.stringify({ test: 'data' }),
      };

      await authenticatedFetch(mockUrl, options);

      expect(mockFetch).toHaveBeenCalledWith(mockUrl, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  });

  describe('authenticatedUpload', () => {
    it('posts FormData with the token and no JSON ' +
      'Content-Type', async () => {
      useAuthStore.setState({ token: mockToken });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      vi.stubGlobal('fetch', mockFetch);
      const formData = new FormData();
      formData.append('file', new Blob(['x']), 'x.png');

      const response = await authenticatedUpload(
        mockUrl,
        formData
      );

      // Only Authorization is set — the browser must generate
      // the multipart Content-Type (with boundary) itself.
      expect(mockFetch).toHaveBeenCalledWith(mockUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${mockToken}`,
        },
        body: formData,
      });
      expect(response.ok).toBe(true);
    });

    it('handles 401 like authenticatedFetch: logout and ' +
      'session-expired notification', async () => {
      useAuthStore.setState({
        token: mockToken,
        isAuthenticated: true,
      });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        authenticatedUpload(mockUrl, new FormData())
      ).rejects.toThrow('Session expired');

      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Session Expired' })
      );
      // A 401 is a response, not a network error — it must
      // NOT consume the retry.
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('publicFetch', () => {
    it('attaches the token when one is present', async () => {
      useAuthStore.setState({ token: mockToken });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      vi.stubGlobal('fetch', mockFetch);

      await publicFetch(mockUrl);

      expect(mockFetch).toHaveBeenCalledWith(mockUrl, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${mockToken}`,
        },
      });
    });

    it('returns a 401 response without logging out', async () => {
      useAuthStore.setState({
        token: mockToken,
        isAuthenticated: true,
      });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
      });
      vi.stubGlobal('fetch', mockFetch);

      const response = await publicFetch(mockUrl);

      // Public-read endpoints must never destroy a session on a
      // stray 401 — the response is returned for the caller to
      // interpret, and no logout/notification happens.
      expect(response.status).toBe(401);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().token).toBe(mockToken);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(showNotification).not.toHaveBeenCalled();
    });

    it('retries once on network error', async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        });
      vi.stubGlobal('fetch', mockFetch);

      const response = await publicFetch(mockUrl);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(response.ok).toBe(true);
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when user is authenticated', () => {
      useAuthStore.setState({ isAuthenticated: true });
      expect(isAuthenticated()).toBe(true);
    });

    it('should return false when user is not authenticated', () => {
      useAuthStore.setState({ isAuthenticated: false });
      expect(isAuthenticated()).toBe(false);
    });

    it('reads the auth flag, not token presence', () => {
      // A persisted token alone does not make the session
      // authenticated — checkAuth() flips the flag on load.
      useAuthStore.setState({
        token: mockToken,
        isAuthenticated: false,
      });
      expect(isAuthenticated()).toBe(false);
    });
  });

  describe('getAuthToken', () => {
    it('should return token when it exists', () => {
      useAuthStore.setState({ token: mockToken });
      expect(getAuthToken()).toBe(mockToken);
    });

    it('should return null when no token', () => {
      useAuthStore.setState({ token: null });
      expect(getAuthToken()).toBeNull();
    });
  });
});
