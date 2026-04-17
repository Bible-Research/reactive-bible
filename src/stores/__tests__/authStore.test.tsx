import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderWithAuthStore } from './helpers';
import { useAuthStore } from '../authStore';

describe('authStore', () => {
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

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const { result } = renderWithAuthStore();
      
      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });


  describe('clearError', () => {
    it('should clear error message', () => {
      const { result } = renderWithAuthStore();

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
      const { result } = renderWithAuthStore();

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
      const { result } = renderWithAuthStore();

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
      const { result } = renderWithAuthStore();

      act(() => {
        result.current.checkAuth();
      });

      expect(result.current.isAuthenticated).toBe(false);
    });
  });

});
