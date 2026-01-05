import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  cacheVerses,
  getCachedVerses,
  clearVerseCache,
  getVerseCacheMetadata,
} from './cacheManager';

// Mock localStorage
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('Verse Cache Manager', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.useFakeTimers();
  });

  it('should cache and retrieve verses', () => {
    const verses = [{ verse: 1, text: 'Test verse' }];
    cacheVerses('GEN', 1, 'KJV', verses);

    const cached = getCachedVerses('GEN', 1, 'KJV');
    expect(cached).toEqual(verses);
  });

  it('should return null for non-cached verses', () => {
    const cached = getCachedVerses('EXO', 2, 'ESV');
    expect(cached).toBeNull();
  });

  it('should enforce LRU eviction policy', () => {
    // Cache 501 verses to trigger eviction
    for (let i = 1; i <= 501; i++) {
      cacheVerses('BOOK', i, 'KJV', [{ verse: 1, text: `Verse ${i}` }]);
    }

    const metadata = getVerseCacheMetadata();
    expect(metadata.totalVerses).toBe(500);

    // The first verse should be evicted
    const oldestCached = getCachedVerses('BOOK', 1, 'KJV');
    expect(oldestCached).toBeNull();

    // The newest verse should still be in the cache
    const newestCached = getCachedVerses('BOOK', 501, 'KJV');
    expect(newestCached).toEqual([{ verse: 1, text: 'Verse 501' }]);
  });

  it('should update access count and timestamp on cache hit', () => {
    const verses = [{ verse: 1, text: 'Test verse' }];
    cacheVerses('GEN', 1, 'KJV', verses);

    // Initial access
    getCachedVerses('GEN', 1, 'KJV');
    let metadata = getVerseCacheMetadata();
    expect(metadata.lruQueue[metadata.lruQueue.length - 1]).toBe('KJV:GEN:1:1');

    // Second access
    vi.advanceTimersByTime(1000);
    getCachedVerses('GEN', 1, 'KJV');
    metadata = getVerseCacheMetadata();
    expect(metadata.lruQueue[metadata.lruQueue.length - 1]).toBe('KJV:GEN:1:1');
  });

  it('should clear the verse cache', () => {
    const verses = [{ verse: 1, text: 'Test verse' }];
    cacheVerses('GEN', 1, 'KJV', verses);
    clearVerseCache();
    const cached = getCachedVerses('GEN', 1, 'KJV');
    expect(cached).toBeNull();
  });
});
