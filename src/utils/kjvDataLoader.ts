import type { KjvBook } from '../api';

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
