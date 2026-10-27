import * as Sentry from '@sentry/react';
import { App } from '@capacitor/app';
import { isNativeApp } from './platform';

/**
 * Media-session / audio lifecycle tracer for the media-debug APK
 * (lock-screen prev/next diagnosis). Every entry point is gated
 * on `isMediaDebugEnabled()` — release and web builds never set
 * the flag, so they run none of this.
 *
 * Callers include media-session action handlers, which must stay
 * synchronous and never throw (Android ANR rule): every function
 * here is sync, swallows its own errors, and only fires Sentry's
 * async flush as a detached promise.
 */

export const MEDIA_DEBUG_FLAG_KEY = 'mediaDebug';
export const MEDIA_DEBUG_LOG_KEY = 'mediaDebugLog';
export const MEDIA_DEBUG_LOG_CAP = 500;
// Hidden at least this long before an unlock counts as a
// lock-screen session worth reporting.
export const UNLOCK_REPORT_MIN_HIDDEN_MS = 30_000;
const FLUSH_TIMEOUT_MS = 5000;

export type MediaDebugData = Record<string, unknown>;

export interface MediaDebugEntry {
  t: number;
  vis: string;
  cat: string;
  msg: string;
  data?: MediaDebugData;
}

/** Baked in at build time — the APK is a media-debug build. */
export const isMediaDebugBuild = (): boolean =>
  (import.meta.env.VITE_MEDIA_DEBUG as string | undefined) === '1';

/**
 * Build flag, or `localStorage.mediaDebug = '1'` to trace an
 * existing install from devtools.
 */
export const isMediaDebugEnabled = (): boolean => {
  if (isMediaDebugBuild()) return true;
  try {
    return localStorage.getItem(MEDIA_DEBUG_FLAG_KEY) === '1';
  } catch {
    return false;
  }
};

const visibility = (): string => {
  try {
    return document.visibilityState;
  } catch {
    return 'unknown';
  }
};

export const readMediaDebugLog = (): MediaDebugEntry[] => {
  try {
    const raw = localStorage.getItem(MEDIA_DEBUG_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MediaDebugEntry[]) : [];
  } catch {
    return [];
  }
};

const writeLog = (entries: MediaDebugEntry[]): void => {
  // Quota errors drop the oldest half and retry, then give up —
  // the log is best-effort and must never break playback.
  let kept = entries;
  while (kept.length > 0) {
    try {
      localStorage.setItem(MEDIA_DEBUG_LOG_KEY, JSON.stringify(kept));
      return;
    } catch {
      kept = kept.slice(Math.ceil(kept.length / 2));
    }
  }
};

const clearLog = (): void => {
  try {
    localStorage.removeItem(MEDIA_DEBUG_LOG_KEY);
  } catch {
    // ignore
  }
};

/**
 * Record one trace point as a Sentry breadcrumb and in the
 * localStorage ring buffer. `data` may be a thunk so callers pay
 * nothing (and cannot throw) when tracing is off.
 */
export const trace = (
  category: string,
  message: string,
  data?: MediaDebugData | (() => MediaDebugData),
): void => {
  if (!isMediaDebugEnabled()) return;
  let payload: MediaDebugData | undefined;
  try {
    payload = typeof data === 'function' ? data() : data;
  } catch (err) {
    payload = { traceDataError: String(err) };
  }
  try {
    Sentry.addBreadcrumb({
      category: `media.${category}`,
      message,
      data: payload,
      level: 'info',
    });
  } catch {
    // ignore
  }
  try {
    const entry: MediaDebugEntry = {
      t: Date.now(),
      vis: visibility(),
      cat: category,
      msg: message,
      ...(payload ? { data: payload } : {}),
    };
    const log = readMediaDebugLog();
    log.push(entry);
    writeLog(log.slice(-MEDIA_DEBUG_LOG_CAP));
  } catch {
    // ignore
  }
};

/**
 * Send the ring buffer to Sentry as a `media-debug snapshot`
 * message with a `media-debug.json` attachment. The buffer is
 * cleared only when a Sentry client exists (DSN set) — without
 * one nothing was sent, so the trace is kept for a later report.
 * Returns whether the snapshot was handed to Sentry.
 */
export const sendMediaDebugReport = (
  reason: string,
  extra?: MediaDebugData,
): boolean => {
  if (!isMediaDebugEnabled()) return false;
  try {
    trace('report', reason, extra);
    const log = readMediaDebugLog();
    if (!Sentry.getClient()) return false;
    Sentry.withScope((scope) => {
      scope.addAttachment({
        filename: 'media-debug.json',
        data: JSON.stringify(log),
        contentType: 'application/json',
      });
      scope.setContext('mediaDebug', {
        reason,
        entries: log.length,
        ...extra,
      });
      Sentry.captureMessage('media-debug snapshot', {
        level: 'info',
        // reportType marks the event as a diagnostics stream,
        // not a bug — keeps it out of the level:error queue.
        tags: { reason, reportType: 'media-debug' },
      });
    });
    clearLog();
    void Sentry.flush(FLUSH_TIMEOUT_MS).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
};

let hiddenAt: number | null = null;

/**
 * Lifecycle hook shared by `visibilitychange` and Capacitor's
 * `appStateChange` (the background-mode plugin can keep the
 * WebView "visible" while locked, so both are watched). The
 * first "active again" after ≥ 30 s hidden sends an `unlock`
 * report; the second source finds `hiddenAt` cleared and stays
 * quiet.
 */
export const noteAppActive = (
  active: boolean,
  source: string,
): void => {
  if (!isMediaDebugEnabled()) return;
  try {
    trace('lifecycle', source, { active });
    if (!active) {
      if (hiddenAt === null) hiddenAt = Date.now();
      return;
    }
    if (hiddenAt === null) return;
    const hiddenMs = Date.now() - hiddenAt;
    hiddenAt = null;
    if (hiddenMs >= UNLOCK_REPORT_MIN_HIDDEN_MS) {
      sendMediaDebugReport('unlock', { hiddenMs, source });
    }
  } catch {
    // ignore
  }
};

let initialized = false;

/** Startup trace + lifecycle listeners. Call once after Sentry. */
export const initMediaDebug = (): void => {
  if (initialized || !isMediaDebugEnabled()) return;
  initialized = true;
  try {
    const native = isNativeApp();
    trace('startup', 'init', () => ({
      mediaSession:
        typeof navigator !== 'undefined' &&
        'mediaSession' in navigator,
      native,
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : '',
    }));
    document.addEventListener('visibilitychange', () => {
      noteAppActive(
        document.visibilityState === 'visible',
        'visibilitychange',
      );
    });
    if (native) {
      void App.addListener('appStateChange', ({ isActive }) => {
        noteAppActive(isActive, 'appStateChange');
      }).catch(() => undefined);
    }
  } catch {
    // ignore
  }
};
