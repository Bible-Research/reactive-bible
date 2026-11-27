import { describe, expect, it } from 'vitest';
import type { ErrorEvent, EventHint } from '@sentry/react';
import {
  BookNotInFilesetError,
  ClientInputError,
  ConflictError,
  ProviderError,
  RateLimitError,
  SearchDisabledError,
} from '../api/errors';
import type { TrackedError } from '../api/errors';
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

  it('never drops user reports whose note quotes noise ' +
    'patterns', () => {
    // sendUserReport embeds the typed note in event.message,
    // which the string-based drops below scan whenever
    // originalException is not an Error (captureMessage sets
    // it to the message string). A user quoting the very
    // error they saw must not lose their report event.
    for (const note of [
      'I keep seeing Loading chunk 42 failed',
      'Unable to preload CSS then a white screen',
      'ResizeObserver loop errors in the console',
    ]) {
      const report = {
        event_id: 'r1',
        message: `user report (bug): ${note}`,
        tags: { reportType: 'user-report' },
      } as unknown as ErrorEvent;
      expect(
        sentryBeforeSend(report, hintOf(report.message))
      ).toBe(report);
    }
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

  it('drops SearchDisabledError (feature-flag-off ' +
    'supportive message)', () => {
    expect(
      sentryBeforeSend(
        event,
        hintOf(new SearchDisabledError('Search is disabled'))
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

  it('drops ChunkLoadError by name (stale tab after a ' +
    'deploy)', () => {
    const err = new Error('chunk request failed');
    err.name = 'ChunkLoadError';
    expect(sentryBeforeSend(event, hintOf(err))).toBeNull();
  });

  it('drops Chrome dynamic-import TypeError (stale chunk)',
    () => {
      const err = new TypeError(
        'Failed to fetch dynamically imported module: ' +
          'https://example.com/assets/index-abc123.js'
      );
      expect(sentryBeforeSend(event, hintOf(err)))
        .toBeNull();
    });

  it.each([
    'error loading dynamically imported module: ' +
      'https://example.com/assets/index-abc123.js',
    'Importing a module script failed.',
  ])('drops dynamic-import failure "%s"', (msg) => {
    expect(
      sentryBeforeSend(event, hintOf(new Error(msg)))
    ).toBeNull();
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

  it('drops message-only ResizeObserver events ' +
    '(window.onerror path)', () => {
    // GlobalHandlers' onerror path delivers no Error instance
    // — just the message text on the event.
    const messageEvent: ErrorEvent = {
      ...event,
      event_id: 'msg-ro',
      message: 'ResizeObserver loop completed with ' +
        'undelivered notifications.',
    };
    expect(
      sentryBeforeSend(messageEvent, hintOf(undefined))
    ).toBeNull();
  });

  it('drops message-only dynamic-import events ' +
    '(window.onerror path)', () => {
    const messageEvent: ErrorEvent = {
      ...event,
      event_id: 'msg-chunk',
      exception: {
        values: [
          {
            value: 'Failed to fetch dynamically imported ' +
              'module: https://example.com/assets/a.js',
          },
        ],
      },
    };
    expect(
      sentryBeforeSend(messageEvent, hintOf(null))
    ).toBeNull();
  });

  it('drops message-only Session expired events', () => {
    const messageEvent: ErrorEvent = {
      ...event,
      event_id: 'msg-session',
      message: 'Session expired. Please log in again.',
    };
    expect(
      sentryBeforeSend(messageEvent, hintOf(undefined))
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
    // Newer Chrome appends the request origin:
    // 'Failed to fetch (bibleresearch.vercel.app)'.
    'Failed to fetch (bibleresearch.vercel.app)',
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

  it('downgrades handled-api network failures to warning',
    () => {
      // A caught-and-degraded 'Failed to fetch' is client
      // connectivity noise (offline, flaky network), not a
      // defect in the graceful path — same "kept but out of
      // the error queue" treatment as ConflictError.
      const handledEvent: ErrorEvent = {
        ...event,
        event_id: 'handled-net',
        tags: {
          reportType: 'handled-api',
          context: 'Reading positions bulk fetch',
        },
      };

      const result = sentryBeforeSend(
        handledEvent,
        hintOf(new TypeError('Failed to fetch'))
      );

      expect(result).toBe(handledEvent);
      expect(result?.level).toBe('warning');
      expect(result?.tags?.errorKind).toBe('network');
      expect(result?.tags?.reportType).toBe('handled-api');
    });

  it('downgrades handled-api URL-suffixed fetch failures ' +
    '(REACTIVE-BIBLE-WEB-S)', () => {
      // Chrome's newer TypeError carries the request origin —
      // 'Failed to fetch (staging-bibleresearchapi.vercel.app)'.
      // The exact-match check missed this variant, so handled
      // connectivity noise stayed error-level in the bug queue.
      const handledEvent: ErrorEvent = {
        ...event,
        event_id: 'handled-net-url',
        tags: {
          reportType: 'handled-api',
          context: 'Reading positions bulk fetch',
        },
      };

      const result = sentryBeforeSend(
        handledEvent,
        hintOf(new TypeError(
          'Failed to fetch ' +
            '(staging-bibleresearchapi.vercel.app)'
        ))
      );

      expect(result).toBe(handledEvent);
      expect(result?.level).toBe('warning');
      expect(result?.tags?.errorKind).toBe('network');
    });

  it('does not tag the dynamic-import fetch TypeError as ' +
    'network', () => {
      // 'Failed to fetch dynamically imported module: …' is a
      // stale-chunk failure, not connectivity — and is dropped
      // by the chunk-load filter before this check anyway.
      const chunkEvent = { event_id: 'chunk' } as ErrorEvent;

      const result = sentryBeforeSend(
        chunkEvent,
        hintOf(new TypeError(
          'Failed to fetch dynamically imported module: ' +
            'https://example.com/assets/index-abc123.js'
        ))
      );

      expect(result).toBeNull();
    });

  it('keeps unhandled network failures at error level', () => {
    // An uncaught 'Failed to fetch' reaching GlobalHandlers
    // means a missing catch — still a bug worth the queue.
    const unhandledEvent: ErrorEvent = {
      ...event,
      event_id: 'unhandled-net',
      exception: {
        values: [
          { mechanism: { type: 'onunhandledrejection' } },
        ],
      },
    };

    const result = sentryBeforeSend(
      unhandledEvent,
      hintOf(new TypeError('Failed to fetch'))
    );

    expect(result).toBe(unhandledEvent);
    expect(result?.level).not.toBe('warning');
    expect(result?.tags?.errorKind).toBe('network');
  });

  it('keeps handled-api non-network failures at error level',
    () => {
      // The downgrade lives inside the isNetworkFailure gate —
      // a handled-api event whose error is not a connectivity
      // failure must stay error-level.
      const handledEvent: ErrorEvent = {
        ...event,
        event_id: 'handled-nonnet',
        tags: {
          reportType: 'handled-api',
          context: 'Reading positions bulk fetch',
        },
      };

      const result = sentryBeforeSend(
        handledEvent,
        hintOf(new Error('boom'))
      );

      expect(result).toBe(handledEvent);
      expect(result?.level).not.toBe('warning');
      expect(result?.tags?.errorKind).toBeUndefined();
    });

  it('keeps existing tags when tagging network failures',
    () => {
      // The errorKind tag spread must not clobber tags the
      // event already carries (e.g. context).
      const taggedEvent: ErrorEvent = {
        ...event,
        event_id: 'tagged',
        tags: { context: 'Custom context' },
      };

      const result = sentryBeforeSend(
        taggedEvent,
        hintOf(new TypeError('Failed to fetch'))
      );

      expect(result?.tags?.context).toBe('Custom context');
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

  const tracked = (
    err: Error,
    details: {
      code?: string;
      status?: number;
      endpoint?: string;
    }
  ): TrackedError =>
    Object.assign(err as TrackedError, {
      errorCode: details.code,
      status: details.status,
      endpoint: details.endpoint,
    });

  it.each([
    'book_not_in_fileset',
    'rate_limited',
    'search_disabled',
  ])('drops error_code "%s" on untyped errors', (code) => {
    // The instanceof drops only catch typed errors — a plain
    // Error rethrown through another layer still follows the
    // same drop rule.
    expect(
      sentryBeforeSend(
        event,
        hintOf(tracked(new Error('x'), { code }))
      )
    ).toBeNull();
  });

  it('downgrades ConflictError to warning', () => {
    const conflictEvent = { event_id: 'c' } as ErrorEvent;

    const result = sentryBeforeSend(
      conflictEvent,
      hintOf(new ConflictError('modified elsewhere'))
    );

    expect(result).toBe(conflictEvent);
    expect(result?.level).toBe('warning');
  });

  it('fingerprints ProviderError by code + endpoint', () => {
    const providerEvent = { event_id: 'p' } as ErrorEvent;
    const err = tracked(new ProviderError('upstream broke'), {
      code: 'provider_unavailable',
      status: 502,
      endpoint: '/api/v1/bible',
    });

    const result = sentryBeforeSend(
      providerEvent,
      hintOf(err)
    );

    expect(result).toBe(providerEvent);
    expect(result?.fingerprint).toEqual([
      'api-error',
      'provider_unavailable',
      '/api/v1/bible',
    ]);
    expect(result?.tags?.errorCode).toBe('provider_unavailable');
    expect(result?.tags?.httpStatus).toBe('502');
    expect(result?.extra?.endpoint).toBe('/api/v1/bible');
  });

  it('fingerprints uncoded ProviderError with sentinels', () => {
    const providerEvent = { event_id: 'p2' } as ErrorEvent;

    const result = sentryBeforeSend(
      providerEvent,
      hintOf(new ProviderError('200-wrapped outage'))
    );

    expect(result?.fingerprint).toEqual([
      'api-error',
      'uncoded',
      'unknown',
    ]);
  });

  it('keeps ClientInputError without a provider fingerprint',
    () => {
      const clientEvent = { event_id: 'ci' } as ErrorEvent;
      const err = tracked(
        new ClientInputError('bad param'),
        { code: 'missing_parameter', status: 400 }
      );

      const result = sentryBeforeSend(
        clientEvent,
        hintOf(err)
      );

      expect(result).toBe(clientEvent);
      expect(result?.fingerprint).toBeUndefined();
      expect(result?.tags?.errorCode).toBe('missing_parameter');
    });

  it('retags GlobalHandlers onerror events with context', () => {
    const onerrorEvent: ErrorEvent = {
      ...event,
      event_id: 'onerror',
      exception: {
        values: [{ mechanism: { type: 'onerror' } }],
      },
    };

    const result = sentryBeforeSend(
      onerrorEvent,
      hintOf(new Error('sync failed'))
    );

    expect(result?.tags?.context).toBe('Unhandled error');
  });
});
