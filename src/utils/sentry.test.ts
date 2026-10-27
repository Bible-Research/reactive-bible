import { describe, expect, it } from 'vitest';
import type { ErrorEvent, EventHint } from '@sentry/react';
import {
  BookNotInFilesetError,
  ClientInputError,
  ProviderError,
  RateLimitError,
} from '../api/errors';
import { sentryBeforeSend } from './sentry';

const event = { event_id: 'test-event' } as ErrorEvent;
const hintOf = (err: unknown): EventHint => ({
  originalException: err,
});

describe('sentryBeforeSend', () => {
  it('passes unexpected errors through', () => {
    const result = sentryBeforeSend(
      event,
      hintOf(new Error('boom'))
    );
    expect(result).toBe(event);
  });

  it('passes non-Error rejections through', () => {
    expect(sentryBeforeSend(event, hintOf('plain failure')))
      .toBe(event);
  });

  it('drops RateLimitError (handled throttling)', () => {
    expect(
      sentryBeforeSend(
        event,
        hintOf(new RateLimitError('too many requests'))
      )
    ).toBeNull();
  });

  it('drops BookNotInFilesetError (alternates fallback)', () => {
    expect(
      sentryBeforeSend(
        event,
        hintOf(new BookNotInFilesetError('no audio'))
      )
    ).toBeNull();
  });

  it('still reports generic ProviderError failures', () => {
    // Only the handled sub-cases are dropped — upstream
    // provider outages remain worth an event.
    expect(
      sentryBeforeSend(
        event,
        hintOf(new ProviderError('upstream broke'))
      )
    ).toBe(event);
  });

  it('drops AbortError (routine fetch cancellation)', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(sentryBeforeSend(event, hintOf(err))).toBeNull();
  });

  it('drops DOMException AbortError (real fetch aborts)', () => {
    // fetch aborts reject with a DOMException, not an Error.
    const err = new DOMException('aborted', 'AbortError');
    expect(sentryBeforeSend(event, hintOf(err))).toBeNull();
  });

  it('tags GlobalHandlers-captured rejections with context', () => {
    // GlobalHandlers captures first and wins dedupe, so the
    // surviving event lacks the context tag the app's own
    // captureException carried.
    const rejectionEvent: ErrorEvent = {
      ...event,
      exception: {
        values: [
          { mechanism: { type: 'onunhandledrejection' } },
        ],
      },
    };

    const result = sentryBeforeSend(
      rejectionEvent,
      hintOf(new Error('async failed'))
    );

    expect(result?.tags?.context).toBe(
      'Unhandled promise rejection'
    );
  });

  it('keeps an existing context tag on rejection events', () => {
    const taggedEvent: ErrorEvent = {
      ...event,
      tags: { context: 'Custom context' },
      exception: {
        values: [
          { mechanism: { type: 'onunhandledrejection' } },
        ],
      },
    };

    const result = sentryBeforeSend(
      taggedEvent,
      hintOf(new Error('async failed'))
    );

    expect(result?.tags?.context).toBe('Custom context');
  });

  it('drops Session expired errors (already handled)', () => {
    expect(
      sentryBeforeSend(
        event,
        hintOf(new Error('Session expired. Please log in again.'))
      )
    ).toBeNull();
  });

  it('keeps other errors whose message merely mentions ' +
    'sessions', () => {
    expect(
      sentryBeforeSend(
        event,
        hintOf(new Error('failed to persist session note'))
      )
    ).toBe(event);
  });

  it('drops ChunkLoadError (stale tab after a deploy)', () => {
    const err = new Error('Failed to fetch dynamically ' +
      'imported module');
    err.name = 'ChunkLoadError';
    expect(sentryBeforeSend(event, hintOf(err))).toBeNull();
  });

  it('drops "Loading chunk N failed" messages', () => {
    expect(
      sentryBeforeSend(
        event,
        hintOf(new Error('Loading chunk 12 failed.'))
      )
    ).toBeNull();
  });

  it('drops "Loading CSS chunk" messages', () => {
    expect(
      sentryBeforeSend(
        event,
        hintOf(new Error(
          'Loading CSS chunk 421 failed. (missing: ' +
            'https://example.com/assets/x.css)'
        ))
      )
    ).toBeNull();
  });

  it('drops ResizeObserver loop noise', () => {
    expect(
      sentryBeforeSend(
        event,
        hintOf(new Error(
          'ResizeObserver loop completed with ' +
            'undelivered notifications.'
        ))
      )
    ).toBeNull();
  });

  it('keeps ClientInputError (a bug by design)', () => {
    expect(
      sentryBeforeSend(
        event,
        hintOf(new ClientInputError('missing_parameter'))
      )
    ).toBe(event);
  });

  it.each([
    'Failed to fetch',
    'Load failed',
    'NetworkError when attempting to fetch resource.',
  ])('tags network failure "%s" without dropping it', (msg) => {
    const networkEvent = { event_id: msg } as ErrorEvent;

    const result = sentryBeforeSend(
      networkEvent,
      hintOf(new TypeError(msg))
    );

    expect(result).toBe(networkEvent);
    expect(result?.tags?.errorKind).toBe('network');
  });

  it('does not tag non-network TypeErrors', () => {
    const typeErrorEvent = { event_id: 'type' } as ErrorEvent;

    const result = sentryBeforeSend(
      typeErrorEvent,
      hintOf(new TypeError('undefined is not an object'))
    );

    expect(result).toBe(typeErrorEvent);
    expect(result?.tags?.errorKind).toBeUndefined();
  });
});
