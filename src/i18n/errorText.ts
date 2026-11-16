/**
 * Maps thrown API errors to localized notification text.
 * Coded backend failures (`error_code`) resolve to
 * `errors.<error_code>` catalog keys — raw provider
 * `error`/`message` text is never shown for them. Uncoded
 * failures fall back to their own message (the pre-i18n
 * behavior) or a generic key.
 */
import i18n from './index';
import {
  BookNotInFilesetError,
  ProviderError,
  RateLimitError,
  errorCodeOf,
} from '../api/errors';

/** Backend `error_code` values with a catalog mapping. */
const CODED_KEYS = {
  rate_limited: 'errors.rate_limited',
  book_not_in_fileset: 'errors.book_not_in_fileset',
  not_found: 'errors.not_found',
  provider_error: 'errors.provider_error',
  internal_error: 'errors.internal_error',
} as const;

type ErrorCode = keyof typeof CODED_KEYS;

/**
 * Localized, user-displayable text for a thrown API error.
 * Typed provider errors keep working even without an attached
 * code (e.g. a hand-thrown RateLimitError).
 */
export const localizedErrorText = (err: unknown): string => {
  const code = errorCodeOf(err);
  if (code && code in CODED_KEYS) {
    return i18n.t(CODED_KEYS[code as ErrorCode]);
  }
  if (err instanceof RateLimitError) {
    return i18n.t('errors.rate_limited');
  }
  if (err instanceof BookNotInFilesetError) {
    return i18n.t('errors.book_not_in_fileset');
  }
  if (err instanceof ProviderError) {
    return i18n.t('errors.provider_error');
  }
  if (err instanceof Error && err.message) {
    // Callers may throw catalog keys (e.g. apiClient's
    // 'auth.sessionExpiredMsg') — translate those, pass raw
    // messages through unchanged.
    return textOrKey(err.message);
  }
  return i18n.t('errors.generic');
};

/**
 * Stored-error renderer: stores keep catalog keys (e.g.
 * `auth.loginFailed`) while backend field errors arrive as raw
 * text. Keys are translated; anything else passes through
 * unchanged.
 */
export const textOrKey = (value: string): string =>
  i18n.exists(value)
    ? (i18n.t as (key: string) => string)(value)
    : value;
