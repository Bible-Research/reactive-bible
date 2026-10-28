import type { ErrorEvent, EventHint } from '@sentry/react';
import {
  BookNotInFilesetError,
  RateLimitError,
} from '../api/errors';

// Stale tabs fire these after a deploy when hashed-asset URLs
// disappear; the resource-load warning already records the
// missing asset, so the exceptions are redundant noise. The
// dynamic-import strings are the browser-specific stale-chunk
// errors: Chrome 'Failed to fetch dynamically imported
// module', Firefox 'error loading dynamically imported
// module', Safari 'Importing a module script failed'.
const CHUNK_LOAD_PATTERN = new RegExp(
  [
    'Loading chunk \\d+ failed',
    'Loading CSS chunk',
    'dynamically imported module',
    'module script failed',
  ].join('|')
);

// Benign browser noise — a ResizeObserver that couldn't
// deliver within one frame, not an app failure.
const RESIZE_OBSERVER_PATTERN = /ResizeObserver loop/;

// Network failures are tagged, not dropped, so Sentry-side
// rules can route them without losing the availability signal.
const isNetworkFailure = (err: TypeError): boolean =>
  err.message === 'Failed to fetch' ||
  err.message === 'Load failed' ||
  err.message.startsWith('NetworkError');

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
 * - ChunkLoadError / 'Loading chunk N failed' / 'Loading CSS
 *   chunk' / the Chrome, Firefox and Safari dynamic-import
 *   failure strings: stale tabs fetching deleted hashed
 *   assets after a deploy — the resource-load warning is the
 *   durable record.
 * - 'ResizeObserver loop': benign browser noise.
 *
 * The message-based drops ('Session expired', chunk-load,
 * ResizeObserver) also run against event.message and
 * exception.values[0].value when originalException is not an
 * Error — GlobalHandlers' window.onerror path produces such
 * message-only events.
 *
 * ClientInputError is deliberately NOT dropped — a malformed
 * request is a bug worth reporting. TypeError network failures
 * ('Failed to fetch', 'Load failed', 'NetworkError…') are kept
 * but tagged `errorKind: network` for routing.
 */
export function sentryBeforeSend(
  event: ErrorEvent,
  hint: EventHint
): ErrorEvent | null {
  const err = hint.originalException;
  // GlobalHandlers' window.onerror path produces message-only
  // events: originalException is undefined and the error text
  // sits in event.message or exception.values[0].value. Match
  // the noise patterns against it too so those events are not
  // dropped only when they happen to carry an Error instance.
  const eventTexts =
    err instanceof Error
      ? []
      : [
          event.message,
          event.exception?.values?.[0]?.value,
        ].filter(
          (value): value is string => typeof value === 'string'
        );
  const eventTextMatches = (pattern: RegExp): boolean =>
    eventTexts.some((text) => pattern.test(text));
  if (
    err instanceof RateLimitError ||
    err instanceof BookNotInFilesetError ||
    // Real aborts surface as DOMExceptions, which are not
    // Error subclasses — check both.
    ((err instanceof Error || err instanceof DOMException) &&
      err.name === 'AbortError') ||
    (err instanceof Error &&
      err.message.startsWith('Session expired')) ||
    eventTexts.some((text) =>
      text.startsWith('Session expired')
    ) ||
    (err instanceof Error && err.name === 'ChunkLoadError') ||
    (err instanceof Error &&
      (CHUNK_LOAD_PATTERN.test(err.message) ||
        RESIZE_OBSERVER_PATTERN.test(err.message))) ||
    eventTextMatches(CHUNK_LOAD_PATTERN) ||
    eventTextMatches(RESIZE_OBSERVER_PATTERN)
  ) {
    return null;
  }
  if (err instanceof TypeError && isNetworkFailure(err)) {
    event.tags = {
      ...event.tags,
      errorKind: 'network',
    };
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
