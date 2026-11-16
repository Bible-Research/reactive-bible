/**
 * Typed API errors and the backend error-body parsers shared
 * by the provider-facing calls. Backend failures carry
 * `error`/`error_code`/`detail` fields; the helpers below map
 * them onto RateLimitError / ClientInputError /
 * ProviderError / BookNotInFilesetError so callers can
 * branch on the failure kind instead of string-matching
 * messages.
 */

/**
 * The backend's `error_code` when one was reported — kept on
 * the thrown error so UI layers can map it to a localized
 * catalog key instead of rendering raw provider text.
 */
interface CodedError extends Error {
  errorCode?: string;
}

export class ConflictError extends Error {
  errorCode?: string;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends Error {
  errorCode?: string;
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * The API rejected the request itself — a `missing_parameter`
 * or `invalid_parameter` error_code, or any other coded HTTP
 * 400 body. Deliberately extends `Error`, NOT `ProviderError`:
 * `instanceof ProviderError` checks (e.g. PassageView's
 * provider-failure branch) would render the upstream-failure
 * UI and disguise our own bad request as a provider outage.
 * It is likewise left out of `sentryBeforeSend`'s drop list —
 * a client-input failure is a bug worth reporting.
 */
export class ClientInputError extends Error {
  errorCode?: string;
  constructor(message: string) {
    super(message);
    this.name = 'ClientInputError';
  }
}

export class ProviderError extends Error {
  errorCode?: string;
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * SWORD-fileset search is off: the backend's `sword_search`
 * feature flag rejected the request with HTTP 403 +
 * `error_code === 'search_disabled'`. Not an outage — the UI
 * shows a supportive translated message instead of an error.
 */
export class SearchDisabledError extends ProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'SearchDisabledError';
  }
}

/**
 * The requested book is not covered by the selected fileset.
 * Thrown when the backend reports
 * `error_code === 'book_not_in_fileset'` (HTTP 404), or — for
 * backwards compatibility — when an audio response arrives as
 * HTTP 200 with empty verses/a `message` and no `audio_url`.
 * Callers walk `resolveAudioFileset` alternates on this error.
 */
export class BookNotInFilesetError extends ProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'BookNotInFilesetError';
  }
}

/**
 * Reads the backend `error_code` off a thrown error, when one
 * was attached by `throwFromErrorBody`/`throwAudioError`.
 */
export const errorCodeOf = (
  err: unknown
): string | undefined =>
  err instanceof Error
    ? (err as CodedError).errorCode
    : undefined;

/** Error fields a backend/provider response body can carry. */
interface ErrorBody {
  error?: unknown;
  error_code?: unknown;
  detail?: unknown;
}

export const isBookNotInFilesetBody = (
  body: { error_code?: unknown } | null | undefined,
): boolean => body?.error_code === 'book_not_in_fileset';

const RATE_LIMIT_PATTERN =
  /\b429\b|too many requests|rate.?limit/i;

export const isRateLimitMessage = (
  message: string
): boolean => RATE_LIMIT_PATTERN.test(message);

/**
 * Best-effort displayable message out of a backend error body:
 * a string `error`, an object `error`'s string `message`, or a
 * string `detail` — else `fallback`.
 *
 * Deliberate deviation from the pre-split api.tsx: truthy
 * non-string payloads are ignored instead of being fed through
 * the thrown Error's implicit string coercion. The old
 * `errorData.error || errorData.detail || fallback` turned
 * `{error: {message: 'x'}}` into "[object Object]" and let a
 * bare `{error: 429}` false-positive the rate-limit check;
 * here only string-shaped payloads produce a message (pinned
 * by errors.test.ts).
 */
export const errorMessageFromBody = (
  body: ErrorBody | null | undefined,
  fallback: string
): string => {
  const error = body?.error;
  if (typeof error === 'string' && error) {
    return error;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message
  ) {
    return error.message;
  }
  const detail = body?.detail;
  if (typeof detail === 'string' && detail) {
    return detail;
  }
  return fallback;
};

/**
 * Parse the body of a failed provider response
 * (`!response.ok`) and throw the matching typed error:
 * BookNotInFilesetError for `book_not_in_fileset`,
 * SearchDisabledError for `search_disabled`,
 * RateLimitError for a `rate_limited` code or a
 * rate-limit-shaped message, ClientInputError for
 * `missing_parameter`/`invalid_parameter` or any other coded
 * HTTP 400 body, ProviderError for any other coded failure,
 * and a plain Error otherwise. The client-input check sits
 * after rate-limiting so a hypothetical rate-limit-shaped 400
 * keeps the established RateLimitError semantics.
 * `fallbacks` supply the message when the body carries none.
 */
export const throwFromErrorBody = async (
  response: Response,
  fallbacks: { bookNotInFileset: string; failure: string }
): Promise<never> => {
  const body = (await response.json().catch(() => ({}))) as
    ErrorBody;
  const code =
    typeof body.error_code === 'string'
      ? body.error_code
      : undefined;
  const attach = <T extends Error>(err: T): T => {
    (err as CodedError).errorCode = code;
    return err;
  };
  if (isBookNotInFilesetBody(body)) {
    throw attach(
      new BookNotInFilesetError(
        errorMessageFromBody(body, fallbacks.bookNotInFileset)
      )
    );
  }
  const message = errorMessageFromBody(body, fallbacks.failure);
  if (body.error_code === 'search_disabled') {
    throw attach(new SearchDisabledError(message));
  }
  if (
    body.error_code === 'rate_limited' ||
    isRateLimitMessage(message)
  ) {
    throw attach(new RateLimitError(message));
  }
  if (
    body.error_code === 'missing_parameter' ||
    body.error_code === 'invalid_parameter' ||
    (body.error_code && response.status === 400)
  ) {
    throw attach(new ClientInputError(message));
  }
  if (body.error_code) {
    throw attach(new ProviderError(message));
  }
  throw new Error(message);
};
