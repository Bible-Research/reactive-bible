import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  authenticatedFetch,
  publicFetch,
  isAuthenticated,
  getAuthToken,
} from '../apiClient';
import { useAuthStore } from '../../stores/authStore';

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
  });

  describe('authenticatedFetch', () => {
    it('should add Authorization header when token exists', async () => {
      useAuthStore.setState({ token: mockToken });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      });
      global.fetch = mockFetch;

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
      global.fetch = mockFetch;

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
      global.fetch = mockFetch;

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
      global.fetch = mockFetch;

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

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(authenticatedFetch(mockUrl)).rejects.toThrow(
        'Session expired'
      );

      // Should have logged out
      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('does not log out or toast on a 401 when no token ' +
      'was attached', async () => {
      // Anonymous reads that happen to go through
      // authenticatedFetch must not flash a spurious
      // "Session Expired" — there was no session.
      const { showNotification } = await import(
        '@mantine/notifications'
      );
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(authenticatedFetch(mockUrl))
        .rejects.toThrow('Authentication required');
      expect(showNotification).not.toHaveBeenCalled();
      expect(
        useAuthStore.getState().isAuthenticated
      ).toBe(false);
    });

    it('should handle 403 response with permission error', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

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
      global.fetch = mockFetch;

      const response = await authenticatedFetch(mockUrl);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(response.ok).toBe(true);
    });

    it('should NOT retry network errors on non-idempotent ' +
      'methods (a lost-response POST could double-create)',
      async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValue(new TypeError('Network error'));
      global.fetch = mockFetch;

      await expect(
        authenticatedFetch(mockUrl, {
          method: 'POST',
          body: '{}',
        })
      ).rejects.toThrow('Network error');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry on non-network errors', async () => {
      const mockFetch = vi.fn().mockRejectedValueOnce(
        new Error('Not a network error')
      );
      global.fetch = mockFetch;

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
      global.fetch = mockFetch;

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

  describe('publicFetch', () => {
    it('retries a 401 once without the Authorization header — ' +
      'a dead token must not poison public reads', async () => {
      useAuthStore.setState({
        token: 'dead-token',
        isAuthenticated: true,
      });

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({ ok: true, status: 200 });
      global.fetch = mockFetch;

      const response = await publicFetch(mockUrl);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][1].headers['Authorization'])
        .toBe('Token dead-token');
      expect(mockFetch.mock.calls[1][1].headers['Authorization'])
        .toBeUndefined();
      expect(response.ok).toBe(true);
      // The session is deliberately kept — publicFetch never
      // destroys it.
      expect(useAuthStore.getState().token).toBe('dead-token');
    });

    it('returns a bare 401 without retry when no token was ' +
      'attached', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 401 });
      global.fetch = mockFetch;

      const response = await publicFetch(mockUrl);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(401);
    });

    it('does not log out on 401', async () => {
      useAuthStore.setState({
        token: 'dead-token',
        isAuthenticated: true,
      });
      const { showNotification } = await import(
        '@mantine/notifications'
      );

      global.fetch = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 401 });

      await publicFetch(mockUrl);

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(showNotification).not.toHaveBeenCalled();
    });

    it('retries network errors on GET but not POST', async () => {
      const getFetch = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('boom'))
        .mockResolvedValueOnce({ ok: true, status: 200 });
      global.fetch = getFetch;
      await publicFetch(mockUrl);
      expect(getFetch).toHaveBeenCalledTimes(2);

      const postFetch = vi
        .fn()
        .mockRejectedValue(new TypeError('boom'));
      global.fetch = postFetch;
      await expect(
        publicFetch(mockUrl, { method: 'POST', body: '{}' })
      ).rejects.toThrow('boom');
      expect(postFetch).toHaveBeenCalledTimes(1);
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
