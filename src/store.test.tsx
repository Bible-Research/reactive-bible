import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useBibleStore, initialState } from './store';
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
    const pageOf = (
      results: Note[]
    ): api.PaginatedNotesResponse => ({
      count: results.length,
      next: null,
      previous: null,
      results,
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
        .mockResolvedValueOnce(pageOf([makeNote('fresh')]));

      const staleCall =
        useBibleStore.getState().fetchNotes('TAG1');
      const freshCall =
        useBibleStore.getState().fetchNotes('TAG1');
      // Resolve the older request last — latest call wins.
      resolveStale(pageOf([makeNote('stale')]));
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
      mockApi.getNotes.mockResolvedValue(pageOf([movedNote]));
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
        pageOf([
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
      mockApi.getNotes.mockResolvedValue(pageOf([makeNote('n2')]));
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
      mockApi.getNotes.mockResolvedValue(pageOf([]));
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
