import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import * as Sentry from '@sentry/react';
import { sendUserReport } from './userReport';

interface FakeScope {
  setContext: ReturnType<typeof vi.fn>;
}

const scope: FakeScope = {
  setContext: vi.fn(),
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
      'user report',
      { level: 'info', tags: { reportType: 'user-report' } },
    );
    expect(scope.setContext).toHaveBeenCalledWith(
      'userReport',
      {
        note: 'next does nothing',
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
      tags: { reportType: 'user-report' },
    });
    expect(mocked.flush).toHaveBeenCalled();
  });

  it('omits optional fields for anonymous reporters', () => {
    expect(sendUserReport({ message: 'crash' })).toBe(true);
    expect(scope.setContext).toHaveBeenCalledWith(
      'userReport',
      { note: 'crash' },
    );
    expect(mocked.captureFeedback).toHaveBeenCalledWith(
      expect.not.objectContaining({ name: expect.anything() }),
    );
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
});
