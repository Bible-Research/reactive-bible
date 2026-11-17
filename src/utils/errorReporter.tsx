import { showNotification } from '@mantine/notifications';
import * as Sentry from '@sentry/react';
import {
  ErrorNotificationContent,
} from '../components/ErrorNotificationContent';
import {
  CHUNK_LOAD_PATTERN,
  isChunkLoadError,
  reloadForStaleChunk,
} from './chunkLoadError';
import i18n from '../i18n';

// Media elements are excluded: audio/video sources routinely
// fail and are retried by the app's own fallback chains, so
// reporting them would surface expected noise as fatal errors.
const RESOURCE_TAGS = ['IMG', 'SCRIPT', 'LINK'];

// Resource-load notifications auto-close: an expired
// `signed_url` or a stale chunk is recoverable noise, not an
// alarm the user must dismiss.
const RESOURCE_AUTO_CLOSE_MS = 15000;

// Reports that arrive before React mounts `<Notifications/>`
// would be dropped (the Mantine event fires with no listener).
// While the app root is still empty they are queued and flushed
// once React has rendered. Test environments have no `#root`
// element at all, which also counts as ready.
const FLUSH_INTERVAL_MS = 100;
const MAX_FLUSH_ATTEMPTS = 50;

interface PendingReport {
  error: Error;
  context?: string;
  resource: boolean;
  resourceSrc?: string;
}

let notificationSeq = 0;
let pendingReports: PendingReport[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushAttempts = 0;

// A resource that already reported is not reported again — a
// broken signed URL otherwise spams one notification per retry.
const reportedResources = new Set<string>();

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

// Every Vite build artifact lives under `assets/` with a
// content-hashed filename, so a same-origin /assets/* script
// or stylesheet that fails to load can only mean the tab holds
// a stale index.html from the previous deploy — the missing
// hash was deleted, not the file. Third-party URLs with
// /assets/ in their path must not trigger a reload, so the
// origin is compared too.
function isOwnBuildAsset(src: string): boolean {
  try {
    const url = new URL(src);
    return (
      url.origin === window.location.origin &&
      url.pathname.startsWith('/assets/')
    );
  } catch {
    return false;
  }
}

// The external-study link icons in VerseActionToolbar load via
// Google's favicon service. That third-party endpoint fails
// routinely (rate limits, headless traffic, ad blockers) and
// the icon is decorative — the button hides it on error — so
// a failure is never worth a report. Matched by hostname+path,
// not a substring, so lookalike URLs still report.
function isGoogleFavicons(src: string): boolean {
  try {
    const url = new URL(src);
    return (
      url.hostname === 'www.google.com' &&
      url.pathname === '/s2/favicons'
    );
  } catch {
    return false;
  }
}

function isNotificationsReady(): boolean {
  const root = document.getElementById('root');
  return !root || root.childElementCount > 0;
}

function deliverReport(report: PendingReport): void {
  if (report.resource) {
    showNotification({
      id: `resource-error-${++notificationSeq}`,
      title: i18n.t('share.resourceLoadFailed'),
      message: report.resourceSrc
        ? i18n.t('share.resourceLoadFailedMsg', {
            src: report.resourceSrc,
          })
        : report.error.message,
      color: 'yellow',
      autoClose: RESOURCE_AUTO_CLOSE_MS,
    });
    return;
  }
  // Unique ids keep concurrent errors visible — a fixed id
  // would silently replace the previous report.
  showNotification({
    id: `unhandled-error-${++notificationSeq}`,
    title: i18n.t('share.unexpectedError'),
    message: (
      <ErrorNotificationContent
        error={report.error}
        context={report.context}
      />
    ),
    color: 'red',
    autoClose: false,
  });
}

function flushPendingReports(): void {
  if (!isNotificationsReady() && flushAttempts < MAX_FLUSH_ATTEMPTS) {
    flushAttempts += 1;
    return;
  }
  const queued = pendingReports;
  pendingReports = [];
  flushAttempts = 0;
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  for (const report of queued) {
    try {
      deliverReport(report);
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setInterval(flushPendingReports, FLUSH_INTERVAL_MS);
}

/**
 * Reports a HANDLED failure to Sentry without notifying the
 * user — the call site already degraded gracefully (error
 * state, toast, fallback data), so the fatal red notification
 * would be noise. Events are tagged `reportType: 'handled-api'`
 * and the caller's `context` so they group under a dedicated
 * stream; `extra` carries passage/fileset detail. Expected
 * taxonomy (RateLimitError, BookNotInFilesetError, AbortError)
 * is still dropped by `sentryBeforeSend`, so call sites do not
 * need their own instanceof pre-filters.
 */
export function captureHandledError(
  error: unknown,
  context: string,
  extra?: Record<string, unknown>
): void {
  const err = toError(error);
  try {
    console.error(`[${context}]`, err);
    Sentry.captureException(err, {
      tags: { context, reportType: 'handled-api' },
      ...(extra ? { extra } : {}),
    });
  } catch (reportingError) {
    console.error('Failed to report error:', reportingError);
  }
}

/**
 * Warning-level Sentry message for failures that carry no
 * useful stack — Howler/media errors and Capacitor bridge
 * rejections. Matches the `resource-load` stream shape: a
 * `reportType` tag routes the event out of the error queue.
 */
export function captureHandledWarning(
  message: string,
  reportType: 'media-failure' | 'native-bridge',
  extra?: Record<string, unknown>
): void {
  try {
    Sentry.captureMessage(message, {
      level: 'warning',
      tags: { reportType },
      ...(extra ? { extra } : {}),
    });
  } catch (reportingError) {
    console.error('Failed to report error:', reportingError);
  }
}

/**
 * Surfaces an error to the user. Fatal errors get a
 * non-dismissible notification containing a "Copy error
 * details" button; transient resource-load failures get a
 * quieter auto-closing one.
 */
export function reportError(
  error: unknown,
  context?: string,
  options: {
    resource?: boolean;
    sentryMessage?: string;
    resourceSrc?: string;
    /**
     * False = notify only, skip the Sentry transport. The
     * global `error`/`unhandledrejection` handlers use this:
     * Sentry's GlobalHandlers integration captures the same
     * uncaught exception itself, so reporting here too would
     * double-send. Direct callers (ErrorBoundary) keep the
     * default true.
     */
    sentry?: boolean;
  } = {}
): void {
  const err = toError(error);
  try {
    console.error(
      context ? `[${context}]` : '[Unexpected error]',
      err
    );
    // Forward to Sentry — capture* calls are safe no-ops when
    // the SDK was never initialized (no VITE_SENTRY_DSN, e.g.
    // tests and local dev). Resource-load failures are not
    // exceptions, so they go as warning-level messages tagged
    // `reportType: resource-load` rather than error events:
    // they signal a missing asset, not a crash, and are
    // already deduped per-URL above.
    if (options.resource === true) {
      Sentry.captureMessage(options.sentryMessage ?? err.message, {
        level: 'warning',
        tags: {
          ...(context ? { context } : {}),
          reportType: 'resource-load',
        },
      });
    } else if (options.sentry !== false) {
      Sentry.captureException(err, {
        tags: context ? { context } : undefined,
      });
    }
    const report: PendingReport = {
      error: err,
      context,
      resource: options.resource === true,
      resourceSrc: options.resourceSrc,
    };
    if (isNotificationsReady() && pendingReports.length === 0) {
      deliverReport(report);
    } else {
      pendingReports.push(report);
      scheduleFlush();
    }
  } catch (reportingError) {
    // Never let error reporting itself throw inside a global
    // error handler.
    console.error('Failed to report error:', reportingError);
  }
}

function handleGlobalError(event: Event): void {
  if ('error' in event || 'message' in event) {
    const errorEvent = event as ErrorEvent;
    // Notify-only: Sentry's GlobalHandlers integration already
    // captures the uncaught exception — reporting it here too
    // would emit a second event for the same error.
    if (errorEvent.error) {
      reportError(errorEvent.error, undefined, {
        sentry: false,
      });
    } else if (errorEvent.message) {
      reportError(
        new Error(errorEvent.message),
        undefined,
        { sentry: false }
      );
    }
    return;
  }
  // Resource load failures (img/script/audio/...) arrive as plain
  // Events with the failing element as target (capture phase).
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    RESOURCE_TAGS.includes(target.tagName)
  ) {
    const src =
      (target as HTMLImageElement).src ||
      (target as HTMLLinkElement).href ||
      target.tagName.toLowerCase();
    // blob: URLs are short-lived previews minted by
    // URL.createObjectURL (e.g. staged comment images). Their
    // failures are local and self-evident (a broken thumbnail),
    // never a fatal app error worth reporting.
    if (src.startsWith('blob:')) {
      return;
    }
    // Optional Vercel telemetry (Analytics / Speed Insights) must
    // never surface as an app error: ad blockers and non-Vercel
    // hosts (e.g. the Capacitor shell's https://localhost origin)
    // make these requests fail routinely.
    if (src.includes('/_vercel/')) {
      return;
    }
    if (isGoogleFavicons(src)) {
      return;
    }
    // Vite 8 attaches no error listener to the <link
    // rel="modulepreload"> it creates for a lazy chunk's JS
    // dependencies, so a 404'd hashed asset surfaces only as
    // this element error event — no promise rejection reaches
    // lazyWithReload (this is the 'Failed to load resource:
    // …/assets/<chunk>.js' warning stream). A missing own-build
    // script or stylesheet means a stale index.html: trigger
    // the same guarded reload lazyWithReload uses, before the
    // dedup early-return so a failure retried after coming back
    // online can still self-heal. The guard makes this safe to
    // attempt on every failure.
    if (
      (target.tagName === 'SCRIPT' ||
        target.tagName === 'LINK') &&
      isOwnBuildAsset(src)
    ) {
      reloadForStaleChunk();
    }
    // Report each failing resource once — a persistent 404 would
    // otherwise flood notifications on every retry/mount.
    if (reportedResources.has(src)) return;
    reportedResources.add(src);
    // Signed URLs (audio, images) embed credentials in their
    // query string — strip '?'/'#' and everything after before
    // the URL reaches Sentry. The user notification keeps the
    // full src.
    const sentrySrc = src.split(/[?#]/)[0];
    reportError(
      new Error(`Failed to load resource: ${src}`),
      'Resource load error',
      {
        resource: true,
        resourceSrc: src,
        sentryMessage: `Failed to load resource: ${sentrySrc}`,
      }
    );
  }
}

function handleUnhandledRejection(
  event: PromiseRejectionEvent
): void {
  // Aborted fetches are routine cancellations (navigation
  // races, superseded searches), not failures. Real aborts are
  // DOMExceptions, which are not Error subclasses — check both.
  if (
    (event.reason instanceof Error ||
      event.reason instanceof DOMException) &&
    event.reason.name === 'AbortError'
  ) {
    return;
  }
  // Notify-only — same one-event-per-error rule as
  // handleGlobalError: GlobalHandlers owns the Sentry event.
  reportError(event.reason, 'Unhandled promise rejection', {
    sentry: false,
  });
}

// Vite's __vitePreload wrapper dispatches this cancelable event
// on window when a lazy chunk's dependency preload or the
// dynamic import() itself rejects; `payload` is the rejection
// reason. preventDefault is deliberately never called — the
// rejection must still propagate to lazyWithReload / the
// unhandledrejection pipeline; this listener only guarantees a
// stale-tab reload is attempted for every chunk-load failure,
// including import()s not wrapped by lazyWithReload.
function handleVitePreloadError(event: Event): void {
  const payload = (event as { payload?: unknown }).payload;
  // Vite passes the rejection reason — normally an Error — but
  // a bare string rejection naming a stale chunk should still
  // self-heal, so the pattern is matched against strings too.
  if (
    isChunkLoadError(payload) ||
    (typeof payload === 'string' &&
      CHUNK_LOAD_PATTERN.test(payload))
  ) {
    reloadForStaleChunk();
  }
}

// Survives module replacement: Vite HMR re-executes main.tsx on
// every edit, and without a window-level marker each reload would
// stack another pair of listeners, duplicating every report.
declare global {
  interface Window {
    __globalErrorCleanup?: () => void;
  }
}

/**
 * Installs window-level handlers for uncaught exceptions,
 * unhandled promise rejections, resource load failures, and
 * Vite's `vite:preloadError` (stale-chunk recovery).
 * Idempotent — a previous installation (e.g. after HMR) is
 * removed first. Returns a cleanup function.
 */
export function initGlobalErrorHandlers(): () => void {
  window.__globalErrorCleanup?.();
  window.addEventListener('error', handleGlobalError, true);
  window.addEventListener(
    'unhandledrejection',
    handleUnhandledRejection
  );
  window.addEventListener(
    'vite:preloadError',
    handleVitePreloadError
  );
  const cleanup = () => {
    window.removeEventListener('error', handleGlobalError, true);
    window.removeEventListener(
      'unhandledrejection',
      handleUnhandledRejection
    );
    window.removeEventListener(
      'vite:preloadError',
      handleVitePreloadError
    );
    pendingReports = [];
    reportedResources.clear();
    if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    flushAttempts = 0;
    if (window.__globalErrorCleanup === cleanup) {
      delete window.__globalErrorCleanup;
    }
  };
  window.__globalErrorCleanup = cleanup;
  return cleanup;
}
