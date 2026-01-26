import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as api from './api';
import * as cacheManager from './utils/cacheManager';

// Mock the global fetch API
global.fetch = vi.fn();

describe('API Functions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Spy on cache functions to track their calls
    vi.spyOn(cacheManager, 'getCachedVerses');
    vi.spyOn(cacheManager, 'cacheVerses');
    vi.spyOn(cacheManager, 'getCachedAudioUrl');
    vi.spyOn(cacheManager, 'cacheAudioUrl');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Local Data Functions ---
  describe('Local Data Functions', () => {
    it('getBooks should return a list of all books', () => {
      const books = api.getBooks();
      expect(books.length).toBe(66);
      expect(books[0].book_name).toBe('Genesis');
      expect(books[65].book_name).toBe('Revelation');
    });

    it('getChapters should return the correct number of chapters for a book', () => {
      const chapters = api.getChapters('Genesis');
      expect(chapters.length).toBe(50);
    });

    it('getVersesInKjvChapter should return all verses for a given chapter', () => {
      const verses = api.getVersesInKjvChapter('John', 3);
      expect(verses.length).toBe(36);
      expect(verses[15].text).toContain('For God so loved the world');
    });

    it('getAdjacentChapters should return correct previous and next chapters', () => {
      const adjacent = api.getAdjacentChapters('John', 1);
      expect(adjacent.previous).toEqual({ book: 'Luke', chapter: 24 });
      expect(adjacent.next).toEqual({ book: 'John', chapter: 2 });
    });
  });

  // --- API-Calling Functions ---
  describe('API-Calling Functions', () => {
    it('getVersesFromApi should fetch from API when not cached', async () => {
      const mockVerses = [{ verse: 1, text: 'In the beginning...' }];
      (fetch as vi.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ verses: mockVerses }),
      });

      const verses = await api.getVersesFromApi('Genesis', 1, 'ESV');

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('passage=Genesis%201'));
      expect(cacheManager.getCachedVerses).toHaveBeenCalledWith('Genesis', 1, 'ESV');
      expect(cacheManager.cacheVerses).toHaveBeenCalledWith('Genesis', 1, 'ESV', mockVerses);
      expect(verses).toEqual(mockVerses);
    });

    it('getVersesFromApi should return from cache when available', async () => {
      const mockVerses = [{ verse: 1, text: 'Cached verse' }];
      vi.spyOn(cacheManager, 'getCachedVerses').mockReturnValue(mockVerses);

      const verses = await api.getVersesFromApi('Genesis', 1, 'ESV');

      expect(fetch).not.toHaveBeenCalled();
      expect(verses).toEqual(mockVerses);
    });

    it('getBibleAudioUrl should fetch from API when not cached', async () => {
      const mockUrl = 'http://audio.url/test.mp3';
      (fetch as vi.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ audio_url: mockUrl }),
      });

      const url = await api.getBibleAudioUrl('Genesis', 1, 'ESV');

      expect(fetch).toHaveBeenCalled();
      expect(cacheManager.getCachedAudioUrl).toHaveBeenCalledWith('Genesis', 1, 'ESV');
      expect(cacheManager.cacheAudioUrl).toHaveBeenCalledWith('Genesis', 1, 'ESV', mockUrl, 0, 0);
      expect(url).toBe(mockUrl);
    });

    it('addTagNote should make a POST request with the correct body', async () => {
      (fetch as vi.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
      const verseRefs = [{ book: 'John', chapter: 3, verse: 16 }];

      await api.addTagNote('tag1', 'My note', verseRefs);

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/notes/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: 'tag1', note_text: 'My note', verse_references: verseRefs }),
      });
    });

    it.skip('should throw an error if the fetch response is not ok', async () => {
      // Provide a specific failing mock for this test
      (fetch as vi.Mock).mockResolvedValueOnce({ ok: false, statusText: 'Not Found' });

      await expect(api.getBibleAudioUrl('Genesis', 1, 'ESV')).rejects.toThrow(
        'Failed to fetch audio for ESV: Not Found'
      );
    });
  });
});
