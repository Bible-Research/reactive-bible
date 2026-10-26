import type { ErrorEvent, EventHint } from '@sentry/react';
import {
  BookNotInFilesetError,
  RateLimitError,
} from '../api/errors';

/**
 * `beforeSend` filter for `Sentry.init`. Drops the app's
 * expected/handled failure taxonomy so routine conditions do
 * not burn event quota:
 *
 * - RateLimitError / BookNotInFilesetError: provider states the
 *   UI already handles (throttling notice, fileset alternates).
 * - AbortError: routine fetch cancellation (navigation races,
 *   superseded searches) — filtered upstream in errorReporter,
 *   but kept here as belt-and-suspenders.
 * - 'Session expired': authenticatedFetch already logs the user
 *   out and shows the session-expired notification.
 */
export function sentryBeforeSend(
  event: ErrorEvent,
  hint: EventHint
): ErrorEvent | null {
  const err = hint.originalException;
  if (
    err instanceof RateLimitError ||
    err instanceof BookNotInFilesetError ||
    (err instanceof Error && err.name === 'AbortError') ||
    (err instanceof Error &&
      err.message.startsWith('Session expired'))
  ) {
    return null;
  }
  return event;
}
