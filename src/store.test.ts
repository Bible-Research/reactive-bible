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

const john316 = { bookId: 'JHN', chapter: 3, verse: 16 };

describe('Zustand Store (useBibleStore)', () => {
  // Reset store to initial state before each test
  beforeEach(() => {
    useBibleStore.setState(initialState);
    vi.clearAllMocks();
  });

  it('should have the correct initial state', () => {
    const state = useBibleStore.getState();
    expect(state.activeBookId).toBe('JHN');
    expect(state.activeChapter).toBe(1);
    expect(state.bibleVersion).toBe('KJV');
    expect(state.notes).toEqual([]);
    expect(state.allNotesFetched).toBe(false);
    expect(state.verseSelection).toBeNull();
  });

  it('setActiveBookAndChapter updates book and chapter', () => {
    useBibleStore.getState().setActiveBookAndChapter('EXO', 2);
    const state = useBibleStore.getState();
    expect(state.activeBookId).toBe('EXO');
    expect(state.activeChapter).toBe(2);
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
    toggleVerseRef('bible', { bookId: 'JHN', chapter: 3, verse: 17 });
    expect(useBibleStore.getState().verseSelection?.refs).toHaveLength(
      2
    );
    toggleVerseRef('bible', john316);
    expect(useBibleStore.getState().verseSelection?.refs).toEqual([
      { bookId: 'JHN', chapter: 3, verse: 17 },
    ]);
    toggleVerseRef('bible', { bookId: 'JHN', chapter: 3, verse: 17 });
    expect(useBibleStore.getState().verseSelection).toBeNull();
  });

  it('toggleVerseRef in a different scope replaces the selection', () => {
    const { toggleVerseRef } = useBibleStore.getState();
    toggleVerseRef('bible', john316);
    const noteRef = { bookId: 'JHN', chapter: 3, verse: 16 };
    toggleVerseRef('note-1', noteRef);
    expect(useBibleStore.getState().verseSelection).toEqual({
      scope: 'note-1',
      refs: [noteRef],
    });
  });

  it('selectVerseRange merges a range into the scope selection', () => {
    const { toggleVerseRef, selectVerseRange } =
      useBibleStore.getState();
    toggleVerseRef('note-1', { bookId: 'JHN', chapter: 3, verse: 20 });
    selectVerseRange(
      'note-1',
      { bookId: 'JHN', chapter: 3, verse: 16 },
      { bookId: 'JHN', chapter: 3, verse: 18 }
    );
    expect(useBibleStore.getState().verseSelection).toEqual({
      scope: 'note-1',
      refs: [
        { bookId: 'JHN', chapter: 3, verse: 20 },
        { bookId: 'JHN', chapter: 3, verse: 16 },
        { bookId: 'JHN', chapter: 3, verse: 17 },
        { bookId: 'JHN', chapter: 3, verse: 18 },
      ],
    });
  });

  it('selectVerseRange refuses cross-chapter ranges', () => {
    const { selectVerseRange } = useBibleStore.getState();
    selectVerseRange(
      'bible',
      { bookId: 'JHN', chapter: 3, verse: 16 },
      { bookId: 'JHN', chapter: 4, verse: 2 }
    );
    expect(useBibleStore.getState().verseSelection).toEqual({
      scope: 'bible',
      refs: [{ bookId: 'JHN', chapter: 4, verse: 2 }],
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
        { bookId: 'JHN', chapter: 3, verse: 16 },
        { bookId: 'JHN', chapter: 3, verse: 17 },
      ],
    });
    expect(migrated.activeBookId).toBe('JHN');
    expect(
      (migrated as Record<string, unknown>).activeBook
    ).toBeUndefined();
    expect(
      (migrated as Record<string, unknown>).activeBookShort
    ).toBeUndefined();
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
    expect(migrated.activeBookId).toBe('JHN');
  });

  it('migratePersistedState converts v2 name-based state', () => {
    const migrated = migratePersistedState(
      {
        activeBook: 'John',
        activeBookShort: 'Joh',
        activeChapter: 3,
        verseSelection: {
          scope: 'bible',
          refs: [{ book: 'John', chapter: 3, verse: 16 }],
        },
        audioActiveVerse: {
          book: 'John',
          chapter: 3,
          verse: 17,
          scope: 'bible',
        },
      },
      2
    );
    expect(migrated.activeBookId).toBe('JHN');
    expect(migrated.verseSelection).toEqual({
      scope: 'bible',
      refs: [{ bookId: 'JHN', chapter: 3, verse: 16 }],
    });
    expect(migrated.audioActiveVerse).toEqual({
      bookId: 'JHN',
      chapter: 3,
      verse: 17,
      scope: 'bible',
    });
    expect(
      (migrated as Record<string, unknown>).activeBook
    ).toBeUndefined();
  });

  it('migratePersistedState keeps v3 state untouched', () => {
    const persisted = {
      activeBookId: 'JHN',
      activeChapter: 3,
      verseSelection: {
        scope: 'bible',
        refs: [{ bookId: 'JHN', chapter: 3, verse: 16 }],
      },
    };
    const migrated = migratePersistedState(persisted, 3);
    expect(migrated.activeBookId).toBe('JHN');
    expect(migrated.verseSelection).toEqual(
      persisted.verseSelection
    );
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
