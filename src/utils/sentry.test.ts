import { describe, expect, it } from 'vitest';
import type { ErrorEvent, EventHint } from '@sentry/react';
import {
  BookNotInFilesetError,
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
});
