import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBibleStore, initialState } from './store';
import * as api from './api';

// Mock the API module
vi.mock('./api', () => ({
  getNotes: vi.fn(),
}));

// Mock document.getElementById and scrollIntoView
global.document = {
  ...global.document,
  getElementById: vi.fn().mockReturnValue({
    scrollIntoView: vi.fn(),
  }),
} as any;

describe('Zustand Store (useBibleStore)', () => {
  // Reset store to initial state before each test
  beforeEach(() => {
    useBibleStore.setState(initialState);
    vi.clearAllMocks();
  });

  it('should have the correct initial state', () => {
    const state = useBibleStore.getState();
    expect(state.activeBook).toBe('John');
    expect(state.activeChapter).toBe(1);
    expect(state.bibleVersion).toBe('KJV');
    expect(state.notes).toEqual([]);
    expect(state.allNotesFetched).toBe(false);
  });

  it('setActiveBook should update book, chapter, and verses', () => {
    useBibleStore.getState().setActiveBook('Exodus');
    const state = useBibleStore.getState();
    expect(state.activeBook).toBe('Exodus');
    expect(state.activeChapter).toBe(1);
    expect(state.activeVerses).toEqual([]);
  });

  it('setActiveChapter should update chapter and verses', () => {
    useBibleStore.getState().setActiveChapter(10);
    const state = useBibleStore.getState();
    expect(state.activeChapter).toBe(10);
    expect(state.activeVerses).toEqual([]);
  });

  it('setBibleVersion should update the bibleVersion', () => {
    useBibleStore.getState().setBibleVersion('NIV');
    const state = useBibleStore.getState();
    expect(state.bibleVersion).toBe('NIV');
  });

  it('setActiveVerses should update activeVerses and call scrollIntoView', () => {
    const getElementByIdSpy = vi.spyOn(document, 'getElementById');
    useBibleStore.getState().setActiveVerses([1, 2, 3]);
    const state = useBibleStore.getState();
    expect(state.activeVerses).toEqual([1, 2, 3]);
    expect(getElementByIdSpy).toHaveBeenCalledWith('verse-1');
    expect(getElementByIdSpy).toHaveBeenCalledWith('verse-2');
    expect(getElementByIdSpy).toHaveBeenCalledWith('verse-3');
  });

  describe('fetchNotes', () => {
    it('should fetch all notes and update state when no tagId is provided', async () => {
      const mockResponse = {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: '1', content: 'Note 1', tags: [] }]
      };
      (api.getNotes as import('vitest').Mock).mockResolvedValue(mockResponse);

      await useBibleStore.getState().fetchNotes();

      const state = useBibleStore.getState();
      expect(api.getNotes).toHaveBeenCalledWith(undefined, {
        ordering: undefined,
        page: 1,
        pageSize: 25,
        filesetId: 'ENGESV_API',
      });
      expect(state.notes).toEqual(mockResponse.results);
      expect(state.notesCount).toBe(1);
      expect(state.notesHasMore).toBe(false);
    });

    it('should fetch notes for a specific tag and update state', async () => {
      const mockResponse = {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: '2', content: 'Tagged Note', tags: ['tag1'] }]
      };
      (api.getNotes as import('vitest').Mock).mockResolvedValue(mockResponse);

      await useBibleStore.getState().fetchNotes('tag1');

      const state = useBibleStore.getState();
      expect(api.getNotes).toHaveBeenCalledWith('tag1', {
        ordering: undefined,
        page: 1,
        pageSize: 25,
        filesetId: 'ENGESV_API',
      });
      expect(state.notes).toEqual(mockResponse.results);
      expect(state.notesCount).toBe(1);
      expect(state.notesHasMore).toBe(false);
    });
  });
});
