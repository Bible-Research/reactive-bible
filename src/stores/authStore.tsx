import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface User {
  username: string;
}

interface AuthState {
  // State
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  setToken: (token: string, username: string) => void;
  checkAuth: () => void;
}

const API_BASE_URL = 'https://bibleresearchapi.vercel.app';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      
      // Login action
      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await fetch(`${API_BASE_URL}/api/token/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
          });
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
              errorData.detail || 
              errorData.non_field_errors?.[0] || 
              'Invalid username or password'
            );
          }
          
          const data = await response.json();
          
          set({
            token: data.token,
            user: { username },
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const errorMessage = error instanceof Error 
            ? error.message 
            : 'Login failed. Please try again.';
          
          set({
            error: errorMessage,
            isLoading: false,
            isAuthenticated: false,
            token: null,
            user: null,
          });
          
          throw error;
        }
      },
      
      // Logout action
      logout: () => {
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          error: null,
        });
      },
      
      // Clear error
      clearError: () => {
        set({ error: null });
      },
      
      // Set token manually (for testing or external auth)
      setToken: (token: string, username: string) => {
        set({
          token,
          user: { username },
          isAuthenticated: true,
          error: null,
        });
      },
      
      // Check if user is authenticated (on app load)
      checkAuth: () => {
        const { token } = get();
        set({ isAuthenticated: !!token });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
    }
  )
);
