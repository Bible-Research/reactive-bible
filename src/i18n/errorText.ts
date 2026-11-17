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
  SearchDisabledError,
  errorCodeOf,
} from '../api/errors';

/** Backend `error_code` values with a catalog mapping. */
const CODED_KEYS = {
  rate_limited: 'errors.rate_limited',
  book_not_in_fileset: 'errors.book_not_in_fileset',
  search_disabled: 'errors.search_disabled',
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
  if (code) {
    // Any coded backend failure resolves to a catalog string —
    // an unmapped code (e.g. missing_parameter on a
    // ClientInputError) must not leak raw provider text.
    return code in CODED_KEYS
      ? i18n.t(CODED_KEYS[code as ErrorCode])
      : i18n.t('errors.generic');
  }
  if (err instanceof RateLimitError) {
    return i18n.t('errors.rate_limited');
  }
  if (err instanceof BookNotInFilesetError) {
    return i18n.t('errors.book_not_in_fileset');
  }
  if (err instanceof SearchDisabledError) {
    return i18n.t('errors.search_disabled');
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
 * Localized text for an `error_code` stored on a resource
 * (e.g. `note.error_code`) rather than attached to a thrown
 * error — same mapping as `localizedErrorText`: a cataloged
 * code resolves to its `errors.*` text, any other code to the
 * generic message (coded failures never leak raw provider
 * text). Returns undefined when the resource carries no code
 * so the caller keeps its raw-text fallback.
 */
export const localizedErrorCode = (
  code: string | undefined
): string | undefined => {
  if (!code) return undefined;
  return code in CODED_KEYS
    ? i18n.t(CODED_KEYS[code as ErrorCode])
    : i18n.t('errors.generic');
};

/**
 * Stored-error renderer: stores keep catalog keys (e.g.
 * `auth.loginFailed`) while backend field errors arrive as raw
 * text. Keys are translated; anything else passes through
 * unchanged.
 */
export const textOrKey = (value: string): string => {
  if (!i18n.exists(value)) return value;
  // `exists` is true for section keys too — a stored string
  // equal to a section name would resolve to an object and
  // crash the React render. Only leaf (string) results are
  // translations.
  const resolved: unknown = (
    i18n.t as (key: string) => unknown
  )(value);
  return typeof resolved === 'string' ? resolved : value;
};
