import { renderHook } from '@testing-library/react';
import { createAuthStore } from '../authStore';

// Custom hook renderer that creates a fresh store for each test
export const renderWithAuthStore = () => {
  const useTestStore = createAuthStore();
  return renderHook(() => useTestStore());
};
