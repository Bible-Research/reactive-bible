import type { KjvBook } from '../api';
import {
  isChunkLoadError,
  reloadForStaleChunk,
} from './chunkLoadError';

let kjvDataCache: KjvBook[] | null = null;
let loadingPromise: Promise<KjvBook[]> | null = null;

/**
 * Lazily load KJV verse text via dynamic import so it stays out
 * of the entry chunk. Returns the cached data if already loaded;
 * concurrent callers share the same in-flight promise.
 */
export const loadKjvData = async (): Promise<KjvBook[]> => {
  if (kjvDataCache) {
    return kjvDataCache;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = import('../assets/kjv.json')
    .then((module) => {
      kjvDataCache = module.default as KjvBook[];
      loadingPromise = null;
      return kjvDataCache;
    })
    .catch((error) => {
      loadingPromise = null;
      // The kjv.json chunk is a hashed asset too — a stale tab
      // after a deploy 404s it exactly like a lazy component.
      // A guarded reload fetches the fresh index.html; the
      // never-settling promise keeps callers suspended while
      // the reload tears the page down. Once the guard fired,
      // fall through to the normal error below.
      if (isChunkLoadError(error) && reloadForStaleChunk()) {
        return new Promise<KjvBook[]>(() => {
          // Never settles — the reload replaces this page.
        });
      }
      console.error('Failed to load KJV data:', error);
      throw new Error('Failed to load KJV Bible data');
    });

  return loadingPromise;
};

/**
 * Check if KJV data is already loaded
 */
export const isKjvDataLoaded = (): boolean => {
  return kjvDataCache !== null;
};

/**
 * Clear KJV data from cache (useful for testing)
 */
export const clearKjvDataCache = (): void => {
  kjvDataCache = null;
  loadingPromise = null;
};
