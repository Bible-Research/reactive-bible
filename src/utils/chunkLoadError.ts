// Browsers phrase a failed dynamic import differently — Chrome
// 'Failed to fetch dynamically imported module', Firefox
// 'error loading dynamically imported module', Safari
// 'Importing a module script failed', plus bundler-era
// 'Loading chunk N failed' / ChunkLoadError, and Vite 8's
// __vitePreload 'Unable to preload CSS for <url>' when a lazy
// chunk's CSS dependency 404s. On this app they all mean one
// thing: the tab holds a stale index.html whose hashed asset
// URLs a newer deploy already deleted.
export const CHUNK_LOAD_PATTERN = new RegExp(
  [
    'Loading chunk \\d+ failed',
    'Loading CSS chunk',
    'dynamically imported module',
    'module script failed',
    'Unable to preload CSS',
  ].join('|')
);

export const isChunkLoadError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'ChunkLoadError' ||
    CHUNK_LOAD_PATTERN.test(error.message));

// A stale tab keeps requesting the previous deploy's hashed
// chunks — already deleted — so the only recovery is a full
// reload (fresh index.html → fresh hashes). The guard caps
// that at one reload per URL per RELOAD_GUARD_WINDOW_MS:
// a genuinely missing chunk must not spin an infinite reload
// loop, but a second deploy later in the same tab session can
// still self-heal once the window expires.
const RELOAD_GUARD_PREFIX = 'stale-chunk-reload:';

// Ten minutes — long enough to bound a reload loop at
// page-load granularity, short enough that a second deploy
// within the same tab session eventually self-heals.
const RELOAD_GUARD_WINDOW_MS = 10 * 60 * 1000;

// Backstops sessionStorage, which can throw in hardened or
// private browsing modes — without it a broken storage layer
// would let every failed import in this page load fire
// reload() again.
let reloadFiredThisPageLoad = false;

const reloadGuardKey = (): string =>
  RELOAD_GUARD_PREFIX +
  window.location.pathname +
  window.location.search;

/**
 * Reload the page to recover from a stale-chunk failure — at
 * most once per URL per RELOAD_GUARD_WINDOW_MS. Returns true
 * when this call triggered the reload; false means the guard
 * already fired recently for this URL — or the tab is
 * offline, where a reload would land on the browser's
 * connection-error page — and the caller should surface the
 * original error through the normal error pipeline instead.
 */
export const reloadForStaleChunk = (): boolean => {
  if (reloadFiredThisPageLoad) return false;
  // A chunk-load error while offline is ordinary connectivity
  // loss, not a stale deploy — reloading would strand the
  // user on the browser's offline page, which is worse than
  // letting the error reach the route's error boundary.
  // `=== false` (not falsy) so environments lacking onLine
  // still treat the tab as online.
  if (navigator.onLine === false) return false;
  try {
    const lastReloadAt = Number(
      window.sessionStorage.getItem(reloadGuardKey())
    );
    // Number(null) is 0 — no entry reads as "reloaded at the
    // epoch", always outside the window.
    if (
      Number.isFinite(lastReloadAt) &&
      Date.now() - lastReloadAt < RELOAD_GUARD_WINDOW_MS
    ) {
      return false;
    }
    window.sessionStorage.setItem(
      reloadGuardKey(),
      String(Date.now())
    );
  } catch {
    // Storage unavailable — the in-memory flag still prevents
    // a reload storm within this page load.
  }
  reloadFiredThisPageLoad = true;
  window.location.reload();
  return true;
};
