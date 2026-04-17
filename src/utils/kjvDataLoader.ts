import { KjvBook } from '../api';

let kjvDataCache: KjvBook[] | null = null;
let loadingPromise: Promise<KjvBook[]> | null = null;

/**
 * Lazy load KJV data using dynamic import
 * Returns cached data if already loaded
 */
export const loadKjvData = async (): Promise<KjvBook[]> => {
  // Return cached data if available
  if (kjvDataCache) {
    console.log('✅ KJV data loaded from memory cache');
    return kjvDataCache;
  }

  // Return existing loading promise if already loading
  if (loadingPromise) {
    console.log('⏳ KJV data already loading, waiting...');
    return loadingPromise;
  }

  // Start loading
  console.log('📥 Loading KJV data (6.8MB)...');
  loadingPromise = import('../assets/kjv.json')
    .then((module) => {
      kjvDataCache = module.default as KjvBook[];
      loadingPromise = null;
      console.log('✅ KJV data loaded successfully');
      return kjvDataCache;
    })
    .catch((error) => {
      loadingPromise = null;
      console.error('❌ Failed to load KJV data:', error);
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
  console.log('🗑️ KJV data cache cleared');
};
