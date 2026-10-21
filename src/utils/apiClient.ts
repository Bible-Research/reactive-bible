import { useAuthStore } from '../stores/authStore';
import { showNotification } from '@mantine/notifications';

/**
 * Helper function to get authentication headers
 * Returns headers with Authorization token if user is authenticated
 */
const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = useAuthStore.getState().token;
  if (token) {
    // Django REST Framework uses "Token" prefix, not "Bearer"
    headers['Authorization'] = `Token ${token}`;
  }

  return headers;
};

/**
 * Methods that are safe to replay automatically: they carry no
 * side effects, so re-sending after a network failure cannot
 * double-submit. A TypeError (network failure) on POST/PUT/
 * PATCH/DELETE must surface to the caller instead of silently
 * retrying.
 */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const isIdempotent = (options: RequestInit): boolean =>
  IDEMPOTENT_METHODS.has((options.method ?? 'GET').toUpperCase());

/**
 * Shared request core for the fetch wrappers: performs the
 * fetch with merged base + caller headers and, while `retries`
 * remain, retries network failures (TypeError) for idempotent
 * methods only.
 */
const sendRequest = async (
  url: string,
  options: RequestInit,
  headers: HeadersInit,
  retries: number,
  label: string
): Promise<Response> => {
  try {
    return await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });
  } catch (error) {
    if (
      retries > 0 &&
      error instanceof TypeError &&
      isIdempotent(options)
    ) {
      console.warn(`Network error (${label}), retrying...`, error);
      return sendRequest(url, options, headers, retries - 1, label);
    }
    throw error;
  }
};

/**
 * Shared 401 handling for the authenticated wrappers. The
 * token may have rotated while the request was in flight — a
 * login/register completed, or checkAuth replaced it. That 401
 * belongs to the stale token, so the current session is left
 * alone (no logout, no toast); mirror the guard in checkAuth.
 * Otherwise the session is expired: log out, toast once, throw.
 */
const expireSession = (issuedToken: string | null): never => {
  if (useAuthStore.getState().token !== issuedToken) {
    throw new Error('Session expired. Please log in again.');
  }
  // Another in-flight request (or checkAuth's token
  // validation) may have already expired this session —
  // only toast on the first logout.
  const wasAuthenticated =
    useAuthStore.getState().isAuthenticated;
  console.warn('401 Unauthorized - logging out user');
  useAuthStore.getState().logout();

  if (wasAuthenticated) {
    showNotification({
      title: 'Session Expired',
      message:
        'Your session has expired. Please log in again.',
      color: 'orange',
      autoClose: 5000,
    });
  }

  throw new Error('Session expired. Please log in again.');
};

/**
 * Shared 403 handling for the authenticated wrappers.
 */
const throwForbidden = (): never => {
  throw new Error(
    'You do not have permission to access this resource.'
  );
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
 * anonymous. If the request carried a token and still returns
 * 401, it is retried once without the Authorization header —
 * a bad token must not break public content.
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
  const response = await sendRequest(
    url, options, headers, retries, 'publicFetch'
  );

  // A dead token poisons even public reads — retry once
  // anonymously. The token is deliberately kept: publicFetch
  // must never destroy the session (that is
  // authenticatedFetch's job).
  if (response.status === 401 && headers['Authorization']) {
    console.warn(
      '401 with token on public endpoint — ' +
        'retrying without credentials'
    );
    const anonymousHeaders = { ...headers };
    delete anonymousHeaders['Authorization'];
    // Single retry: the anonymous response is returned
    // as-is, whether it succeeds or is another 401.
    return sendRequest(
      url, options, anonymousHeaders, retries, 'publicFetch'
    );
  }

  return response;
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
  // Capture the token this request is issued with so a stale
  // 401 can't wipe a session that rotated in the meantime.
  const issuedToken = useAuthStore.getState().token;
  const headers = getAuthHeaders();
  const response = await sendRequest(
    url,
    options,
    headers,
    retries,
    'authenticatedFetch'
  );

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
    expireSession(issuedToken);
  }

  // Handle 403 Forbidden - insufficient permissions
  if (response.status === 403) {
    throwForbidden();
  }

  return response;
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
  const issuedToken = useAuthStore.getState().token;
  const headers: Record<string, string> = {};
  if (issuedToken) {
    headers['Authorization'] = `Token ${issuedToken}`;
  }

  const response = await sendRequest(
    url,
    { method: 'POST', body: formData },
    headers,
    0,
    'authenticatedUpload'
  );

  // Same rule as authenticatedFetch: a 401 only ends the
  // session when this request actually attached the token.
  if (response.status === 401) {
    // An anonymous 401 means "login required", not a dead
    // session — there is nothing to log out.
    if (!issuedToken) {
      throw new Error(
        'Authentication required for this request.'
      );
    }
    expireSession(issuedToken);
  }

  if (response.status === 403) {
    throwForbidden();
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
