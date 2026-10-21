import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  useBibleStore,
  initialState,
  migratePersistedState,
  partializeState,
} from './store';
import { useAuthStore } from './stores/authStore';
import * as api from './api';
import * as cacheManager from './utils/cacheManager';
import { Note, Tag } from './types';

// Mock dependencies — every api function is stubbed, but the
// error classes stay real because store actions branch on
// `instanceof` (e.g. ConflictError).
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  const mocked: Record<string, unknown> = { ...actual };
  const realClasses = new Set([
    'ConflictError',
    'RateLimitError',
    'ProviderError',
    'BookNotInFilesetError',
  ]);
  for (const [key, value] of Object.entries(actual)) {
    if (typeof value === 'function' && !realClasses.has(key)) {
      mocked[key] = vi.fn();
    }
  }
  return mocked;
});
vi.mock('./utils/cacheManager');

const mockApi = vi.mocked(api);
const mockCacheManager = vi.mocked(cacheManager);

const john316 = { bookId: 'JHN', chapter: 3, verse: 16 };

const notePageOf = (
  results: Note[]
): api.PaginatedNotesResponse => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});

describe('useBibleStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
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

  it('migratePersistedState re-keys v<5 readingPositions from ' +
    'book names to USFM codes', () => {
    // v<5 persisted positions keyed by book name (the backend's
    // `book` field); v5 keys them by USFM code like everything
    // else in the store.
    const migrated = migratePersistedState(
      {
        readingPositions: {
          John: { chapter: 3, verse: 16 },
          MRK: { chapter: 2, verse: 1 },
          '1 Corinthians': { chapter: 5, verse: 9 },
        },
      },
      4
    );
    expect(migrated.readingPositions).toEqual({
      JHN: { chapter: 3, verse: 16 },
      MRK: { chapter: 2, verse: 1 },
      '1CO': { chapter: 5, verse: 9 },
    });
  });

  it('migratePersistedState maps malformed v<5 positions to ' +
    'null and drops unknown books', () => {
    const migrated = migratePersistedState(
      {
        readingPositions: {
          JHN: { chapter: 'three', verse: 16 },
          MRK: null,
          Genesis: { chapter: 1 },
          NotABook: { chapter: 1, verse: 1 },
        },
      },
      4
    );
    // A null entry means "fetched, no saved position"; malformed
    // entries degrade to the same value rather than crashing.
    expect(migrated.readingPositions).toEqual({
      JHN: null,
      MRK: null,
      GEN: null,
    });
  });

  it('migratePersistedState does not re-key readingPositions ' +
    'at v5', () => {
    // Feeding only well-formed USFM-keyed data would be
    // non-discriminating: a `version <= 5` off-by-one would
    // re-sanitize it into identical output. The name-keyed
    // and malformed entries below WOULD change if
    // re-sanitized (re-keyed to MRK / degraded to null), so
    // they must survive untouched at v5.
    const persisted = {
      readingPositions: {
        JHN: { chapter: 3, verse: 16 },
        Mark: { chapter: 2, verse: 1 },
        GEN: 'malformed',
      },
    };
    const migrated = migratePersistedState(persisted, 5);
    expect(migrated.readingPositions).toEqual(
      persisted.readingPositions
    );
  });

  it('migratePersistedState drops a note-scoped selection ' +
    'persisted by a pre-v6 store', () => {
    const migrated = migratePersistedState(
      {
        activeBookId: 'JHN',
        activeChapter: 3,
        verseSelection: {
          scope: 'note-abc',
          refs: [{ bookId: 'JHN', chapter: 3, verse: 16 }],
        },
      },
      5
    );
    expect(migrated.verseSelection).toBeNull();
  });

  it('migratePersistedState keeps a bible-scoped selection ' +
    'across the v6 bump', () => {
    const selection = {
      scope: 'bible',
      refs: [{ bookId: 'JHN', chapter: 3, verse: 16 }],
    };
    const migrated = migratePersistedState(
      {
        activeBookId: 'JHN',
        activeChapter: 3,
        verseSelection: selection,
      },
      5
    );
    expect(migrated.verseSelection).toEqual(selection);
  });

  describe('fetchNotes', () => {
    it('should fetch all notes and update state', async () => {
      const mockResponse = {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: '1', content: 'Note 1', tags: [] }],
      } as unknown as api.PaginatedNotesResponse;
      mockApi.getNotes.mockResolvedValue(mockResponse);

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

    it('should fetch notes for a specific tag and update state',
      async () => {
        const mockResponse = {
          count: 1,
          next: null,
          previous: null,
          results: [{ id: '2', content: 'Tagged Note', tags: ['tag1'] }],
        } as unknown as api.PaginatedNotesResponse;
        mockApi.getNotes.mockResolvedValue(mockResponse);

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

  describe('partializeState (persisted shape)', () => {
    // GATE for the store slice split: this snapshot must pass
    // unchanged after the split — it proves the persisted
    // `bible-storage` record is identical, so no schema
    // version bump is needed.
    it('persists exactly the expected key set and values', () => {
      const tag: Tag = {
        id: 'TAG1', name: 'Test Tag', parent_tag: null,
        created_at: '', updated_at: '',
      };
      const note: Note = {
        id: 'note1', note_text: 'Persisted note', tag,
        verses: [], public: false, is_owner: true,
        created_at: '', updated_at: '', tag_position: 1,
      };
      useBibleStore.setState({
        activeBookId: 'MRK',
        activeChapter: 4,
        verseSelection: { scope: 'bible', refs: [john316] },
        bibleVersion: 'ESV',
        lastSelectedTagId: 'TAG1',
        audioActiveVerse: {
          bookId: 'MRK', chapter: 4, verse: 2, scope: 'bible',
        },
        notes: [note],
        tags: [tag],
        notesPage: 3,
        notesPageSize: 50,
        readingPositions: { MRK: { chapter: 4, verse: 2 } },
        // Non-persisted fields — set to non-defaults so the
        // snapshot proves they are excluded.
        detailNote: note,
        showAudioPlayer: true,
        pendingScrollVerse: john316,
        headerVisible: false,
        notesCount: 99,
        notesHasMore: true,
        notesOrdering: 'custom',
        allNotesFetched: true,
        showNotes: true,
        versesFolded: true,
        audioPlaylistItems: [],
        audioPlaylistStartIndex: 2,
      });

      const persisted = partializeState(useBibleStore.getState());

      expect(Object.keys(persisted).sort()).toEqual([
        'activeAudioFilesetId',
        'activeBookId',
        'activeChapter',
        'activeTextFilesetId',
        'audioActiveVerse',
        'bibleVersion',
        'lastSelectedTagId',
        'notes',
        'notesPage',
        'notesPageSize',
        'readingPositions',
        'tags',
        'translations',
        'verseSelection',
      ]);
      expect(JSON.stringify(persisted)).toMatchSnapshot();
    });
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

    beforeEach(() => {
      // The notes cache only serves authenticated sessions.
      useAuthStore.setState({
        token: 'test-token',
        isAuthenticated: true,
      });
    });

    const defaultScope = {
      filesetId: 'ENGESV_API',
      pageSize: 25,
      authed: true,
    };

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
        undefined,
        defaultScope
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
        undefined,
        defaultScope
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
        {
          count: 1,
          hasMore: false,
          page: 1,
          ordering: undefined,
          filesetId: 'ENGESV_API',
          pageSize: 25,
          authed: true,
        }
      );
      expect(useBibleStore.getState().notes).toEqual(sampleNotes);
    });

    it('skips the localStorage cache for anonymous visitors',
      async () => {
        useAuthStore.setState({
          token: null,
          isAuthenticated: false,
        });
        // A stale cache entry must not be served — it could be
        // private notes from a previous session on this device.
        mockCacheManager.getCachedNotes.mockReturnValue({
          notes: sampleNotes,
          timestamp: Date.now(),
          count: 1,
          hasMore: false,
        });
        mockApi.getNotes.mockResolvedValue({
          count: 1,
          next: null,
          previous: null,
          results: sampleNotes,
        });

        await useBibleStore.getState().fetchNotes('TAG1');

        expect(mockCacheManager.getCachedNotes)
          .not.toHaveBeenCalled();
        // Anonymous results are never written to the shared
        // localStorage cache either.
        expect(mockCacheManager.cacheNotes)
          .not.toHaveBeenCalled();
        expect(mockApi.getNotes).toHaveBeenCalled();
        expect(useBibleStore.getState().notes)
          .toEqual(sampleNotes);
      });

    it('omits fileset_id for testament-split text products',
      async () => {
        mockCacheManager.getCachedNotes.mockReturnValue(null);
        mockApi.getNotes.mockResolvedValue({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
        // A product whose OT/NT members differ has no single
        // fileset that can serve cross-testament notes.
        useBibleStore.setState({
          activeTextFilesetId: 'ENGESV:text:0',
          activeBookId: 'JHN',
          translations: [
            {
              abbr: 'ENGESV',
              name: 'English Standard Version',
              language: 'English',
              language_iso: 'eng',
              filesets: [
                { id: 'ENGESVO_ET', type: 'text_plain', size: 'OT',
                  codec: null, bitrate: null },
                { id: 'ENGESVN_ET', type: 'text_plain', size: 'NT',
                  codec: null, bitrate: null },
              ],
            },
          ],
        });

        await useBibleStore.getState().fetchNotes('TAG1');

        expect(mockApi.getNotes).toHaveBeenCalledWith('TAG1', {
          ordering: undefined,
          page: 1,
          pageSize: 25,
          filesetId: undefined,
        });
      });

    it('does not set lastSelectedTagId for foreign public tags',
      async () => {
        mockCacheManager.getCachedNotes.mockReturnValue(null);
        // Note belongs to tag-x but is not owned by the viewer,
        // and tag-x is absent from the user's tag list.
        const foreignNote = {
          ...sampleNotes[0],
          is_owner: false,
        };
        mockApi.getNotes.mockResolvedValue({
          count: 1,
          next: null,
          previous: null,
          results: [foreignNote],
        });
        useBibleStore.setState({
          lastSelectedTagId: 'my-own-tag',
          tags: [],
        });

        await useBibleStore.getState().fetchNotes('tag-x');

        expect(useBibleStore.getState().lastSelectedTagId)
          .toBe('my-own-tag');
      });

    it('sets lastSelectedTagId for owned tags', async () => {
      mockCacheManager.getCachedNotes.mockReturnValue(null);
      mockApi.getNotes.mockResolvedValue({
        count: 1,
        next: null,
        previous: null,
        results: sampleNotes,
      });
      // Ownership (own tag list or is_owner notes) only counts
      // for authenticated viewers.
      useAuthStore.setState({ isAuthenticated: true });
      useBibleStore.setState({ lastSelectedTagId: null });

      await useBibleStore.getState().fetchNotes('TAG1');

      expect(useBibleStore.getState().lastSelectedTagId)
        .toBe('TAG1');
    });

    it('resolves a stored product id before sending fileset_id',
      async () => {
        mockCacheManager.getCachedNotes.mockReturnValue(null);
        mockApi.getNotes.mockResolvedValue({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
        // The selector persists grouped product ids like
        // `ENGESV:text:0` — the API only understands concrete
        // fileset ids.
        useBibleStore.setState({
          activeTextFilesetId: 'ENGESV:text:0',
          activeBookId: 'JHN',
          translations: [
            {
              abbr: 'ENGESV',
              name: 'English Standard Version',
              language: 'English',
              language_iso: 'eng',
              filesets: [
                { id: 'ENGESV_API', type: 'text_plain', size: 'C',
                  codec: null, bitrate: null },
                { id: 'ENGESVO_ET', type: 'text_plain', size: 'OT',
                  codec: null, bitrate: null },
                { id: 'ENGESVN_ET', type: 'text_plain', size: 'NT',
                  codec: null, bitrate: null },
              ],
            },
          ],
        });

        await useBibleStore.getState().fetchNotes('TAG1');

        expect(mockApi.getNotes).toHaveBeenCalledWith('TAG1', {
          ordering: undefined,
          page: 1,
          pageSize: 25,
          filesetId: 'ENGESV_API',
        });
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

  describe('note move/reorder refresh handling', () => {
    const tag: Tag = {
      id: 'TAG1', name: 'Test Tag', parent_tag: null,
      created_at: '', updated_at: '',
    };
    const makeNote = (id: string): Note => ({
      id, note_text: `Note ${id}`, tag, verses: [],
      public: false, is_owner: true, created_at: '',
      updated_at: '', tag_position: null,
    });

    it('drops a stale fetchNotes response superseded by a ' +
      'newer request', async () => {
      mockCacheManager.getCachedNotes.mockReturnValue(null);
      let resolveStale: (
        value: api.PaginatedNotesResponse
      ) => void = () => undefined;
      mockApi.getNotes
        .mockImplementationOnce(
          () =>
            new Promise<api.PaginatedNotesResponse>((res) => {
              resolveStale = res;
            })
        )
        .mockResolvedValueOnce(notePageOf([makeNote('fresh')]));

      const staleCall =
        useBibleStore.getState().fetchNotes('TAG1');
      const freshCall =
        useBibleStore.getState().fetchNotes('TAG1');
      // Resolve the older request last — latest call wins.
      resolveStale(notePageOf([makeNote('stale')]));
      await Promise.all([staleCall, freshCall]);

      expect(useBibleStore.getState().notes).toEqual([
        makeNote('fresh'),
      ]);
    });

    it('invalidates the notes cache and refetches the page ' +
      'after a successful move', async () => {
      mockCacheManager.getCachedNotes.mockReturnValue(null);
      mockApi.moveNote.mockResolvedValue({
        note_id: 'n1',
        tag_position: 1.5,
        rebalanced: false,
      });
      const movedNote = { ...makeNote('n1'), tag_position: 1.5 };
      mockApi.getNotes.mockResolvedValue(notePageOf([movedNote]));
      useBibleStore.setState({
        notes: [makeNote('n1'), makeNote('n2')],
        notesPage: 2,
        notesOrdering: 'custom',
      });

      await useBibleStore.getState().moveNoteAfter(
        'TAG1', 'n1', 'n2', 'after'
      );

      expect(mockCacheManager.clearNotesCache)
        .toHaveBeenCalledWith('TAG1');
      expect(mockApi.getNotes).toHaveBeenCalledWith('TAG1', {
        ordering: 'custom',
        page: 2,
        pageSize: 25,
        filesetId: 'ENGESV_API',
      });
      // The authoritative refetch — not the instant-feedback
      // local patch — decides the final note list.
      expect(useBibleStore.getState().notes).toEqual([movedNote]);
    });

    it('applies the new tag positions locally on a ' +
      'successful reorder', async () => {
      mockApi.reorderNotes.mockResolvedValue(undefined);
      // The success path refetches the page — stub the
      // authoritative result so a leftover getNotes stub from
      // another test can't overwrite the local patch.
      mockCacheManager.getCachedNotes.mockReturnValue(null);
      mockApi.getNotes.mockResolvedValue(
        notePageOf([
          { ...makeNote('n2'), tag_position: 1 },
          { ...makeNote('n1'), tag_position: 2 },
        ])
      );
      useBibleStore.setState({
        notes: [makeNote('n1'), makeNote('n2')],
        notesPage: 1,
        notesOrdering: 'custom',
      });

      await useBibleStore.getState().reorderNotes(
        'TAG1', ['n2', 'n1'], 1, 25
      );

      expect(mockApi.reorderNotes).toHaveBeenCalledWith('TAG1', [
        { note_id: 'n2', position: 1 },
        { note_id: 'n1', position: 2 },
      ]);
      expect(
        useBibleStore.getState().notes.map((n) => ({
          id: n.id,
          tag_position: n.tag_position,
        }))
      ).toEqual([
        { id: 'n2', tag_position: 1 },
        { id: 'n1', tag_position: 2 },
      ]);
    });

    it('still reports success when the post-move refetch ' +
      'fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(
        () => undefined
      );
      mockCacheManager.getCachedNotes.mockReturnValue(null);
      mockApi.moveNote.mockResolvedValue({
        note_id: 'n1',
        tag_position: 1.5,
        rebalanced: false,
      });
      mockApi.getNotes.mockRejectedValue(
        new Error('refresh failed')
      );
      useBibleStore.setState({
        notes: [makeNote('n1'), makeNote('n2')],
        notesPage: 1,
        notesOrdering: null,
      });

      // The move itself succeeded — a failed refresh must not
      // reject as 'Failed to move note'.
      await expect(
        useBibleStore.getState().moveNoteAfter(
          'TAG1', 'n1', 'n2', 'after'
        )
      ).resolves.toBeUndefined();
    });

    it('clears the tag cache and refetches the page after a ' +
      'successful reorder', async () => {
      mockCacheManager.getCachedNotes.mockReturnValue(null);
      mockApi.reorderNotes.mockResolvedValue(undefined);
      mockApi.getNotes.mockResolvedValue(
        notePageOf([makeNote('n2')])
      );
      useBibleStore.setState({
        notes: [makeNote('n1'), makeNote('n2')],
        notesPage: 2,
        notesOrdering: 'custom',
      });

      await useBibleStore.getState().reorderNotes(
        'TAG1', ['n2', 'n1'], 2, 25
      );

      // Cached pages keep no TTL — without invalidation they'd
      // serve the pre-reorder order indefinitely.
      expect(mockCacheManager.clearNotesCache)
        .toHaveBeenCalledWith('TAG1');
      // The server is authoritative for positions (it may
      // rebalance to floats) — the page is refetched rather than
      // trusting the dense integers we sent.
      expect(mockApi.getNotes).toHaveBeenCalledWith('TAG1', {
        ordering: 'custom',
        page: 2,
        pageSize: 25,
        filesetId: 'ENGESV_API',
      });
    });

    it('refreshes the current ordering and page after a ' +
      'reorder conflict', async () => {
      mockCacheManager.getCachedNotes.mockReturnValue(null);
      mockApi.reorderNotes.mockRejectedValue(
        new api.ConflictError('stale positions')
      );
      mockApi.getNotes.mockResolvedValue(notePageOf([]));
      useBibleStore.setState({
        notesPage: 3,
        notesOrdering: 'custom',
      });

      await expect(
        useBibleStore.getState().reorderNotes(
          'TAG1', ['n1', 'n2'], 3, 25
        )
      ).rejects.toBeInstanceOf(api.ConflictError);

      // The refresh keeps the user on their page/ordering
      // instead of bouncing to page 1 with ordering reset.
      expect(mockCacheManager.clearNotesCache)
        .toHaveBeenCalledWith('TAG1');
      expect(mockApi.getNotes).toHaveBeenCalledWith('TAG1', {
        ordering: 'custom',
        page: 3,
        pageSize: 25,
        filesetId: 'ENGESV_API',
      });
      expect(useBibleStore.getState().notesPage).toBe(3);
      expect(useBibleStore.getState().notesOrdering)
        .toBe('custom');
    });
  });

  describe('logout purge', () => {
    const purgeTag: Tag = {
      id: 'TAG1', name: 'T', parent_tag: null,
      created_at: '', updated_at: '',
    };
    const purgeNote: Note = {
      id: 'n1', note_text: 'n', tag: purgeTag, verses: [],
      public: false, is_owner: true, created_at: '',
      updated_at: '', tag_position: null,
    };

    it('drops private data and clears the notes cache when the ' +
      'token is removed', () => {
      useAuthStore.setState({
        token: 'tok-1',
        user: { username: 'u' },
        isAuthenticated: true,
      });
      useBibleStore.setState({
        notes: [purgeNote],
        tags: [purgeTag],
        readingPositions: { MRK: { chapter: 2, verse: 3 } },
        notesCount: 5,
        allNotesFetched: true,
        lastSelectedTagId: 'TAG1',
      });

      // Both the manual and the 401 paths funnel through
      // authStore.logout().
      useAuthStore.getState().logout();

      const state = useBibleStore.getState();
      expect(mockCacheManager.clearNotesCache).toHaveBeenCalled();
      expect(state.notes).toEqual([]);
      expect(state.tags).toEqual([]);
      expect(state.readingPositions).toEqual({});
      expect(state.notesCount).toBe(0);
      expect(state.allNotesFetched).toBe(false);
      expect(state.lastSelectedTagId).toBeNull();
    });

    it('does not purge when logging in from anonymous state',
      () => {
        useAuthStore.setState({ token: null });
        useBibleStore.setState({ notes: [purgeNote] });

        useAuthStore.setState({
          token: 'tok-2',
          isAuthenticated: true,
        });

        expect(useBibleStore.getState().notes).toHaveLength(1);
      });
  });
});
