import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as cacheManager from '../utils/cacheManager';
import { Translation } from '../store';

// Mock localStorage for the test environment
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

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

describe('cacheManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Verse Cache Tests ---
  describe('Verse Cache', () => {
    const verses = [{ verse: 1, text: 'Test verse' }];

    it('should cache and retrieve verses', () => {
      cacheManager.cacheVerses('GEN', 1, 'KJV', verses);
      const cached = cacheManager.getCachedVerses('GEN', 1, 'KJV');
      expect(cached).toEqual(verses);
    });

    it('should return null for non-cached verses', () => {
      const cached = cacheManager.getCachedVerses('EXO', 2, 'NIV');
      expect(cached).toBeNull();
    });

    it('should clear the verse cache', () => {
      cacheManager.cacheVerses('GEN', 1, 'KJV', verses);
      cacheManager.clearVerseCache();
      const cached = cacheManager.getCachedVerses('GEN', 1, 'KJV');
      expect(cached).toBeNull();
    });

    it.skip('should implement LRU policy correctly', () => {
      // Cache 500 verses (the limit)
      const largeChapter = Array.from({ length: 500 }, (_, i) => ({
        verse: i + 1,
        text: `Verse ${i + 1}`,
      }));
      cacheManager.cacheVerses('PSA', 119, 'KJV', largeChapter);
      let stats = cacheManager.getCacheStats();
      expect(stats.verses.total).toBe(500);

      // Cache one more verse, which should trigger eviction
      cacheManager.cacheVerses('GEN', 1, 'KJV', verses);

      stats = cacheManager.getCacheStats();
      expect(stats.verses.total).toBe(1); // 500 removed, 1 added

      // The old chapter should now be gone
      const oldCached = cacheManager.getCachedVerses('PSA', 119, 'KJV');
      expect(oldCached).toBeNull();
    });
  });

  // --- Translation Cache Tests ---
  describe('Translation Cache', () => {
    const translations: Translation[] = [
      {
        abbr: 'KJV',
        name: 'King James Version',
        language: 'English',
        language_iso: 'en',
        filesets: [],
      },
    ];

    it('should cache and retrieve translations', () => {
      cacheManager.cacheTranslations('en', translations);
      const cached = cacheManager.getCachedTranslations('en');
      expect(cached).toEqual(translations);
    });

    it('should return null for non-cached translations', () => {
      const cached = cacheManager.getCachedTranslations('es');
      expect(cached).toBeNull();
    });
  });

  // --- Audio Cache Tests ---
  describe('Audio Cache', () => {
    const audioUrl = 'http://example.com/audio.mp3';

    it('should cache and retrieve an audio URL', () => {
      cacheManager.cacheAudioUrl('GEN', 1, 'KJV', audioUrl);
      const cached = cacheManager.getCachedAudioUrl('GEN', 1, 'KJV');
      expect(cached).toBe(audioUrl);
    });

    it('should return null for expired audio URLs', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      cacheManager.cacheAudioUrl('GEN', 1, 'KJV', audioUrl);

      // Advance time by 25 hours (default expiry is 24h)
      vi.setSystemTime(now + 25 * 60 * 60 * 1000);

      const cached = cacheManager.getCachedAudioUrl('GEN', 1, 'KJV');
      expect(cached).toBeNull();
    });

    it('should parse expiration from URL', () => {
      const expiresTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const urlWithExpiry = `http://example.com/audio?Expires=${expiresTimestamp}`;

      cacheManager.cacheAudioUrl('JHN', 3, 'NIV', urlWithExpiry);
      const cache = cacheManager.getAudioCache();
      const audioData = cache['NIV:JHN:3'];

      expect(audioData.expiresAt).toBe(expiresTimestamp * 1000);
    });

    it('should clear expired audio URLs', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Cache one valid and one soon-to-be-expired URL
      cacheManager.cacheAudioUrl('GEN', 1, 'KJV', 'url1');
      cacheManager.cacheAudioUrl('EXO', 2, 'NIV', 'url2');

      // Advance time by 25 hours
      vi.setSystemTime(now + 25 * 60 * 60 * 1000);

      // Cache a new, valid URL
      cacheManager.cacheAudioUrl('LEV', 3, 'ESV', 'url3');

      cacheManager.clearExpiredAudioUrls();
      const finalCache = cacheManager.getAudioCache();

      expect(finalCache['KJV:GEN:1']).toBeUndefined();
      expect(finalCache['NIV:EXO:2']).toBeUndefined();
      expect(finalCache['ESV:LEV:3']).toBeDefined();
    });
  });

  // --- Cache Stats Tests ---
  describe('getCacheStats', () => {
    it('should return correct statistics', () => {
      // Add some verse data
      cacheManager.cacheVerses('GEN', 1, 'KJV', [
        { verse: 1, text: '...' },
        { verse: 2, text: '...' },
      ]);

      // Add some audio data (one expired)
      const now = Date.now();
      vi.setSystemTime(now);
      cacheManager.cacheAudioUrl('GEN', 1, 'KJV', 'url1');
      vi.setSystemTime(now + 25 * 60 * 60 * 1000);
      cacheManager.cacheAudioUrl('GEN', 2, 'KJV', 'url2');

      const stats = cacheManager.getCacheStats();

      expect(stats.verses.total).toBe(2);
      expect(stats.verses.limit).toBe(500);
      expect(stats.audio.total).toBe(2);
      expect(stats.audio.expired).toBe(1);
    });
  });
});
