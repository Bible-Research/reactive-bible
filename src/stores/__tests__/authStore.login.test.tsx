import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { createTestAuthStore } from '../authStore';

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

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const useTestAuthStore = createTestAuthStore();
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: mockToken }),
      });

      const { result } = renderHook(() => useTestAuthStore());

      await act(async () => {
        await result.current.login(mockUsername, mockPassword);
      });

      expect(result.current.token).toBe(mockToken);
      expect(result.current.user).toEqual({ username: mockUsername });
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
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
              100
            )
          )
      );

      const { result } = renderHook(() => useTestAuthStore());

      const loginPromise = act(async () => {
        await result.current.login(mockUsername, mockPassword);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await loginPromise;

      expect(result.current.isLoading).toBe(false);
    });

    it('should handle 400 error (invalid credentials)', async () => {
      const errorResponse = {
        non_field_errors: ['Unable to log in with provided credentials.'],
      };

      const useTestAuthStore = createTestAuthStore();
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => errorResponse,
      });

      const { result } = renderHook(() => useTestAuthStore());

      await expect(
        act(async () => {
          await result.current.login(mockUsername, mockPassword);
        })
      ).rejects.toThrow();

      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.error).toContain('credentials');
    });

    it('should handle 401 error', async () => {
      const useTestAuthStore = createTestAuthStore();
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useTestAuthStore());

      await expect(
        act(async () => {
          await result.current.login(mockUsername, mockPassword);
        })
      ).rejects.toThrow('Invalid username or password');

      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should handle network errors', async () => {
      const useTestAuthStore = createTestAuthStore();
      global.fetch = vi.fn().mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() => useTestAuthStore());

      await expect(
        act(async () => {
          await result.current.login(mockUsername, mockPassword);
        })
      ).rejects.toThrow('Network error');

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.error).toBe('Network error');
    });

    it('should send correct request format', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: mockToken }),
      });
      global.fetch = mockFetch;

      const useTestAuthStore = createTestAuthStore();
      const { result } = renderHook(() => useTestAuthStore());

      await act(async () => {
        await result.current.login(mockUsername, mockPassword);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://bibleresearchapi.vercel.app/api/token/',
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
