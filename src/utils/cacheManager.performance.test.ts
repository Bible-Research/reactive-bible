import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  cacheVerses,
  getCachedVerses,
  clearVerseCache,
  getCacheStats,
  cacheAudioUrl,
  getCachedAudioUrl,
  clearAudioCache,
} from './cacheManager';
import { CacheMetrics } from '../__tests__/helpers/performance';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

global.localStorage = localStorageMock as any;

describe('CacheManager Performance Tests', () => {
  let metrics: CacheMetrics;

  beforeEach(() => {
    localStorage.clear();
    clearVerseCache();
    clearAudioCache();
    metrics = new CacheMetrics();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Cache Hit Rate', () => {
    it('should achieve high hit rate with repeated access', () => {
      // Populate cache with 10 chapters
      for (let chapter = 1; chapter <= 10; chapter++) {
        const verses = Array.from({ length: 10 }, (_, i) => ({
          verse: i + 1,
          text: `Verse ${i + 1} text`,
        }));
        cacheVerses('Genesis', chapter, 'KJV', verses);
      }

      // Access items multiple times (simulating real usage)
      for (let iteration = 0; iteration < 10; iteration++) {
        for (let chapter = 1; chapter <= 10; chapter++) {
          const result = getCachedVerses('Genesis', chapter, 'KJV');
          if (result !== null) {
            metrics.recordHit();
          } else {
            metrics.recordMiss();
          }
        }
      }

      const stats = metrics.getStats();
      expect(stats.hitRate).toBeGreaterThan(0.95); // 95%+ hit rate
      expect(stats.hits).toBe(100); // All 100 accesses should hit
      expect(stats.misses).toBe(0);
    });

    it('should handle cache misses correctly', () => {
      // Populate cache with chapters 1-10
      for (let chapter = 1; chapter <= 10; chapter++) {
        const verses = [{ verse: 1, text: 'Test verse' }];
        cacheVerses('Genesis', chapter, 'KJV', verses);
      }

      // Try to access non-existent chapters
      for (let chapter = 11; chapter <= 20; chapter++) {
        const result = getCachedVerses('Genesis', chapter, 'KJV');
        if (result !== null) {
          metrics.recordHit();
        } else {
          metrics.recordMiss();
        }
      }

      const stats = metrics.getStats();
      expect(stats.hitRate).toBe(0); // 0% hit rate for non-existent
      expect(stats.misses).toBe(10);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used verses when exceeding 500 limit', () => {
      // Cache 500 verses (fill to limit)
      for (let chapter = 1; chapter <= 50; chapter++) {
        const verses = Array.from({ length: 10 }, (_, i) => ({
          verse: i + 1,
          text: `Verse ${i + 1}`,
        }));
        cacheVerses('Genesis', chapter, 'KJV', verses);
      }

      const stats = getCacheStats();
      expect(stats.verses.total).toBe(500);

      // Add more verses (should trigger eviction)
      const newVerses = Array.from({ length: 10 }, (_, i) => ({
        verse: i + 1,
        text: `New verse ${i + 1}`,
      }));
      cacheVerses('Exodus', 1, 'KJV', newVerses);

      // Total should still be at or below limit
      const newStats = getCacheStats();
      expect(newStats.verses.total).toBeLessThanOrEqual(500);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should handle large number of cache operations efficiently', () => {
      const iterations = 100;
      const start = performance.now();

      // Perform many cache operations
      for (let i = 0; i < iterations; i++) {
        const chapter = (i % 10) + 1;
        const verses = [{ verse: 1, text: `Verse ${i}` }];
        cacheVerses('Genesis', chapter, 'KJV', verses);
        getCachedVerses('Genesis', chapter, 'KJV');
      }

      const end = performance.now();
      const duration = end - start;

      // Should complete in reasonable time (< 1000ms)
      expect(duration).toBeLessThan(1000);

      console.log(
        `Cache performance: ${iterations} ops in ${duration.toFixed(2)}ms`
      );
    });

    it('should handle audio cache efficiently', () => {
      const iterations = 100;
      const start = performance.now();

      // Cache and retrieve audio URLs
      for (let i = 0; i < iterations; i++) {
        const chapter = (i % 10) + 1;
        cacheAudioUrl(
          'Genesis',
          chapter,
          'KJV',
          `http://example.com/audio-${i}.mp3`
        );
        getCachedAudioUrl('Genesis', chapter, 'KJV');
      }

      const end = performance.now();
      const duration = end - start;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(500);

      console.log(
        `Audio cache performance: ${iterations} ops in ${duration.toFixed(2)}ms`
      );
    });
  });

  describe('Memory Efficiency', () => {
    it('should respect 500 verse limit', () => {
      // Add more verses than the limit
      for (let chapter = 1; chapter <= 60; chapter++) {
        const verses = Array.from({ length: 10 }, (_, i) => ({
          verse: i + 1,
          text: `Verse ${i + 1}`,
        }));
        cacheVerses('Genesis', chapter, 'KJV', verses);
      }

      const stats = getCacheStats();

      // Should not exceed 500 verses
      expect(stats.verses.total).toBeLessThanOrEqual(500);
      expect(stats.verses.percentage).toBeLessThanOrEqual(100);

      console.log(
        `Cache usage: ${stats.verses.usage} (${stats.verses.percentage.toFixed(1)}%)`
      );
    });

    it('should provide accurate cache statistics', () => {
      // Add some verses
      for (let chapter = 1; chapter <= 5; chapter++) {
        const verses = [{ verse: 1, text: 'Test' }];
        cacheVerses('Genesis', chapter, 'KJV', verses);
      }

      // Add some audio
      for (let chapter = 1; chapter <= 3; chapter++) {
        cacheAudioUrl(
          'Genesis',
          chapter,
          'KJV',
          'http://example.com/audio.mp3'
        );
      }

      const stats = getCacheStats();

      expect(stats.verses.total).toBeGreaterThan(0);
      expect(stats.audio.total).toBe(3);
      expect(stats.verses.limit).toBe(500);
    });
  });
});
