import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useBibleStore, initialState } from './store';
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
    const tag: Tag = { id: 'TAG1', name: 'Test Tag', parent_tag: null, created_at: '', updated_at: '' };
    const sampleNotes: Note[] = [{ id: 'note1', note_text: 'Cached note', tag, verses: [], public: false, created_at: '', updated_at: '' }];

    it('should fetch notes from cache if available', async () => {
      mockCacheManager.getCachedNotes.mockReturnValue(sampleNotes);

      await useBibleStore.getState().fetchNotes('TAG1');

      expect(mockCacheManager.getCachedNotes).toHaveBeenCalledWith('TAG1');
      expect(mockApi.getNotes).not.toHaveBeenCalled();
      expect(useBibleStore.getState().notes).toEqual(sampleNotes);
    });

    it('should fetch notes from API if not in cache', async () => {
      mockCacheManager.getCachedNotes.mockReturnValue(null);
      mockApi.getNotes.mockResolvedValue(sampleNotes);

      await useBibleStore.getState().fetchNotes('TAG1');

      expect(mockCacheManager.getCachedNotes).toHaveBeenCalledWith('TAG1');
      expect(mockApi.getNotes).toHaveBeenCalledWith('TAG1');
      expect(mockCacheManager.cacheNotes).toHaveBeenCalledWith('TAG1', sampleNotes);
      expect(useBibleStore.getState().notes).toEqual(sampleNotes);
    });
  });

  describe('deleteNote with cache clearing', () => {
    it('should call clearNotesCache when a note is deleted', async () => {
      mockApi.deleteNote.mockResolvedValue();
      // Pre-fill state with a note
      useBibleStore.setState({ notes: [{ id: 'note1', note_text: 'A note', tag: {id: 't1', name: 't1', parent_tag: null, created_at: '', updated_at: ''}, verses: [], public: false, created_at: '', updated_at: '' }] });

      await useBibleStore.getState().deleteNote('note1');

      expect(mockApi.deleteNote).toHaveBeenCalledWith('note1');
      expect(mockCacheManager.clearNotesCache).toHaveBeenCalledWith();
      expect(useBibleStore.getState().notes).toEqual([]);
    });
  });
});
