import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuthStore } from '../authStore';

describe('authStore', () => {
  const mockToken = 'test-token-123';
  const mockUsername = 'testuser';
  const mockPassword = 'testpass123';

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();
    
    // Get the initial state from the store
    const initialState = useAuthStore.getState();
    
    // Reset store to initial state with all actions
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useAuthStore());
      
      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      // Mock successful API response
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: mockToken }),
      });

      const { result } = renderHook(() => useAuthStore());

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

      const { result } = renderHook(() => useAuthStore());

      const loginPromise = act(async () => {
        await result.current.login(mockUsername, mockPassword);
      });

      // Check loading state immediately
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

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => errorResponse,
      });

      const { result } = renderHook(() => useAuthStore());

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
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useAuthStore());

      await expect(
        act(async () => {
          await result.current.login(mockUsername, mockPassword);
        })
      ).rejects.toThrow('Invalid username or password');

      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() => useAuthStore());

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

      const { result } = renderHook(() => useAuthStore());

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

      const { result } = renderHook(() => useAuthStore());

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

      const { result } = renderHook(() => useAuthStore());

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

      const { result } = renderHook(() => useAuthStore());

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

      const { result } = renderHook(() => useAuthStore());

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

      const { result } = renderHook(() => useAuthStore());

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

      const { result } = renderHook(() => useAuthStore());

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

      const { result } = renderHook(() => useAuthStore());

      const registerPromise = act(async () => {
        await result.current.register(
          mockUsername,
          mockPassword,
          mockPassword
        );
      });

      // Should be loading
      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await registerPromise;

      // Should not be loading after completion
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('logout', () => {
    it('should clear auth state on logout', () => {
      const { result } = renderHook(() => useAuthStore());

      // Set authenticated state
      act(() => {
        useAuthStore.setState({
          token: mockToken,
          user: { username: mockUsername },
          isAuthenticated: true,
        });
      });

      expect(result.current.isAuthenticated).toBe(true);

      // Logout
      act(() => {
        result.current.logout();
      });

      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('clearError', () => {
    it('should clear error message', () => {
      const { result } = renderHook(() => useAuthStore());

      // Set error
      act(() => {
        useAuthStore.setState({ error: 'Test error' });
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
      const { result } = renderHook(() => useAuthStore());

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
      const { result } = renderHook(() => useAuthStore());

      // Set token
      act(() => {
        useAuthStore.setState({ token: mockToken });
      });

      // Check auth
      act(() => {
        result.current.checkAuth();
      });

      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should set isAuthenticated to false if no token', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.checkAuth();
      });

      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('Persistence', () => {
    it('should persist token and user to localStorage', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: mockToken }),
      });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.login(mockUsername, mockPassword);
      });

      // Check localStorage
      const stored = localStorage.getItem('auth-storage');
      expect(stored).toBeTruthy();
      
      const parsed = JSON.parse(stored!);
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

      // Create new hook instance
      const { result } = renderHook(() => useAuthStore());

      expect(result.current.token).toBe(mockToken);
      expect(result.current.user).toEqual({ username: mockUsername });
    });
  });
});
