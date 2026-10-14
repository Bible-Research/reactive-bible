import { useAuthStore } from '../stores/authStore';
import { showNotification } from '@mantine/notifications';

/**
 * Helper function to get authentication headers
 * Returns headers with Authorization token if user is authenticated
 */
const getAuthHeaders = (): Record<string, string> => {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    // Django REST Framework uses "Token" prefix, not "Bearer"
    headers['Authorization'] = `Token ${token}`;
  }

  return headers;
};

/**
 * Network-error retries are only safe for idempotent reads: a
 * TypeError can mean the request reached the server but the
 * response was lost, so retrying a POST/PATCH/DELETE could
 * double-create notes, tags, or comments.
 */
const isIdempotentRequest = (options: RequestInit): boolean => {
  const method = (options.method ?? 'GET').toUpperCase();
  return method === 'GET' || method === 'HEAD';
};

/**
 * Public fetch wrapper
 * Sends the auth token if one is present but never logs the user out on
 * 401. Use for public-read endpoints (notes/tags list, detail, single
 * note share page) where a stray 401 should never destroy an existing
 * session.
 *
 * DRF runs authentication before permission checks, so an expired
 * token makes even `AllowAny` endpoints return 401 — worse than
 * anonymous. On a 401 with a token attached, the request is
 * retried once without the Authorization header so public reads
 * degrade to anonymous instead of breaking.
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
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string> | undefined),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // A dead token poisons even public reads — retry once
    // anonymously. The token is deliberately kept: publicFetch
    // must never destroy the session (that is
    // authenticatedFetch's job).
    if (response.status === 401 && headers['Authorization']) {
      console.warn(
        '401 with token on public endpoint - retrying ' +
        'anonymously'
      );
      const anonHeaders = { ...headers };
      delete anonHeaders['Authorization'];
      return await fetch(url, { ...options, headers: anonHeaders });
    }

    return response;
  } catch (error) {
    if (
      retries > 0 &&
      error instanceof TypeError &&
      isIdempotentRequest(options)
    ) {
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
    
    // Handle 401 Unauthorized - token expired or invalid. Only
    // destroy the session when this request actually carried the
    // token — an anonymous 401 (e.g. an auth-only endpoint hit
    // on a public page) means "login required", not "your
    // session expired", and must not log anyone out.
    if (response.status === 401) {
      if (!headers['Authorization']) {
        throw new Error(
          'Authentication required for this request.'
        );
      }
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
    // Retry once on network errors, but only for idempotent
    // reads — a lost-response POST could double-create.
    if (
      retries > 0 &&
      error instanceof TypeError &&
      isIdempotentRequest(options)
    ) {
      console.warn('Network error, retrying...', error);
      return authenticatedFetch(url, options, retries - 1);
    }
    throw error;
  }
};

/**
 * Authenticated multipart upload.
 * Sets only the Authorization header; lets the browser generate
 * the multipart Content-Type with its boundary.
 * Mirrors authenticatedFetch's 401 (logout + notification) and
 * 403 (throw permission error) handling. There is no network-error
 * retry: an upload is a non-idempotent POST, and retrying a
 * lost-response request could double-upload the file.
 */
export const authenticatedUpload = async (
  url: string,
  formData: FormData,
): Promise<Response> => {
  const token = useAuthStore.getState().token;
  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Token ${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  // Same rule as authenticatedFetch: a 401 only ends the
  // session when this request actually attached the token.
  if (response.status === 401) {
    if (!token) {
      throw new Error(
        'Authentication required for this request.'
      );
    }
    console.warn('401 Unauthorized - logging out user');
    useAuthStore.getState().logout();
    showNotification({
      title: 'Session Expired',
      message: 'Your session has expired. Please log in again.',
      color: 'orange',
      autoClose: 5000,
    });
    throw new Error('Session expired. Please log in again.');
  }

  if (response.status === 403) {
    throw new Error(
      'You do not have permission to access this resource.',
    );
  }

  return response;
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
