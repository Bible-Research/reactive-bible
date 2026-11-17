import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ReactElement } from 'react';
import { showNotification } from '@mantine/notifications';
import * as Sentry from '@sentry/react';
import {
  buildErrorDetails,
  copyErrorDetails,
} from './errorReportDetails';
import {
  captureHandledError,
  captureHandledWarning,
  initGlobalErrorHandlers,
  reportError,
} from './errorReporter';

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

vi.mock('@sentry/react', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

const mockShowNotification = vi.mocked(showNotification);
const mockCaptureMessage = vi.mocked(Sentry.captureMessage);
const mockCaptureException = vi.mocked(Sentry.captureException);

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

  describe('captureHandledError', () => {
    it('emits a tagged Sentry event and no notification', () => {
      const err = new Error('chapter fetch failed');

      captureHandledError(err, 'Chapter fetch', {
        book: 'JHN',
        chapter: 3,
        filesetId: 'ENGESV_API',
      });

      expect(mockShowNotification).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalledWith(err, {
        tags: {
          context: 'Chapter fetch',
          reportType: 'handled-api',
        },
        extra: {
          book: 'JHN',
          chapter: 3,
          filesetId: 'ENGESV_API',
        },
      });
    });

    it('omits the extra field when none is given', () => {
      captureHandledError('plain failure', 'Notes save');

      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        {
          tags: {
            context: 'Notes save',
            reportType: 'handled-api',
          },
        }
      );
    });
  });

  describe('captureHandledWarning', () => {
    it('emits a warning-level message tagged by stream', () => {
      captureHandledWarning(
        'Audio load failed',
        'media-failure',
        { filesetId: 'LVSGLU8C1DA', book: 'JHN', chapter: 3 }
      );

      expect(mockShowNotification).not.toHaveBeenCalled();
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        'Audio load failed',
        {
          level: 'warning',
          tags: { reportType: 'media-failure' },
          extra: {
            filesetId: 'LVSGLU8C1DA',
            book: 'JHN',
            chapter: 3,
          },
        }
      );
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
      // Notify-only: Sentry's GlobalHandlers integration owns
      // the exception event — capturing here too would send a
      // duplicate for the same uncaught error.
      expect(mockCaptureException).not.toHaveBeenCalled();
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
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('reports resource load failures', () => {
      cleanup = initGlobalErrorHandlers();
      const img = document.createElement('img');
      const event = new Event('error');
      Object.defineProperty(event, 'target', { value: img });

      window.dispatchEvent(event);

      expect(mockShowNotification).toHaveBeenCalledTimes(1);
      const call = mockShowNotification.mock.calls[0][0];
      expect(call.title).toBe('Resource failed to load');
      expect(call.color).toBe('yellow');
      expect(call.autoClose).not.toBe(false);
      expect(call.message).toContain('Failed to load resource');
    });

    it('tags resource-load Sentry messages with reportType', () => {
      cleanup = initGlobalErrorHandlers();
      const img = document.createElement('img');
      img.src = 'https://example.com/missing.png?signed=1';
      const event = new Event('error');
      Object.defineProperty(event, 'target', { value: img });

      window.dispatchEvent(event);

      // Query-string credentials are stripped from the message;
      // reportType marks the event as a non-exception warning.
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        'Failed to load resource: ' +
          'https://example.com/missing.png',
        {
          level: 'warning',
          tags: {
            context: 'Resource load error',
            reportType: 'resource-load',
          },
        }
      );
    });

    it('does not set reportType on exception events', () => {
      reportError(new Error('boom'), 'Test context');

      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        { tags: { context: 'Test context' } }
      );
    });

    it('dedupes repeat failures for the same resource', () => {
      cleanup = initGlobalErrorHandlers();
      const img = document.createElement('img');
      img.src = 'https://example.com/missing.png';
      const makeEvent = () => {
        const event = new Event('error');
        Object.defineProperty(event, 'target', { value: img });
        return event;
      };

      window.dispatchEvent(makeEvent());
      window.dispatchEvent(makeEvent());

      expect(mockShowNotification).toHaveBeenCalledTimes(1);
    });

    it('suppresses AbortError rejections', () => {
      cleanup = initGlobalErrorHandlers();
      const reason = new Error('aborted');
      reason.name = 'AbortError';
      const event = new Event('unhandledrejection');
      Object.defineProperty(event, 'reason', { value: reason });

      window.dispatchEvent(event);

      // Routine fetch cancellations must not notify.
      expect(mockShowNotification).not.toHaveBeenCalled();
    });

    it('suppresses DOMException AbortError rejections', () => {
      cleanup = initGlobalErrorHandlers();
      // Real fetch aborts reject with a DOMException — not an
      // Error subclass — and must be suppressed identically.
      const reason = new DOMException('aborted', 'AbortError');
      const event = new Event('unhandledrejection');
      Object.defineProperty(event, 'reason', { value: reason });

      window.dispatchEvent(event);

      expect(mockShowNotification).not.toHaveBeenCalled();
    });

    it('ignores audio/video element load failures', () => {
      cleanup = initGlobalErrorHandlers();
      for (const tag of ['audio', 'video']) {
        const el = document.createElement(tag);
        const event = new Event('error');
        Object.defineProperty(event, 'target', { value: el });
        window.dispatchEvent(event);
      }

      // Media failures are handled by the app's own fallback
      // chains — never surfaced as fatal errors.
      expect(mockShowNotification).not.toHaveBeenCalled();
    });

    it('reports an ErrorEvent message with no error object', () => {
      cleanup = initGlobalErrorHandlers();

      window.dispatchEvent(
        new ErrorEvent('error', {
          message: 'Script error.',
        })
      );

      expect(mockShowNotification).toHaveBeenCalledTimes(1);
      expect(notificationContent().error.message).toBe(
        'Script error.'
      );
    });

    it('ignores blob: resource load failures', () => {
      cleanup = initGlobalErrorHandlers();
      const img = document.createElement('img');
      img.src = 'blob:https://localhost/some-uuid';
      const event = new Event('error');
      Object.defineProperty(event, 'target', { value: img });
      window.dispatchEvent(event);

      // Transient object-URL previews (staged comment images)
      // must never surface as fatal errors.
      expect(mockShowNotification).not.toHaveBeenCalled();
    });

    it('ignores Vercel telemetry resource load failures', () => {
      cleanup = initGlobalErrorHandlers();
      const script = document.createElement('script');
      script.src = 'https://localhost/_vercel/insights/script.js';
      const event = new Event('error');
      Object.defineProperty(event, 'target', { value: script });
      window.dispatchEvent(event);
      expect(mockShowNotification).not.toHaveBeenCalled();
    });

    it('ignores Google favicon service load failures', () => {
      cleanup = initGlobalErrorHandlers();
      const img = document.createElement('img');
      img.src =
        'https://www.google.com/s2/favicons' +
        '?sz=64&domain=biblemapper.com';
      const event = new Event('error');
      Object.defineProperty(event, 'target', { value: img });
      window.dispatchEvent(event);

      // Decorative external-link icons degrade silently.
      expect(mockShowNotification).not.toHaveBeenCalled();
      expect(mockCaptureMessage).not.toHaveBeenCalled();
    });

    it('still reports a /s2/favicons path on another host',
      () => {
        cleanup = initGlobalErrorHandlers();
        const img = document.createElement('img');
        img.src = 'https://evil.example.com/s2/favicons';
        const event = new Event('error');
        Object.defineProperty(event, 'target', { value: img });
        window.dispatchEvent(event);

        // The exclusion matches hostname+path, not a bare
        // substring — only Google's own service is skipped.
        expect(mockShowNotification).toHaveBeenCalledTimes(1);
        expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
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

    describe('stale-chunk recovery', () => {
      let reloadMock: ReturnType<typeof vi.fn>;
      let freshShowNotification: typeof mockShowNotification;
      let freshCaptureMessage: typeof mockCaptureMessage;

      // Each test imports errorReporter fresh so chunkLoadError's
      // per-page-load state resets — the same trick
      // lazyWithReload.test.tsx uses to simulate a reload.
      // vi.resetModules also re-runs the vi.mock factories, so
      // the top-level mock references go stale and must be
      // re-acquired from the fresh registry.
      const freshHandlers = async () => {
        vi.resetModules();
        const mod = await import('./errorReporter');
        cleanup = mod.initGlobalErrorHandlers();
        freshShowNotification = vi.mocked(
          (await import('@mantine/notifications'))
            .showNotification
        );
        freshCaptureMessage = vi.mocked(
          (await import('@sentry/react')).captureMessage
        );
      };

      const fireResourceError = (el: HTMLElement) => {
        const event = new Event('error');
        Object.defineProperty(event, 'target', { value: el });
        window.dispatchEvent(event);
      };

      const firePreloadError = (payload: unknown) => {
        const event = new Event('vite:preloadError', {
          cancelable: true,
        });
        Object.defineProperty(event, 'payload', {
          value: payload,
        });
        window.dispatchEvent(event);
        return event;
      };

      const chunkError = () =>
        new TypeError(
          'Failed to fetch dynamically imported module: ' +
            window.location.origin +
            '/assets/VerseTextGroups-DzkkTFBH.js'
        );

      beforeEach(() => {
        reloadMock = vi.fn();
        Object.defineProperty(window.location, 'reload', {
          configurable: true,
          writable: true,
          value: reloadMock,
        });
        window.sessionStorage.clear();
      });

      afterEach(() => {
        // Drop the own-property stub so the prototype's real
        // reload is visible again.
        delete (window.location as Partial<Location>).reload;
        window.sessionStorage.clear();
      });

      it('reloads once when a modulepreload for a hashed ' +
        'asset fails', async () => {
          await freshHandlers();
          // The reported Sentry issue: Vite 8 attaches no error
          // listener to the JS modulepreload links it creates,
          // so a 404'd hashed dep surfaces only as this
          // element error — never as a promise rejection.
          const link = document.createElement('link');
          link.rel = 'modulepreload';
          link.href =
            window.location.origin +
            '/assets/VerseTextGroups-DzkkTFBH.js';

          fireResourceError(link);
          expect(reloadMock).toHaveBeenCalledTimes(1);

          // A second failure in the same page load must not
          // reload again — and since a reload is already
          // armed, neither failure is reported: the page is
          // tearing down, so the warning would be noise.
          fireResourceError(link);
          expect(reloadMock).toHaveBeenCalledTimes(1);
          expect(freshCaptureMessage).not.toHaveBeenCalled();
          expect(freshShowNotification).not.toHaveBeenCalled();
        });

      it('does not report the resource-load warning when ' +
        'the stale-chunk reload fires', async () => {
          await freshHandlers();
          const script = document.createElement('script');
          script.src =
            window.location.origin +
            '/assets/RegisterPage-Bu7tMXpG.js';

          fireResourceError(script);

          // The self-heal reload makes this failure
          // self-evident — a Sentry warning and a notification
          // on a page that is already reloading are pure noise
          // (the resource-load stream this test pins down).
          expect(reloadMock).toHaveBeenCalledTimes(1);
          expect(freshCaptureMessage).not.toHaveBeenCalled();
          expect(freshShowNotification).not.toHaveBeenCalled();
        });

      it('does not report when another handler already ' +
        'armed the reload', async () => {
          await freshHandlers();
          // vite:preloadError beats the element error to the
          // reload — the second handler sees the armed guard
          // and must stay silent too.
          firePreloadError(chunkError());
          expect(reloadMock).toHaveBeenCalledTimes(1);

          const link = document.createElement('link');
          link.rel = 'modulepreload';
          link.href =
            window.location.origin + '/assets/dep-abc123.js';
          fireResourceError(link);

          expect(reloadMock).toHaveBeenCalledTimes(1);
          expect(freshCaptureMessage).not.toHaveBeenCalled();
          expect(freshShowNotification).not.toHaveBeenCalled();
        });

      it('still reports the failure when the reload ' +
        'guard is spent', async () => {
          await freshHandlers();
          firePreloadError(chunkError());
          expect(reloadMock).toHaveBeenCalledTimes(1);

          // A real reload wipes module state; sessionStorage
          // keeps the guard timestamp, so a still-broken
          // chunk on the next page load gets no second reload
          // — that failure is a real problem and must still
          // reach the resource-load warning stream.
          await freshHandlers();
          const script = document.createElement('script');
          script.src =
            window.location.origin +
            '/assets/RegisterPage-Bu7tMXpG.js';
          fireResourceError(script);

          expect(reloadMock).toHaveBeenCalledTimes(1);
          expect(freshCaptureMessage).toHaveBeenCalledTimes(1);
          expect(freshCaptureMessage).toHaveBeenCalledWith(
            'Failed to load resource: ' +
              window.location.origin +
              '/assets/RegisterPage-Bu7tMXpG.js',
            {
              level: 'warning',
              tags: {
                context: 'Resource load error',
                reportType: 'resource-load',
              },
            }
          );
          expect(freshShowNotification)
            .toHaveBeenCalledTimes(1);
        });

      it('reloads once on vite:preloadError without ' +
        'swallowing the error', async () => {
          await freshHandlers();

          const event = firePreloadError(chunkError());

          expect(reloadMock).toHaveBeenCalledTimes(1);
          // preventDefault stays uncalled — the rejection must
          // still reach lazyWithReload / the error pipeline.
          expect(event.defaultPrevented).toBe(false);
        });

      it('keeps the reload once-only across a simulated ' +
        'page reload', async () => {
          await freshHandlers();
          firePreloadError(chunkError());
          expect(reloadMock).toHaveBeenCalledTimes(1);

          // A real reload wipes module state; sessionStorage
          // (holding the guard timestamp) survives — a
          // still-broken chunk must not loop the reload.
          await freshHandlers();
          firePreloadError(chunkError());
          expect(reloadMock).toHaveBeenCalledTimes(1);
        });

      it('reloads when the preload-error payload is a ' +
        'chunk-load string', async () => {
          await freshHandlers();

          // Vite normally passes an Error, but a bare string
          // rejection naming a stale chunk must heal too.
          firePreloadError('Loading chunk 5 failed.');

          expect(reloadMock).toHaveBeenCalledTimes(1);
        });

      it('ignores vite:preloadError for non-chunk failures',
        async () => {
          await freshHandlers();

          firePreloadError(new Error('boom'));

          expect(reloadMock).not.toHaveBeenCalled();
        });

      it('reloads for a failed hashed script tag too',
        async () => {
          await freshHandlers();
          const script = document.createElement('script');
          script.src =
            window.location.origin + '/assets/index-abc123.js';

          fireResourceError(script);

          expect(reloadMock).toHaveBeenCalledTimes(1);
        });

      it('does not reload for third-party asset failures',
        async () => {
          await freshHandlers();
          const script = document.createElement('script');
          script.src =
            'https://cdn.example.com/assets/chunk-abc123.js';

          fireResourceError(script);

          expect(reloadMock).not.toHaveBeenCalled();
          // Still reported as a resource-load warning.
          expect(freshShowNotification)
            .toHaveBeenCalledTimes(1);
        });

      it('does not reload for a failed own-origin image',
        async () => {
          await freshHandlers();
          const img = document.createElement('img');
          img.src =
            window.location.origin + '/assets/icon-abc123.png';

          fireResourceError(img);

          // Image 404s stay report-only — they can fail for
          // reasons unrelated to a stale deploy.
          expect(reloadMock).not.toHaveBeenCalled();
          expect(freshShowNotification)
            .toHaveBeenCalledTimes(1);
        });
    });
  });
});
