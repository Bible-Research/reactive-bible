// FUMS (Fair Use Management System) reporting for API.Bible.
//
// API.Bible license terms require web clients to report every
// delivered passage. Each passage response carries a `meta`
// block with a `fumsId` token (and a `fums` script snippet
// that embeds it); we lazy-load the FUMS tracker script once
// and call `_BAPI.t(fumsId)` per response.
// Every failure path is intentionally silent — reporting must
// never break reading.

const FUMS_SCRIPT_URL =
  'https://cdn.scripture.api.bible/fums/fumsv2.min.js';

// Matches `_BAPI.t('token')` inside the `meta.fums` snippet.
const FUMS_TOKEN_RE = /\b_BAPI\.t\(\s*['"]([^'"]+)['"]\s*\)/;

declare global {
  interface Window {
    _BAPI?: { t?: (fumsId: string) => void };
  }
}

let fumsScriptPromise: Promise<void> | null = null;

/**
 * Load the FUMS tracker script exactly once; subsequent calls
 * reuse the same promise.
 */
export function loadFumsScript(): Promise<void> {
  if (!fumsScriptPromise) {
    fumsScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = FUMS_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error('FUMS script failed to load'));
      document.head.appendChild(script);
    });
    // A failed load must not poison later attempts: reset so
    // the next report retries with a fresh script element.
    fumsScriptPromise.catch(() => {
      fumsScriptPromise = null;
    });
  }
  return fumsScriptPromise;
}

/**
 * Pull the FUMS token out of a passage response's `meta`
 * block. `fumsId` is preferred; `fums` is a full
 * `<script>_BAPI.t('id')</script>` snippet per the API.Bible
 * schema, so the token must be parsed out — the snippet
 * itself must never reach `_BAPI.t`.
 */
const extractFumsId = (meta: unknown): string | null => {
  const m = meta as {
    fumsId?: unknown;
    fums?: unknown;
  } | null;
  if (typeof m?.fumsId === 'string' && m.fumsId) {
    return m.fumsId;
  }
  if (typeof m?.fums === 'string') {
    return FUMS_TOKEN_RE.exec(m.fums)?.[1] ?? null;
  }
  return null;
};

/**
 * Report a delivered passage to API.Bible's FUMS service.
 * @param meta - the `meta` block from a passage response
 */
export function reportFums(meta: unknown): void {
  try {
    const fumsId = extractFumsId(meta);
    if (!fumsId) {
      return;
    }
    loadFumsScript()
      .then(() => {
        window._BAPI?.t?.(fumsId);
      })
      .catch(() => {
        // Silent: FUMS reporting must never surface errors.
      });
  } catch {
    // Silent.
  }
}
