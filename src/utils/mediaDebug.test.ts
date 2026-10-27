import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import * as Sentry from '@sentry/react';
import {
  MEDIA_DEBUG_FLAG_KEY,
  MEDIA_DEBUG_LOG_CAP,
  MEDIA_DEBUG_LOG_KEY,
  UNLOCK_REPORT_MIN_HIDDEN_MS,
  isMediaDebugBuild,
  isMediaDebugEnabled,
  noteAppActive,
  readMediaDebugLog,
  sendMediaDebugReport,
  trace,
} from './mediaDebug';

interface FakeScope {
  addAttachment: ReturnType<typeof vi.fn>;
  setContext: ReturnType<typeof vi.fn>;
}

const scope: FakeScope = {
  addAttachment: vi.fn(),
  setContext: vi.fn(),
};

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn(),
  getClient: vi.fn(),
  withScope: vi.fn((cb: (s: FakeScope) => void) => cb(scope)),
  captureMessage: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(() => Promise.resolve()) },
}));

vi.mock('./platform', () => ({
  isNativeApp: vi.fn(() => false),
}));

const mocked = vi.mocked(Sentry);

const enable = () =>
  localStorage.setItem(MEDIA_DEBUG_FLAG_KEY, '1');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocked.getClient.mockReturnValue(
    {} as ReturnType<typeof Sentry.getClient>,
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('isMediaDebugEnabled', () => {
  it('is off by default (release / web builds)', () => {
    expect(isMediaDebugBuild()).toBe(false);
    expect(isMediaDebugEnabled()).toBe(false);
  });

  it('turns on via the localStorage flag', () => {
    enable();
    expect(isMediaDebugEnabled()).toBe(true);
  });

  it('turns on via the VITE_MEDIA_DEBUG build flag', () => {
    vi.stubEnv('VITE_MEDIA_DEBUG', '1');
    expect(isMediaDebugBuild()).toBe(true);
    expect(isMediaDebugEnabled()).toBe(true);
  });
});

describe('trace', () => {
  it('is a no-op when disabled', () => {
    const data = vi.fn(() => ({ a: 1 }));
    trace('session', 'register', data);
    expect(data).not.toHaveBeenCalled();
    expect(mocked.addBreadcrumb).not.toHaveBeenCalled();
    expect(localStorage.getItem(MEDIA_DEBUG_LOG_KEY)).toBeNull();
  });

  it('adds a breadcrumb and a ring-buffer entry', () => {
    enable();
    trace('dispatch', 'nexttrack', { source: 'native' });
    expect(mocked.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'media.dispatch',
        message: 'nexttrack',
        data: { source: 'native' },
      }),
    );
    const [entry] = readMediaDebugLog();
    expect(entry).toMatchObject({
      cat: 'dispatch',
      msg: 'nexttrack',
      data: { source: 'native' },
    });
    expect(typeof entry.t).toBe('number');
    expect(typeof entry.vis).toBe('string');
  });

  it('caps the ring buffer, keeping the newest entries', () => {
    enable();
    for (let i = 0; i < MEDIA_DEBUG_LOG_CAP + 5; i += 1) {
      trace('loop', `m${i}`);
    }
    const log = readMediaDebugLog();
    expect(log).toHaveLength(MEDIA_DEBUG_LOG_CAP);
    expect(log[0].msg).toBe('m5');
    expect(log[log.length - 1].msg)
      .toBe(`m${MEDIA_DEBUG_LOG_CAP + 4}`);
  });

  it('never throws on a failing data thunk or storage', () => {
    enable();
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    expect(() =>
      trace('x', 'y', () => {
        throw new Error('bad');
      }),
    ).not.toThrow();
    setItem.mockRestore();
    expect(mocked.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { traceDataError: 'Error: bad' },
      }),
    );
  });
});

describe('sendMediaDebugReport', () => {
  it('does nothing when disabled', () => {
    expect(sendMediaDebugReport('manual')).toBe(false);
    expect(mocked.captureMessage).not.toHaveBeenCalled();
  });

  it('attaches the buffer, captures, flushes and clears', () => {
    enable();
    trace('session', 'register');
    expect(sendMediaDebugReport('manual')).toBe(true);
    expect(scope.addAttachment).toHaveBeenCalledTimes(1);
    const [attachment] = scope.addAttachment.mock.calls[0] as [
      { filename: string; data: string },
    ];
    expect(attachment.filename).toBe('media-debug.json');
    const sent = JSON.parse(attachment.data) as Array<{
      msg: string;
    }>;
    expect(sent.map((e) => e.msg)).toEqual(['register', 'manual']);
    expect(mocked.captureMessage).toHaveBeenCalledWith(
      'media-debug snapshot',
      { level: 'info', tags: { reason: 'manual' } },
    );
    expect(mocked.flush).toHaveBeenCalled();
    expect(readMediaDebugLog()).toEqual([]);
  });

  it('keeps the buffer when no Sentry client exists', () => {
    enable();
    mocked.getClient.mockReturnValue(undefined);
    trace('session', 'register');
    expect(sendMediaDebugReport('manual')).toBe(false);
    expect(mocked.captureMessage).not.toHaveBeenCalled();
    expect(readMediaDebugLog().length).toBeGreaterThan(0);
  });
});

describe('noteAppActive', () => {
  beforeEach(() => {
    enable();
    vi.useFakeTimers();
    // Reset module state left by a previous test.
    noteAppActive(true, 'reset');
    vi.clearAllMocks();
  });

  it('reports once after a long hidden period', () => {
    noteAppActive(false, 'visibilitychange');
    vi.advanceTimersByTime(UNLOCK_REPORT_MIN_HIDDEN_MS);
    noteAppActive(true, 'visibilitychange');
    noteAppActive(true, 'appStateChange');
    expect(mocked.captureMessage).toHaveBeenCalledTimes(1);
    expect(mocked.captureMessage).toHaveBeenCalledWith(
      'media-debug snapshot',
      { level: 'info', tags: { reason: 'unlock' } },
    );
  });

  it('skips short hidden periods', () => {
    noteAppActive(false, 'appStateChange');
    vi.advanceTimersByTime(UNLOCK_REPORT_MIN_HIDDEN_MS - 1);
    noteAppActive(true, 'appStateChange');
    expect(mocked.captureMessage).not.toHaveBeenCalled();
  });
});
