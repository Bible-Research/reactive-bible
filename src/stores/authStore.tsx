import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { API_BASE_URL } from '../config';

interface User {
  username: string;
}

export interface AuthState {
  // State
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    password: string,
    passwordConfirm: string,
    email?: string
  ) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  setToken: (token: string, username: string) => void;
  checkAuth: () => void;
}

export const initialState = {
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

const createAuthStore = () => create<AuthState>()(
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
          const requestBody = { username, password };
          console.log('🔐 Login attempt:', { 
            url: `${API_BASE_URL}/api/token/`,
            body: requestBody 
          });
          
          const response = await fetch(`${API_BASE_URL}/api/token/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });
          
          console.log('🔐 Login response status:', response.status);
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('🔐 Login error response:', errorData);
            
            let errorMessage = 'Invalid username or password';
            
            if (response.status === 400) {
              errorMessage = errorData.non_field_errors?.[0] ||
                errorData.detail ||
                'Invalid credentials. Please ensure you have a valid account with a password set via Django admin.';
            } else if (response.status === 401) {
              errorMessage = 'Invalid username or password';
            } else {
              errorMessage = errorData.detail || 
                errorData.non_field_errors?.[0] || 
                'Login failed. Please try again.';
            }
            
            throw new Error(errorMessage);
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
      
      // Register action
      register: async (
        username: string,
        password: string,
        passwordConfirm: string,
        email?: string
      ) => {
        set({ isLoading: true, error: null });
        
        try {
          const requestBody: any = {
            username,
            password,
            password_confirm: passwordConfirm,
          };
          
          if (email) {
            requestBody.email = email;
          }
          
          console.log('🔐 Registration attempt:', {
            url: `${API_BASE_URL}/api/v1/users/register/`,
            body: { ...requestBody, password: '***', password_confirm: '***' },
          });
          
          const response = await fetch(
            `${API_BASE_URL}/api/v1/users/register/`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
            }
          );
          
          console.log('🔐 Registration response status:', response.status);
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('🔐 Registration error response:', errorData);
            
            let errorMessage = 'Registration failed. Please try again.';
            
            if (response.status === 400) {
              // Handle field-specific errors
              if (errorData.username) {
                errorMessage = Array.isArray(errorData.username)
                  ? errorData.username[0]
                  : errorData.username;
              } else if (errorData.password) {
                errorMessage = Array.isArray(errorData.password)
                  ? errorData.password[0]
                  : errorData.password;
              } else if (errorData.password_confirm) {
                errorMessage = Array.isArray(errorData.password_confirm)
                  ? errorData.password_confirm[0]
                  : errorData.password_confirm;
              } else if (errorData.email) {
                errorMessage = Array.isArray(errorData.email)
                  ? errorData.email[0]
                  : errorData.email;
              } else if (errorData.non_field_errors) {
                errorMessage = Array.isArray(errorData.non_field_errors)
                  ? errorData.non_field_errors[0]
                  : errorData.non_field_errors;
              } else if (errorData.detail) {
                errorMessage = errorData.detail;
              }
            } else {
              errorMessage = errorData.detail || errorMessage;
            }
            
            throw new Error(errorMessage);
          }
          
          const data = await response.json();
          
          // Registration successful, set token and user
          set({
            token: data.token,
            user: { username: data.user.username },
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const errorMessage = error instanceof Error
            ? error.message
            : 'Registration failed. Please try again.';
          
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

export const useAuthStore = createAuthStore();

// Export the factory function for testing purposes
export { createAuthStore as createTestAuthStore };
