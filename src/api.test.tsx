import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getVersesFromApi,
  addTagNote,
  editNote,
  getTags,
  getAvailableTranslations,
} from './api';

// Mock the global fetch function
global.fetch = vi.fn();

describe('API Functions', () => {
  beforeEach(() => {
    (fetch as vi.Mock).mockClear();
  });

  describe('getVersesFromApi', () => {
    it('should fetch and return verses', async () => {
      const mockVerses = { verses: [{ verse: 1, text: 'Test verse' }] };
      (fetch as vi.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockVerses),
      });

      const verses = await getVersesFromApi('GEN', 1, 'ESV');
      expect(verses).toEqual(mockVerses.verses);
      expect(fetch).toHaveBeenCalledWith('https://bibleresearchapi.vercel.app/api/v1/bible?passage=GEN%201&fileset_id=ESV');
    });
  });

  describe('addTagNote', () => {
    it('should send a POST request to add a note', async () => {
      const mockResponse = { id: '1', note_text: 'New note' };
      (fetch as vi.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const verseReferences = [{ book: 'GEN', chapter: 1, verse: 1 }];
      const response = await addTagNote('tag1', 'New note', verseReferences);

      expect(response).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith('https://bibleresearchapi.vercel.app/api/v1/notes/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: 'tag1', note_text: 'New note', verse_references: verseReferences }),
      });
    });
  });

  describe('editNote', () => {
    it('should send a PATCH request to edit a note', async () => {
      const mockResponse = { id: 'note1', note_text: 'Updated note' };
      (fetch as vi.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const response = await editNote('note1', 'tag1', 'Updated note');

      expect(response).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith('https://bibleresearchapi.vercel.app/api/v1/notes/note1/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: 'tag1', note_text: 'Updated note' }),
      });
    });
  });

  describe('getTags', () => {
    it('should fetch and return tags', async () => {
      const mockTags = [{ id: '1', name: 'Faith' }];
      (fetch as vi.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTags),
      });

      const tags = await getTags();
      expect(tags).toEqual(mockTags);
      expect(fetch).toHaveBeenCalledWith('https://bibleresearchapi.vercel.app/api/v1/tags/');
    });
  });

  describe('getAvailableTranslations', () => {
    it('should fetch and return translations', async () => {
      const mockTranslations = { results: [{ abbr: 'ESV', name: 'English Standard Version' }] };
      (fetch as vi.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTranslations),
      });

      const translations = await getAvailableTranslations('eng');
      expect(translations).toEqual(mockTranslations.results);
      expect(fetch).toHaveBeenCalledWith('https://bibleresearchapi.vercel.app/api/v1/bible/translations/?language_iso=eng');
    });
  });
});
