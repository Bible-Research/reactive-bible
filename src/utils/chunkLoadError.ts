// Browsers phrase a failed dynamic import differently — Chrome
// 'Failed to fetch dynamically imported module', Firefox
// 'error loading dynamically imported module', Safari
// 'Importing a module script failed', plus bundler-era
// 'Loading chunk N failed' / ChunkLoadError. On this app they
// all mean one thing: the tab holds a stale index.html whose
// hashed asset URLs a newer deploy already deleted.
export const CHUNK_LOAD_PATTERN = new RegExp(
  [
    'Loading chunk \\d+ failed',
    'Loading CSS chunk',
    'dynamically imported module',
    'module script failed',
  ].join('|')
);

export const isChunkLoadError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'ChunkLoadError' ||
    CHUNK_LOAD_PATTERN.test(error.message));

// A stale tab keeps requesting the previous deploy's hashed
// chunks — already deleted — so the only recovery is a full
// reload (fresh index.html → fresh hashes). The guard caps that
// at one reload per URL per tab session: a genuinely missing
// chunk must not spin an infinite reload loop.
const RELOAD_GUARD_PREFIX = 'stale-chunk-reload:';

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
 * most once per URL per tab session. Returns true when this
 * call triggered the reload; false means the guard already
 * fired for this URL and the caller should surface the
 * original error through the normal error pipeline instead.
 */
export const reloadForStaleChunk = (): boolean => {
  if (reloadFiredThisPageLoad) return false;
  try {
    if (
      window.sessionStorage.getItem(reloadGuardKey()) !== null
    ) {
      return false;
    }
    window.sessionStorage.setItem(reloadGuardKey(), '1');
  } catch {
    // Storage unavailable — the in-memory flag still prevents
    // a reload storm within this page load.
  }
  reloadFiredThisPageLoad = true;
  window.location.reload();
  return true;
};
