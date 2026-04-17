import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as api from './api';
import * as cacheManager from './utils/cacheManager';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import * as kjvDataLoader from './utils/kjvDataLoader';

// Mock the KJV data loader

const API_URL = 'https://bible-research-489314.ey.r.appspot.com/api/v1';

describe('API Functions', () => {
  beforeEach(() => {
    // Reset mocks and clear API module caches before each test
    vi.resetAllMocks();
    api.clearBooksCache();
    api.clearPassageCache();

    // Mock dependencies
    vi.spyOn(kjvDataLoader, 'loadKjvData').mockResolvedValue([
      { chapter: 1, verse: 1, text: 'Test verse', book_name: 'Genesis', book_id: 'Gen', translation_id: 'KJV' },
    ]);
    vi.spyOn(cacheManager, 'getCachedVerses').mockReturnValue(null);
    vi.spyOn(cacheManager, 'cacheVerses');
    vi.spyOn(cacheManager, 'getCachedAudioUrl').mockReturnValue(null);
    vi.spyOn(cacheManager, 'cacheAudioUrl');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Lazy Loading', () => {
    it('getBooks should NOT load KJV data if API succeeds', async () => {
      await api.getBooks();
      expect(kjvDataLoader.loadKjvData).not.toHaveBeenCalled();
    });

    it('getBooks SHOULD load KJV data if API fails', async () => {
      server.use(
        http.get(`${API_URL}/bible/books/`, () => new HttpResponse(null, { status: 500 }))
      );
      await api.getBooks();
      expect(kjvDataLoader.loadKjvData).toHaveBeenCalled();
    });
  });

  describe('Navigation Functions', () => {
    it('getBooks should return books from API', async () => {
      const books = await api.getBooks();
      expect(books.length).toBeGreaterThan(0);
      expect(books[0].book_name).toBe('Genesis');
    });

    it('getVersesInKjvChapter should lazy load KJV data', async () => {
      const verses = await api.getVersesInKjvChapter('Genesis', 1);
      expect(kjvDataLoader.loadKjvData).toHaveBeenCalled();
      expect(verses).toEqual([{
        "text": "Test verse",
        "verse": 1,
      }]);
    });
  });

  // --- API-Calling Functions ---
  describe('API-Calling Functions', () => {
    it('getVersesFromApi should fetch from API when not cached', async () => {
      const mockVerses = [{ verse: 16, text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' }];
      const verses = await api.getVersesFromApi('Genesis', 1, 'ESV');

      expect(cacheManager.getCachedVerses).toHaveBeenCalledWith('Genesis', 1, 'ESV');
      expect(cacheManager.cacheVerses).toHaveBeenCalledWith('Genesis', 1, 'ESV', mockVerses);
      expect(verses).toEqual(mockVerses);
    });

    it('getVersesFromApi should return from cache when available', async () => {
      const mockVerses = [{ verse: 1, text: 'Cached verse' }];
      vi.spyOn(cacheManager, 'getCachedVerses').mockReturnValue(mockVerses);

      const verses = await api.getVersesFromApi('Genesis', 1, 'ESV');

      expect(verses).toEqual(mockVerses);
    });

    it('getBibleAudioUrl should fetch from API when not cached', async () => {
      const mockUrl = 'http://audio.url/test.mp3';
      const url = await api.getBibleAudioUrl('Genesis', 1, 'ESVDA');

      expect(cacheManager.getCachedAudioUrl).toHaveBeenCalledWith('Genesis', 1, 'ESVDA');
      expect(cacheManager.cacheAudioUrl).toHaveBeenCalledWith('Genesis', 1, 'ESVDA', mockUrl, 0, 0);
      expect(url).toBe(mockUrl);
    });

    it('addTagNote should make a POST request with the correct body', async () => {
      const verseRefs = [{ book: 'John', chapter: 3, verse: 16 }];
      const result = await api.addTagNote('tag1', 'My note', verseRefs);
      expect(result.id).toBe('note-1');
      expect(result.note_text).toBe('My note');
    });

    it('should throw an error if the fetch response is not ok', async () => {
      server.use(
        http.get(`${API_URL}/bible`, ({ request }) => {
          const url = new URL(request.url);
          const filesetId = url.searchParams.get('fileset_id');
          if (filesetId === 'ERRORTEST') {
            return new HttpResponse(null, { status: 404, statusText: 'Not Found' });
          }
          return;
        })
      );
      localStorage.clear();
      await expect(api.getBibleAudioUrl('Genesis', 1, 'ERRORTEST')).rejects.toThrow(
        'Failed to fetch audio for ERRORTEST: Not Found'
      );
    });

    it('should make a DELETE request with note id', async () => {
      const removeNote = await api.deleteNote('abc-123');
      expect(removeNote).toBe('Deleted');
    });
  });
});
