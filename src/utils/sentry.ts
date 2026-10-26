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
    // Real aborts surface as DOMExceptions, which are not
    // Error subclasses — check both.
    ((err instanceof Error || err instanceof DOMException) &&
      err.name === 'AbortError') ||
    (err instanceof Error &&
      err.message.startsWith('Session expired'))
  ) {
    return null;
  }
  // Sentry's GlobalHandlers integration captures unhandled
  // rejections before this app's tagged captureException —
  // which Dedupe then drops, taking the `context` tag with
  // it. Re-apply the tag on the surviving event.
  const mechanism =
    event.exception?.values?.[0]?.mechanism?.type;
  if (
    mechanism === 'onunhandledrejection' &&
    event.tags?.context === undefined
  ) {
    event.tags = {
      ...event.tags,
      context: 'Unhandled promise rejection',
    };
  }
  return event;
}
