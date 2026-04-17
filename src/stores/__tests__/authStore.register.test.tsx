import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderWithAuthStore } from './helpers';
import { useAuthStore } from '../authStore';

describe('authStore - Register', () => {
  const mockToken = 'test-token-123';
  const mockUsername = 'testuser';
  const mockPassword = 'testpass123';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      useAuthStore.setState({
        token: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    });
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

      const { result } = renderWithAuthStore();

      await act(async () => {
        await result.current.register(
          mockUsername,
          mockPassword,
          mockPassword,
          mockEmail
        );
      });

      expect(result.current.token).toBe(mockToken);
      expect(result.current.user).toEqual({ username: mockUsername });
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.error).toBeNull();
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

      const { result } = renderWithAuthStore();

      await act(async () => {
        await result.current.register(
          mockUsername,
          mockPassword,
          mockPassword
        );
      });

      expect(result.current.isAuthenticated).toBe(true);
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

      const { result } = renderWithAuthStore();

      await expect(
        act(async () => {
          await result.current.register(
            mockUsername,
            mockPassword,
            mockPassword
          );
        })
      ).rejects.toThrow('A user with that username already exists.');

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.error).toBe(
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

      const { result } = renderWithAuthStore();

      await expect(
        act(async () => {
          await result.current.register(
            mockUsername,
            'short',
            'short'
          );
        })
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

      const { result } = renderWithAuthStore();

      await expect(
        act(async () => {
          await result.current.register(
            mockUsername,
            mockPassword,
            'differentpassword'
          );
        })
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

      const { result } = renderWithAuthStore();

      await expect(
        act(async () => {
          await result.current.register(
            mockUsername,
            mockPassword,
            mockPassword,
            'invalid-email'
          );
        })
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
              100
            )
          )
      );

      const { result } = renderWithAuthStore();

      const registerPromise = act(async () => {
        await result.current.register(
          mockUsername,
          mockPassword,
          mockPassword
        );
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await registerPromise;

      expect(result.current.isLoading).toBe(false);
    });
  });
});
