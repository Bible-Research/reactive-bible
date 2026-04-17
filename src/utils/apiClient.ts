import { useAuthStore } from '../stores/authStore';
import { showNotification } from '@mantine/notifications';

/**
 * Helper function to get authentication headers
 * Returns headers with Authorization token if user is authenticated
 */
const getAuthHeaders = (): HeadersInit => {
  const token = useAuthStore.getState().token;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    // Django REST Framework uses "Token" prefix, not "Bearer"
    headers['Authorization'] = `Token ${token}`;
  }
  
  return headers;
};

/**
 * Public fetch wrapper
 * Sends the auth token if one is present but never logs the user out on
 * 401. Use for public-read endpoints (notes/tags list, detail, single
 * note share page) where a stray 401 should never destroy an existing
 * session.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param retries - Number of retries for network errors (default: 1)
 */
export const publicFetch = async (
  url: string,
  options: RequestInit = {},
  retries = 1
): Promise<Response> => {
  const headers = getAuthHeaders();

  try {
    return await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });
  } catch (error) {
    if (retries > 0 && error instanceof TypeError) {
      console.warn('Network error (publicFetch), retrying...', error);
      return publicFetch(url, options, retries - 1);
    }
    throw error;
  }
};

/**
 * Authenticated fetch wrapper
 * Automatically adds auth token to requests and handles 401 responses
 * 
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param retries - Number of retries for network errors (default: 1)
 * @returns Promise<Response>
 */
export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {},
  retries = 1
): Promise<Response> => {
  const headers = getAuthHeaders();
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });
    
    // Handle 401 Unauthorized - token expired or invalid
    if (response.status === 401) {
      console.warn('401 Unauthorized - logging out user');
      useAuthStore.getState().logout();
      
      // Show notification to user
      showNotification({
        title: 'Session Expired',
        message: 'Your session has expired. Please log in again.',
        color: 'orange',
        autoClose: 5000,
      });
      
      throw new Error('Session expired. Please log in again.');
    }
    
    // Handle 403 Forbidden - insufficient permissions
    if (response.status === 403) {
      throw new Error(
        'You do not have permission to access this resource.'
      );
    }
    
    return response;
  } catch (error) {
    // Retry once on network errors
    if (retries > 0 && error instanceof TypeError) {
      console.warn('Network error, retrying...', error);
      return authenticatedFetch(url, options, retries - 1);
    }
    throw error;
  }
};

/**
 * Helper to check if user is authenticated
 * @returns boolean
 */
export const isAuthenticated = (): boolean => {
  return useAuthStore.getState().isAuthenticated;
};

/**
 * Helper to get current auth token
 * @returns string | null
 */
export const getAuthToken = (): string | null => {
  return useAuthStore.getState().token;
};
