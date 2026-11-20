import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import * as Sentry from '@sentry/react';
// Pinned to the exact version @sentry/react resolves — bump
// it in lockstep or this drives a stale Dedupe copy.
import { dedupeIntegration } from '@sentry/core';
import type {
  Client, Event, EventHint,
} from '@sentry/core';
import { sendUserReport } from './userReport';

interface FakeScope {
  setContext: ReturnType<typeof vi.fn>;
  setFingerprint: ReturnType<typeof vi.fn>;
}

const scope: FakeScope = {
  setContext: vi.fn(),
  setFingerprint: vi.fn(),
};

vi.mock('@sentry/react', () => ({
  getClient: vi.fn(),
  withScope: vi.fn((cb: (s: FakeScope) => void) => cb(scope)),
  captureMessage: vi.fn(),
  captureFeedback: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
}));

const mocked = vi.mocked(Sentry);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getClient.mockReturnValue(
    {} as ReturnType<typeof Sentry.getClient>,
  );
  // Individual specs install throwing implementations —
  // clearAllMocks resets call history only, so the defaults
  // have to be re-registered every run.
  mocked.withScope.mockImplementation(
    ((cb: (s: FakeScope) => void) =>
      cb(scope)) as unknown as typeof Sentry.withScope,
  );
  mocked.captureFeedback.mockImplementation(() => 'fb-id');
});

describe('sendUserReport', () => {
  it('returns false when Sentry has no client', () => {
    mocked.getClient.mockReturnValue(undefined);
    expect(
      sendUserReport({ message: 'button does nothing' }),
    ).toBe(false);
    expect(mocked.captureMessage).not.toHaveBeenCalled();
  });

  it('rejects empty messages', () => {
    expect(sendUserReport({ message: '   ' })).toBe(false);
    expect(mocked.captureMessage).not.toHaveBeenCalled();
  });

  it('captures a tagged report with linked feedback', () => {
    mocked.captureMessage.mockReturnValue('evt-1');
    const sent = sendUserReport({
      message: '  next does nothing  ',
      username: 'tester',
      context: {
        bookId: 'JHN',
        chapter: 3,
        textFilesetId: 'ENGESV_API',
        audioFilesetId: 'ENGESVN1DA',
      },
    });
    expect(sent).toBe(true);
    expect(mocked.captureMessage).toHaveBeenCalledWith(
      'user report (bug) JHN.3: next does nothing',
      {
        level: 'info',
        tags: {
          reportType: 'user-report',
          reportCategory: 'bug',
        },
      },
    );
    expect(scope.setFingerprint).toHaveBeenCalledWith(
      ['user-report'],
    );
    expect(scope.setContext).toHaveBeenCalledWith(
      'userReport',
      {
        note: 'next does nothing',
        category: 'bug',
        reportedBy: 'tester',
        bookId: 'JHN',
        chapter: 3,
        textFilesetId: 'ENGESV_API',
        audioFilesetId: 'ENGESVN1DA',
      },
    );
    expect(mocked.captureFeedback).toHaveBeenCalledWith({
      message: 'next does nothing',
      name: 'tester',
      source: 'menu-report',
      associatedEventId: 'evt-1',
      tags: {
        reportType: 'user-report',
        reportCategory: 'bug',
      },
    });
    expect(mocked.flush).toHaveBeenCalled();
  });

  it('tags the chosen category on both event and feedback',
    () => {
      expect(
        sendUserReport({
          message: 'please add bookmarks',
          category: 'feature',
        }),
      ).toBe(true);
      expect(mocked.captureMessage).toHaveBeenCalledWith(
        'user report (feature): please add bookmarks',
        {
          level: 'info',
          tags: {
            reportType: 'user-report',
            reportCategory: 'feature',
          },
        },
      );
      expect(mocked.captureFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            reportType: 'user-report',
            reportCategory: 'feature',
          },
        }),
      );
    });

  it('passes a reply email to the feedback entry', () => {
    expect(
      sendUserReport({
        message: 'thanks!',
        category: 'general',
        email: 'reader@example.com',
      }),
    ).toBe(true);
    expect(mocked.captureFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'reader@example.com',
      }),
    );
  });

  it('omits optional fields for anonymous reporters', () => {
    expect(sendUserReport({ message: 'crash' })).toBe(true);
    expect(scope.setContext).toHaveBeenCalledWith(
      'userReport',
      { note: 'crash', category: 'bug' },
    );
    const feedback = mocked.captureFeedback.mock.calls[0][0];
    expect(feedback).not.toHaveProperty('name');
    expect(feedback).not.toHaveProperty('email');
  });

  it('still reports when the feedback call throws', () => {
    mocked.captureFeedback.mockImplementation(() => {
      throw new Error('nope');
    });
    expect(sendUserReport({ message: 'crash' })).toBe(true);
    expect(mocked.captureMessage).toHaveBeenCalled();
  });

  it('never throws when Sentry itself throws', () => {
    mocked.withScope.mockImplementation(() => {
      throw new Error('nope');
    });
    expect(
      sendUserReport({ message: 'crash' }),
    ).toBe(false);
  });

  it('escapes Sentry dedupe for distinct back-to-back ' +
    'reports', () => {
    // The SDK's built-in Dedupe integration drops an untyped
    // event identical (message + fingerprint + stack) to the
    // previous one; user-report events share the synthetic
    // stack from the sendUserReport call site, so only a
    // per-report message keeps them distinct. Drive the real
    // integration against the events this call produces.
    const processEvent =
      dedupeIntegration().processEvent;
    if (!processEvent) {
      throw new Error('dedupe integration has no ' +
        'processEvent');
    }
    const hint = {} as EventHint;
    const client = {} as Client;
    // Real captureMessage events in this app are message-only:
    // attachStacktrace is unset, so eventFromMessage attaches
    // no exception/stack — Dedupe's _isSameMessageEvent then
    // compares message + fingerprint alone (both stacktraces
    // read as undefined → equal). The fabricated shape mirrors
    // that: identical stack (none), message/fingerprint pulled
    // from what sendUserReport actually emitted.
    const toEvent = (call: number): Event =>
      ({
        message:
          mocked.captureMessage.mock.calls[call][0],
        fingerprint:
          scope.setFingerprint.mock.calls[call][0],
      }) as unknown as Event;

    sendUserReport({
      message: 'same text',
      category: 'feature',
    });
    sendUserReport({
      message: 'same text',
      category: 'general',
    });

    expect(
      processEvent(toEvent(0), hint, client),
    ).not.toBeNull();
    // A byte-identical resend still collapses — Dedupe's own
    // job; the feedback entry still lands, so nothing is lost.
    expect(
      processEvent(toEvent(0), hint, client),
    ).toBeNull();
    // Pre-fix this second report was an identical 'user
    // report' message and Dedupe returned null.
    expect(
      processEvent(toEvent(1), hint, client),
    ).not.toBeNull();
  });
});
