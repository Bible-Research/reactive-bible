import { renderHook, RenderHookResult } from '@testing-library/react';
import { useAuthStore, AuthState } from '../authStore';

// Custom hook renderer that uses the singleton store and cleans up properly
export const renderWithAuthStore = (): RenderHookResult<AuthState, unknown> => {
  // Reset store to initial state before rendering
  useAuthStore.setState({
    token: null,
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  });
  
  return renderHook(() => useAuthStore());
};
