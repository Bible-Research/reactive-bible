import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ReactElement } from 'react';
import { showNotification } from '@mantine/notifications';
import {
  buildErrorDetails,
  copyErrorDetails,
} from '../errorReportDetails';
import {
  initGlobalErrorHandlers,
  reportError,
} from '../errorReporter';

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

const mockShowNotification = vi.mocked(showNotification);

interface NotificationContentProps {
  error: Error;
  context?: string;
}

function notificationContent(callIndex = 0) {
  const message =
    mockShowNotification.mock.calls[callIndex][0].message;
  return (message as ReactElement<NotificationContentProps>)
    .props;
}

describe('errorReporter', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(
      () => undefined
    );
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('reportError', () => {
    it('shows a persistent red notification', () => {
      reportError(new Error('boom'));

      expect(mockShowNotification).toHaveBeenCalledTimes(1);
      const call = mockShowNotification.mock.calls[0][0];
      expect(call.title).toBe('Unexpected error');
      expect(call.color).toBe('red');
      expect(call.autoClose).toBe(false);
    });

    it('converts string rejections to Error', () => {
      reportError('plain failure', 'Unhandled promise rejection');

      expect(mockShowNotification).toHaveBeenCalledTimes(1);
      expect(notificationContent().error.message).toBe(
        'plain failure'
      );
    });

    it('never throws, even if reporting fails', () => {
      mockShowNotification.mockImplementation(() => {
        throw new Error('notification broke');
      });

      expect(() => reportError(new Error('x'))).not.toThrow();
    });
  });

  describe('buildErrorDetails', () => {
    it('includes message, url, and stack in markdown', () => {
      const details = buildErrorDetails(
        new Error('boom'),
        'Test context'
      );

      expect(details).toContain('Error: boom');
      expect(details).toContain('Test context');
      expect(details).toContain('**URL:**');
      expect(details).toContain('```');
    });
  });

  describe('copyErrorDetails', () => {
    it('writes the report to the clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', {
        ...navigator,
        clipboard: { writeText },
      });

      const ok = await copyErrorDetails(new Error('boom'));

      expect(ok).toBe(true);
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('Error: boom')
      );
    });

    it('returns false when clipboard is unavailable', async () => {
      const writeText = vi
        .fn()
        .mockRejectedValue(new Error('denied'));
      vi.stubGlobal('navigator', {
        ...navigator,
        clipboard: { writeText },
      });

      const ok = await copyErrorDetails(new Error('boom'));

      expect(ok).toBe(false);
    });
  });

  describe('initGlobalErrorHandlers', () => {
    it('reports uncaught exceptions', () => {
      cleanup = initGlobalErrorHandlers();
      const error = new Error('script failed');

      window.dispatchEvent(
        new ErrorEvent('error', { error, message: 'script failed' })
      );

      expect(mockShowNotification).toHaveBeenCalledTimes(1);
      expect(notificationContent().error).toBe(error);
    });

    it('reports unhandled promise rejections', () => {
      cleanup = initGlobalErrorHandlers();
      const reason = new Error('async failed');
      const event = new Event('unhandledrejection');
      Object.defineProperty(event, 'reason', { value: reason });

      window.dispatchEvent(event);

      expect(mockShowNotification).toHaveBeenCalledTimes(1);
      expect(notificationContent().error).toBe(reason);
      expect(notificationContent().context).toBe(
        'Unhandled promise rejection'
      );
    });

    it('reports resource load failures', () => {
      cleanup = initGlobalErrorHandlers();
      const img = document.createElement('img');
      const event = new Event('error');
      Object.defineProperty(event, 'target', { value: img });

      window.dispatchEvent(event);

      expect(mockShowNotification).toHaveBeenCalledTimes(1);
      expect(notificationContent().error.message).toContain(
        'Failed to load resource'
      );
    });

    it('stops reporting after cleanup', () => {
      cleanup = initGlobalErrorHandlers();
      cleanup();
      cleanup = undefined;

      window.dispatchEvent(
        new ErrorEvent('error', { error: new Error('x') })
      );

      expect(mockShowNotification).not.toHaveBeenCalled();
    });
  });
});
