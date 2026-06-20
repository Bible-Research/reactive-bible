import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as api from './api';
import * as cacheManager from './utils/cacheManager';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';

const API_URL = 'https://bible-research-489314.ey.r.appspot.com/api/v1';
const COMMENT_BASE = `${API_URL}`;

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
      const result = api.getVersesInKjvChapter('John', 3);
      expect(result.verses.length).toBe(36);
      expect(result.verses[15].text).toContain('For God so loved the world');
      expect(result.headings).toEqual([]);
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
      const mockVerses = [{ verse: 16, text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' }];
      const result = await api.getVersesFromApi('Genesis', 1, 'ESV');

      expect(cacheManager.getCachedVerses).toHaveBeenCalledWith('Genesis', 1, 'ESV');
      expect(cacheManager.cacheVerses).toHaveBeenCalledWith('Genesis', 1, 'ESV', mockVerses);
      expect(result.verses).toEqual(mockVerses);
      expect(result.headings).toEqual([]);
    });

    it('getVersesFromApi should return from cache when available', async () => {
      const mockVerses = [{ verse: 1, text: 'Cached verse' }];
      vi.spyOn(cacheManager, 'getCachedVerses').mockReturnValue(mockVerses);

      const result = await api.getVersesFromApi('Genesis', 1, 'ESV');

      expect(result.verses).toEqual(mockVerses);
      expect(result.headings).toEqual([]);
    });

    it('getBibleAudioUrl should fetch from API when not cached', async () => {
      const mockUrl = 'http://audio.url/test.mp3';
      const url = await api.getBibleAudioUrl('Genesis', 1, 'ESVDA');

      expect(cacheManager.getCachedAudioUrl).toHaveBeenCalledWith('Genesis', 1, 'ESVDA');
      expect(cacheManager.cacheAudioUrl).toHaveBeenCalledWith('Genesis', 1, 'ESVDA', mockUrl, 0, 0);
      expect(url).toBe(mockUrl);
    });

    it.skip('addTagNote should make a POST request with the correct body', async () => {
      const verseRefs = [{ book: 'John', chapter: 3, verse: 16 }];
      const result = await api.addTagNote('tag1', 'My note', verseRefs);
      expect(result.id).toBe('note-1');
      expect(result.note_text).toBe('My note');
    });

    it('should throw an error if the fetch response is not ok', async () => {
      // Use a specific handler that returns 404 for a specific fileset
      server.use(
        http.get(`${API_URL}/bible`, ({ request }) => {
          const url = new URL(request.url);
          const filesetId = url.searchParams.get('fileset_id');

          // Only return 404 for this specific test case
          if (filesetId === 'ERRORTEST') {
            return new HttpResponse(null, { status: 404, statusText: 'Not Found' });
          }

          // Let other requests pass through to default handler
          return;
        })
      );

      // Clear the cache to ensure the API is actually called
      localStorage.clear();

      await expect(api.getBibleAudioUrl('Genesis', 1, 'ERRORTEST')).rejects.toThrow(
        'Failed to fetch audio for ERRORTEST: Not Found'
      );
    });

    it.skip('should make a DELETE request with note id', async () => {
      const removeNote = await api.deleteNote('abc-123');
      expect(removeNote).toBe('Deleted');
    });
  });

  describe('fetchCommentCounts', () => {
    it('chunks requests when noteIds exceeds 200', async () => {
      const noteIds = Array.from(
        { length: 201 },
        (_, i) => `n${i}`
      );
      const result = await api.fetchCommentCounts({ noteIds });
      expect(Object.keys(result).length).toBe(201);
      noteIds.forEach((id) => {
        expect(result[id]).toBe(1);
      });
    });

    it('uses tag_id only and ignores noteIds when tagId is set', async () => {
      let capturedUrl: string | undefined;
      let callCount = 0;
      server.use(
        http.get(
          `${COMMENT_BASE}/comments/counts/`,
          ({ request }) => {
            capturedUrl = request.url;
            callCount++;
            return HttpResponse.json({ counts: { 'note-x': 5 } });
          }
        )
      );
      const noteIds = Array.from(
        { length: 201 },
        (_, i) => `n${i}`
      );
      const result = await api.fetchCommentCounts({
        tagId: 'tag-1',
        noteIds,
      });
      expect(result).toEqual({ 'note-x': 5 });
      expect(callCount).toBe(1);
      const url = new URL(capturedUrl!);
      expect(url.searchParams.get('tag_id')).toBe('tag-1');
      expect(url.searchParams.has('note_ids')).toBe(false);
    });
  });

  describe('getAvailableTranslations', () => {
    const cached = [
      {
        abbr: 'KJV',
        name: 'King James Version',
        language: 'English',
        language_iso: 'eng',
        filesets: [{ id: 'ENGKJV', type: 'text_plain', size: 'NT' }],
      },
    ];

    const fresh = [
      ...cached,
      {
        abbr: 'NIV',
        name: 'New International Version',
        language: 'English',
        language_iso: 'eng',
        filesets: [{ id: 'ENGNIV', type: 'text_plain', size: 'C' }],
      },
    ];

    beforeEach(() => {
      vi.spyOn(cacheManager, 'getCachedTranslations');
      vi.spyOn(cacheManager, 'cacheTranslations');
    });

    it('returns cached translations without hitting API', async () => {
      vi.spyOn(cacheManager, 'getCachedTranslations')
        .mockReturnValue(cached as any);
      const fetchSpy = vi.spyOn(global, 'fetch');

      const result = await api.getAvailableTranslations('eng');

      expect(result).toEqual(cached);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('bypasses cache when forceRefresh=true and updates cache', async () => {
      vi.spyOn(cacheManager, 'getCachedTranslations')
        .mockReturnValue(cached as any);
      server.use(
        http.get(
          `${API_URL}/bible/translations/`,
          () => HttpResponse.json({ results: fresh })
        )
      );

      const result = await api.getAvailableTranslations('eng', true);

      expect(result).toEqual(fresh);
      expect(cacheManager.cacheTranslations)
        .toHaveBeenCalledWith('eng', fresh);
    });
  });
});
