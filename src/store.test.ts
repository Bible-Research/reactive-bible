import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  useBibleStore,
  initialState,
  migratePersistedState,
} from './store';
import * as api from './api';

// Mock the API module
vi.mock('./api', () => ({
  getNotes: vi.fn(),
}));

const john316 = { book: 'John', chapter: 3, verse: 16 };

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
    expect(state.verseSelection).toBeNull();
  });

  it('setActiveBook should update book, chapter, and verses', () => {
    useBibleStore.getState().setActiveBook('Exodus');
    const state = useBibleStore.getState();
    expect(state.activeBook).toBe('Exodus');
    expect(state.activeChapter).toBe(1);
    expect(state.verseSelection).toBeNull();
  });

  it('setActiveChapter should update chapter and verses', () => {
    useBibleStore.getState().setActiveChapter(10);
    const state = useBibleStore.getState();
    expect(state.activeChapter).toBe(10);
    expect(state.verseSelection).toBeNull();
  });

  it('setBibleVersion should update the bibleVersion', () => {
    useBibleStore.getState().setBibleVersion('NIV');
    const state = useBibleStore.getState();
    expect(state.bibleVersion).toBe('NIV');
  });

  it('setVerseSelection sets a scoped selection', () => {
    useBibleStore.getState().setVerseSelection({
      scope: 'bible',
      refs: [john316],
    });
    expect(useBibleStore.getState().verseSelection).toEqual({
      scope: 'bible',
      refs: [john316],
    });
  });

  it('toggleVerseRef adds and removes refs within a scope', () => {
    const { toggleVerseRef } = useBibleStore.getState();
    toggleVerseRef('bible', john316);
    toggleVerseRef('bible', { book: 'John', chapter: 3, verse: 17 });
    expect(useBibleStore.getState().verseSelection?.refs).toHaveLength(
      2
    );
    toggleVerseRef('bible', john316);
    expect(useBibleStore.getState().verseSelection?.refs).toEqual([
      { book: 'John', chapter: 3, verse: 17 },
    ]);
    toggleVerseRef('bible', { book: 'John', chapter: 3, verse: 17 });
    expect(useBibleStore.getState().verseSelection).toBeNull();
  });

  it('toggleVerseRef in a different scope replaces the selection', () => {
    const { toggleVerseRef } = useBibleStore.getState();
    toggleVerseRef('bible', john316);
    const noteRef = { book: 'John', chapter: 3, verse: 16 };
    toggleVerseRef('note-1', noteRef);
    expect(useBibleStore.getState().verseSelection).toEqual({
      scope: 'note-1',
      refs: [noteRef],
    });
  });

  it('selectVerseRange merges a range into the scope selection', () => {
    const { toggleVerseRef, selectVerseRange } =
      useBibleStore.getState();
    toggleVerseRef('note-1', { book: 'John', chapter: 3, verse: 20 });
    selectVerseRange(
      'note-1',
      { book: 'John', chapter: 3, verse: 16 },
      { book: 'John', chapter: 3, verse: 18 }
    );
    expect(useBibleStore.getState().verseSelection).toEqual({
      scope: 'note-1',
      refs: [
        { book: 'John', chapter: 3, verse: 20 },
        { book: 'John', chapter: 3, verse: 16 },
        { book: 'John', chapter: 3, verse: 17 },
        { book: 'John', chapter: 3, verse: 18 },
      ],
    });
  });

  it('selectVerseRange refuses cross-chapter ranges', () => {
    const { selectVerseRange } = useBibleStore.getState();
    selectVerseRange(
      'bible',
      { book: 'John', chapter: 3, verse: 16 },
      { book: 'John', chapter: 4, verse: 2 }
    );
    expect(useBibleStore.getState().verseSelection).toEqual({
      scope: 'bible',
      refs: [{ book: 'John', chapter: 4, verse: 2 }],
    });
  });

  it('setActiveChapter clears the selection', () => {
    useBibleStore.getState().setVerseSelection({
      scope: 'bible',
      refs: [john316],
    });
    useBibleStore.getState().setActiveChapter(4);
    expect(useBibleStore.getState().verseSelection).toBeNull();
  });

  it('migratePersistedState converts legacy activeVerses', () => {
    const migrated = migratePersistedState(
      {
        activeBook: 'John',
        activeBookShort: 'Joh',
        activeChapter: 3,
        activeVerses: [16, 17],
        selectedVerses: [16],
        bibleVersion: 'KJV',
      },
      0
    );
    expect(migrated.verseSelection).toEqual({
      scope: 'bible',
      refs: [
        { book: 'John', chapter: 3, verse: 16 },
        { book: 'John', chapter: 3, verse: 17 },
      ],
    });
    expect(
      (migrated as Record<string, unknown>).activeVerses
    ).toBeUndefined();
    expect(
      (migrated as Record<string, unknown>).selectedVerses
    ).toBeUndefined();
  });

  it('migratePersistedState yields null selection when empty', () => {
    const migrated = migratePersistedState(
      { activeBook: 'John', activeChapter: 3, activeVerses: [] },
      0
    );
    expect(migrated.verseSelection).toBeNull();
  });

  describe('fetchNotes', () => {
    it('should fetch all notes and update state', async () => {
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
