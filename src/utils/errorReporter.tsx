import { showNotification } from '@mantine/notifications';
import {
  ErrorNotificationContent,
} from '../components/ErrorNotificationContent';

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

function isNotificationsReady(): boolean {
  const root = document.getElementById('root');
  return !root || root.childElementCount > 0;
}

function deliverReport(report: PendingReport): void {
  if (report.resource) {
    showNotification({
      id: `resource-error-${++notificationSeq}`,
      title: 'Resource failed to load',
      message: report.error.message,
      color: 'yellow',
      autoClose: RESOURCE_AUTO_CLOSE_MS,
    });
    return;
  }
  // Unique ids keep concurrent errors visible — a fixed id
  // would silently replace the previous report.
  showNotification({
    id: `unhandled-error-${++notificationSeq}`,
    title: 'Unexpected error',
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
 * Surfaces an error to the user. Fatal errors get a
 * non-dismissible notification containing a "Copy error
 * details" button; transient resource-load failures get a
 * quieter auto-closing one.
 */
export function reportError(
  error: unknown,
  context?: string,
  options: { resource?: boolean } = {}
): void {
  const err = toError(error);
  try {
    console.error(
      context ? `[${context}]` : '[Unexpected error]',
      err
    );
    const report: PendingReport = {
      error: err,
      context,
      resource: options.resource === true,
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
    if (errorEvent.error) {
      reportError(errorEvent.error);
    } else if (errorEvent.message) {
      reportError(new Error(errorEvent.message));
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
    if (reportedResources.has(src)) return;
    reportedResources.add(src);
    reportError(
      new Error(`Failed to load resource: ${src}`),
      'Resource load error',
      { resource: true }
    );
  }
}

function handleUnhandledRejection(
  event: PromiseRejectionEvent
): void {
  // Aborted fetches are routine cancellations (navigation
  // races, superseded searches), not failures.
  if (
    event.reason instanceof Error &&
    event.reason.name === 'AbortError'
  ) {
    return;
  }
  reportError(event.reason, 'Unhandled promise rejection');
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
 * unhandled promise rejections, and resource load failures.
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
  const cleanup = () => {
    window.removeEventListener('error', handleGlobalError, true);
    window.removeEventListener(
      'unhandledrejection',
      handleUnhandledRejection
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
