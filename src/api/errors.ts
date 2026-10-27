/**
 * Typed API errors and the backend error-body parsers shared
 * by the provider-facing calls. Backend failures carry
 * `error`/`error_code`/`detail` fields; the helpers below map
 * them onto RateLimitError / ClientInputError /
 * ProviderError / BookNotInFilesetError so callers can
 * branch on the failure kind instead of string-matching
 * messages.
 */

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends Error {
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
  constructor(message: string) {
    super(message);
    this.name = 'ClientInputError';
  }
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
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
  if (isBookNotInFilesetBody(body)) {
    throw new BookNotInFilesetError(
      errorMessageFromBody(body, fallbacks.bookNotInFileset)
    );
  }
  const message = errorMessageFromBody(body, fallbacks.failure);
  if (
    body.error_code === 'rate_limited' ||
    isRateLimitMessage(message)
  ) {
    throw new RateLimitError(message);
  }
  if (
    body.error_code === 'missing_parameter' ||
    body.error_code === 'invalid_parameter' ||
    (body.error_code && response.status === 400)
  ) {
    throw new ClientInputError(message);
  }
  if (body.error_code) {
    throw new ProviderError(message);
  }
  throw new Error(message);
};
