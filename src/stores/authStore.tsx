import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { showNotification } from '@mantine/notifications';
import { API_BASE_URL } from '../config';
import { clearNotesCache } from '../utils/cacheManager';

// The bible store registers itself here from ../store's module
// scope (registerBibleStore below). A static `../store` import
// would evaluate the store while api.tsx's Vitest importOriginal
// is mid-flight — api → apiClient → authStore → store → api —
// binding the store to the real api module and silently breaking
// vi.mock('../api') interception. Keep the dependency one-way.
type BibleStoreRef = { setState: (partial: object) => void };
let bibleStore: BibleStoreRef | null = null;
export const registerBibleStore = (store: BibleStoreRef) => {
  bibleStore = store;
};
const purgeBibleStore = (partial: object) => {
  // May legitimately be unregistered — ../store absent from a
  // bare-auth unit test's module graph — so no-op then.
  bibleStore?.setState(partial);
};

interface User {
  /** Authoritative author identity (comments); absent for
   *  login, whose /api/token/ response carries no user payload
   *  — author matching falls back to the username. */
  id?: number;
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
            body: { ...requestBody, password: '***' },
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
            // Log the status only — the error body may echo
            // submitted credentials.
            console.error(
              '🔐 Login error response status:',
              response.status
            );
            let errorMessage = 'Invalid username or password';

            if (response.status === 400) {
              errorMessage = errorData.non_field_errors?.[0] ||
                errorData.detail ||
                'Invalid credentials. Please ensure you have a ' +
                'valid account with a password set via Django admin.';
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

          // /api/token/ returns only `{ token }` — the as-typed
          // username is the fallback identity; keep the
          // defensive `data.user` read in case the endpoint
          // ever grows a user payload.
          set({
            token: data.token,
            user: {
              ...(typeof data.user?.id === 'number'
                ? { id: data.user.id }
                : {}),
              username: data.user?.username ?? username,
            },
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
          const requestBody: {
            username: string;
            password: string;
            password_confirm: string;
            email?: string;
          } = {
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
            // Log the status only — the error body may echo
            // submitted credentials.
            console.error(
              '🔐 Registration error response status:',
              response.status
            );
            
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
          
          // Registration successful — the response carries a
          // `user` payload, so keep its numeric id for author
          // matching (comments compare ids before usernames).
          set({
            token: data.token,
            user: {
              ...(typeof data.user?.id === 'number'
                ? { id: data.user.id }
                : {}),
              username: data.user?.username ?? username,
            },
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
        // Scrub user-owned data from the persisted bible store
        // so a previous session's private notes, tags and
        // reading positions can't resurface for an anonymous
        // visitor on this device.
        purgeBibleStore({
          notes: [],
          tags: [],
          notesCount: 0,
          notesHasMore: false,
          allNotesFetched: false,
          lastSelectedTagId: null,
          notesPage: 1,
          readingPositions: {},
        });
        clearNotesCache();
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
        if (!token) return;
        // A persisted token may be expired or revoked — checkAuth
        // alone only proves a token exists. Validate it against a
        // cheap authenticated GET; a rejected token must not keep
        // `isAuthenticated` true, or write UI stays reachable and
        // stale private data stays visible.
        fetch(`${API_BASE_URL}/api/v1/tags/`, {
          headers: { Authorization: `Token ${token}` },
        })
          .then((response) => {
            if (
              response.status === 401 ||
              response.status === 403
            ) {
              // The token may have rotated while this
              // ping was in flight — a login/register
              // completed in the meantime, or another
              // 401 handler already logged out. The
              // rejection belongs to the stale token,
              // so the current session must be left
              // alone (and no second toast shown).
              if (get().token !== token) return;
              console.warn(
                'Persisted token rejected ' +
                  `(${response.status}) — logging out`
              );
              get().logout();
              showNotification({
                title: 'Session Expired',
                message:
                  'Your session has expired. Please log in again.',
                color: 'orange',
                autoClose: 5000,
              });
            }
          })
          .catch(() => {
            // Network failure (offline): keep the local session —
            // the next authenticated request re-validates anyway.
          });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      // isAuthenticated is persisted alongside the token so the
      // first render after rehydration already knows the session
      // exists — otherwise pages that load data on the
      // isAuthenticated flip would double-fetch.
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      // isAuthenticated always derives from the token (the same
      // rule checkAuth applies) — this covers blobs written
      // before the field was persisted and keeps the two from
      // ever disagreeing.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AuthState>;
        return {
          ...current,
          ...p,
          isAuthenticated: Boolean(p.token),
        };
      },
    }
  )
);

export const useAuthStore = createAuthStore();

/**
 * Purge private persisted data when the auth token is dropped or
 * replaced — manual logout, the 401 session-expired logout inside
 * authenticatedFetch, or a different account signing in. Cached
 * note pages can hold private notes and tags/readingPositions are
 * account-owned, so none may survive into the next session.
 */
useAuthStore.subscribe((auth, prevAuth) => {
  if (!prevAuth.token || auth.token === prevAuth.token) return;
  clearNotesCache();
  purgeBibleStore({
    notes: [],
    tags: [],
    readingPositions: {},
    notesCount: 0,
    allNotesFetched: false,
    notesHasMore: false,
    notesPage: 1,
    notesOrdering: null,
    lastSelectedTagId: null,
  });
});

// Export the factory function for testing purposes
export { createAuthStore as createTestAuthStore };
