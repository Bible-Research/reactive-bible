import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useBibleStore, initialState } from './store';
import { useAuthStore } from './stores/authStore';
import * as api from './api';
import * as cacheManager from './utils/cacheManager';
import { Note, Tag } from './types';

// Mock dependencies
vi.mock('./api');
vi.mock('./utils/cacheManager');

const mockApi = vi.mocked(api);
const mockCacheManager = vi.mocked(cacheManager);

describe('useBibleStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useBibleStore.setState(initialState);
    vi.clearAllMocks();
  });

  describe('lastSelectedTagId', () => {
    it('should have a default lastSelectedTagId of null', () => {
      const lastSelectedTagId = useBibleStore.getState().lastSelectedTagId;
      expect(lastSelectedTagId).toBeNull();
    });

    it('should update lastSelectedTagId using setLastSelectedTagId', () => {
      useBibleStore.getState().setLastSelectedTagId('tag123');
      const lastSelectedTagId = useBibleStore.getState().lastSelectedTagId;
      expect(lastSelectedTagId).toBe('tag123');
    });
  });

  describe('fetchNotes with caching', () => {
    const tag: Tag = {
      id: 'TAG1', name: 'Test Tag', parent_tag: null,
      created_at: '', updated_at: '',
    };
    const sampleNotes: Note[] = [{
      id: 'note1', note_text: 'Cached note', tag, verses: [],
      public: false, is_owner: true, created_at: '',
      updated_at: '', tag_position: null,
    }];

    it('should fetch notes from cache if available', async () => {
      mockCacheManager.getCachedNotes.mockReturnValue({
        notes: sampleNotes,
        timestamp: Date.now(),
        count: 1,
        hasMore: false,
      });

      await useBibleStore.getState().fetchNotes('TAG1');

      expect(mockCacheManager.getCachedNotes).toHaveBeenCalledWith(
        'TAG1',
        1,
        undefined
      );
      expect(mockApi.getNotes).not.toHaveBeenCalled();
      expect(useBibleStore.getState().notes).toEqual(sampleNotes);
    });

    it('should fetch notes from API if not in cache', async () => {
      mockCacheManager.getCachedNotes.mockReturnValue(null);
      mockApi.getNotes.mockResolvedValue({
        count: 1,
        next: null,
        previous: null,
        results: sampleNotes,
      });

      await useBibleStore.getState().fetchNotes('TAG1');

      expect(mockCacheManager.getCachedNotes).toHaveBeenCalledWith(
        'TAG1',
        1,
        undefined
      );
      expect(mockApi.getNotes).toHaveBeenCalledWith('TAG1', {
        ordering: undefined,
        page: 1,
        pageSize: 25,
        filesetId: 'ENGESV_API',
      });
      expect(mockCacheManager.cacheNotes).toHaveBeenCalledWith(
        'TAG1',
        sampleNotes,
        { count: 1, hasMore: false, page: 1, ordering: undefined }
      );
      expect(useBibleStore.getState().notes).toEqual(sampleNotes);
    });
  });

  describe('deleteNote with cache clearing', () => {
    it('should call clearNotesCache when a note is deleted', async () => {
      mockApi.deleteNote.mockResolvedValue('');
      // Pre-fill state with a note
      useBibleStore.setState({ 
        notes: [{ 
          id: 'note1', 
          note_text: 'A note', 
          tag: {
            id: 't1', name: 't1', parent_tag: null,
            created_at: '', updated_at: '',
          },
          verses: [], 
          public: false, 
          is_owner: true,
          created_at: '', 
          updated_at: '',
          tag_position: null
        }] 
      });

      await useBibleStore.getState().deleteNote('note1');

      expect(mockApi.deleteNote).toHaveBeenCalledWith('note1');
      expect(mockCacheManager.clearNotesCache).toHaveBeenCalled();
      expect(useBibleStore.getState().notes).toEqual([]);
    });
  });

  describe('setActiveBookWithPosition', () => {
    beforeEach(() => {
      useAuthStore.setState({ isAuthenticated: false });
    });

    it('restores the saved chapter when switching books', async () => {
      useAuthStore.setState({ isAuthenticated: true });
      mockApi.getReadingPosition.mockResolvedValue({
        id: 'RDP1',
        book: 'Mark',
        chapter: 5,
        verse: 16,
        last_accessed: '2026-01-01T00:00:00Z',
      });

      await useBibleStore.getState().setActiveBookWithPosition('MRK');

      const state = useBibleStore.getState();
      expect(mockApi.getReadingPosition)
        .toHaveBeenCalledWith('MRK');
      expect(state.activeBookId).toBe('MRK');
      expect(state.activeChapter).toBe(5);
      // Restoring a position must not select a verse (that would
      // pop up the VerseActionToolbar unprompted).
      expect(state.verseSelection).toBeNull();
      // Verse > 1 is queued for scroll restoration.
      expect(state.pendingScrollVerse).toEqual({
        bookId: 'MRK',
        chapter: 5,
        verse: 16,
      });
      expect(state.readingPositions.MRK).toEqual({
        chapter: 5,
        verse: 16,
      });
    });

    it('uses the cached position without an API call', async () => {
      useAuthStore.setState({ isAuthenticated: true });
      useBibleStore.setState({
        readingPositions: { MRK: { chapter: 2, verse: 1 } },
      });

      await useBibleStore.getState().setActiveBookWithPosition('MRK');

      expect(mockApi.getReadingPosition).not.toHaveBeenCalled();
      expect(useBibleStore.getState().activeChapter).toBe(2);
      expect(useBibleStore.getState().pendingScrollVerse).toBeNull();
    });

    it('does not fetch a position when unauthenticated', async () => {
      await useBibleStore.getState().setActiveBookWithPosition('MRK');

      expect(mockApi.getReadingPosition).not.toHaveBeenCalled();
      expect(useBibleStore.getState().activeBookId).toBe('MRK');
      expect(useBibleStore.getState().activeChapter).toBe(1);
    });

    it('syncs only locally when unauthenticated', async () => {
      useBibleStore.getState().syncReadingPosition('MRK', 3, 7);

      const state = useBibleStore.getState();
      expect(state.readingPositions.MRK).toEqual({
        chapter: 3,
        verse: 7,
      });
      expect(mockApi.updateReadingPosition).not.toHaveBeenCalled();
    });

    it('pushes position updates to the API when authenticated',
      async () => {
        useAuthStore.setState({ isAuthenticated: true });

        useBibleStore.getState().syncReadingPosition('MRK', 3, 7);

        expect(mockApi.updateReadingPosition)
          .toHaveBeenCalledWith('MRK', 3, 7);
      });
  });
});
