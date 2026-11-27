import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import {
  renderWithProviders,
  mockDomApis,
} from '../__tests__/helpers';
import TagNotesRoute from './TagNotesRoute';
import { useBibleStore, initialState } from '../store';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../stores/authStore';
import * as api from '../api';
import {
  clearNotesCache,
  getCachedNotes,
} from '../utils/cacheManager';
import { Note, Tag } from '../types';

const mockNavigate = vi.fn();
const mockUseParams = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<
    typeof import('react-router-dom')
  >('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
  };
});

// Selective automock — keep real error classes so `instanceof`
// checks in store actions still work.
vi.mock('../api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../api')>();
  const mocked: Record<string, unknown> = { ...actual };
  for (const [key, value] of Object.entries(actual)) {
    if (
      typeof value === 'function' &&
      key !== 'ConflictError'
    ) {
      mocked[key] = vi.fn();
    }
  }
  return mocked;
});
vi.mock('../utils/cacheManager');

const mockApi = vi.mocked(api);
const mockClearNotesCache = vi.mocked(clearNotesCache);
const mockGetCachedNotes = vi.mocked(getCachedNotes);

// The slice's real fetchNotes action, captured before any
// test overrides it on the shared store — the stale-load
// regression test drives the cache-hit path through it.
const realFetchNotes = useBibleStore.getState().fetchNotes;

const tag: Tag = {
  id: 'tag-123',
  name: 'Bible Study',
  parent_tag: null,
  public: false,
  created_at: '',
  updated_at: '',
};

const secondTag: Tag = {
  id: 'tag-456',
  name: 'Prayer',
  parent_tag: null,
  public: false,
  created_at: '',
  updated_at: '',
};

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'note-1',
  note_text: 'A note',
  public: true,
  is_owner: true,
  created_at: '',
  updated_at: '',
  tag,
  verses: [],
  tag_position: 1,
  ...overrides,
});

const verseNote = (id: string, position: number): Note =>
  makeNote({
    id,
    tag_position: position,
    verses: [
      {
        book: 'John',
        chapter: 3,
        verse: 16,
        text: 'For God so loved the world',
      },
    ],
  });

const mockFetchNotes = vi.fn();
const mockGetTags = vi.fn();

// Simulates a user who left tag-123 sitting on page 3
// (25 notes per page, 60 notes total).
const storeOverrides = {
  notes: [makeNote()],
  notesCount: 60,
  notesPage: 3,
  notesPageSize: 25,
  lastSelectedTagId: 'tag-123',
  tags: [tag],
  fetchNotes: mockFetchNotes,
  getTags: mockGetTags,
};

// Reports the router's current query string — MemoryRouter
// keeps it off window.location, so sort-param changes are
// asserted through this probe.
const LocationProbe = () => {
  const location = useLocation();
  return (
    <output data-testid="location-search">
      {location.search}
    </output>
  );
};

// Direct render so tests can control the URL (sort param) —
// renderWithProviders' MemoryRouter always starts at '/'.
const renderRoute = (
  route = '/notes/tag/tag-123',
  authenticated = true,
  extraOverrides: Record<string, unknown> = {}
) => {
  useBibleStore.setState({
    ...initialState,
    ...storeOverrides,
    ...extraOverrides,
  });
  useAuthStore.setState({
    ...authInitialState,
    token: authenticated ? 'token' : null,
    isAuthenticated: authenticated,
  });
  mockDomApis();
  return render(
    <MemoryRouter initialEntries={[route]}>
      <TagNotesRoute />
      <LocationProbe />
    </MemoryRouter>
  );
};

const pagesRequested = () =>
  mockFetchNotes.mock.calls.map((call) => call[1]?.page);

// Secondary card actions live in the ⋮ overflow menu on the
// tag-notes view — open the card's menu, then click Remove.
const clickRemove = async (noteId: string) => {
  fireEvent.click(
    await screen.findByLabelText(`note-actions-${noteId}`)
  );
  fireEvent.click(await screen.findByLabelText('remove-note'));
};

// Mantine renders each Select as a hidden input carrying
// the raw value plus a visible readonly input showing the
// chosen label — the visible one is what a user clicks.
const visibleSelect = (displayValue: string) => {
  const match = screen
    .getAllByDisplayValue(displayValue)
    .find(
      (el): el is HTMLInputElement =>
        el instanceof HTMLInputElement && el.type !== 'hidden'
    );
  if (!match) {
    throw new Error(`No visible select for ${displayValue}`);
  }
  return match;
};

describe('TagNotesRoute pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ tagId: 'tag-123' });
    mockFetchNotes.mockResolvedValue(undefined);
    mockGetTags.mockResolvedValue(undefined);
    mockApi.getTag.mockResolvedValue(tag);
    mockApi.fetchCommentCounts.mockResolvedValue({});
  });

  it('restores the stored notes page on first load', async () => {
    renderWithProviders(<TagNotesRoute />, { storeOverrides });
    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalledWith(
        'tag-123',
        expect.objectContaining({ page: 3 })
      );
    });
  });

  it('restores the page AND the URL sort order together',
    async () => {
      renderRoute('/notes/tag/tag-123?sort=custom_desc');
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          'tag-123',
          { ordering: '-custom', page: 3, includeDescendants: false }
        );
      });
    });

  it('keeps the page when the load effect re-runs', async () => {
    renderWithProviders(<TagNotesRoute />, { storeOverrides });
    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalledWith(
        'tag-123',
        expect.objectContaining({ page: 3 })
      );
    });
    mockFetchNotes.mockClear();

    // Simulates checkAuth() finishing after mount: flipping
    // isAuthenticated re-runs the load effect.
    act(() => {
      useAuthStore.setState({ isAuthenticated: true });
    });

    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalled();
    });
    expect(pagesRequested()).toEqual([3]);
  });

  it('keeps the page under StrictMode double-mount', async () => {
    renderWithProviders(
      <StrictMode>
        <TagNotesRoute />
      </StrictMode>,
      { storeOverrides }
    );

    await waitFor(() => {
      expect(mockFetchNotes.mock.calls.length).toBeGreaterThan(0);
    });
    // Every load must request the restored page, never page 1.
    expect(pagesRequested().every((p) => p === 3)).toBe(true);
  });

  it('restores each tag\'s own stored page and page size, ' +
    'not just the last tag\'s', async () => {
      // tag-456 was last browsed at page 5 with 50 per page,
      // even though the single-slot restore fields
      // (lastSelectedTagId/notesPage) belong to tag-123.
      mockUseParams.mockReturnValue({ tagId: 'tag-456' });
      renderRoute('/notes/tag/tag-456', true, {
        tagPagination: {
          'tag-456': { page: 5, pageSize: 50 },
        },
      });

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          'tag-456',
          expect.objectContaining({ page: 5 })
        );
      });
      expect(useBibleStore.getState().notesPageSize).toBe(50);
    });

  it('prefers the per-tag record over the legacy ' +
    'single-slot restore fields', async () => {
      // Both records exist for tag-123: the per-tag map is
      // authoritative — page 4 from the map, not page 3 from
      // notesPage.
      renderRoute('/notes/tag/tag-123', true, {
        tagPagination: {
          'tag-123': { page: 4, pageSize: 50 },
        },
      });

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          'tag-123',
          expect.objectContaining({ page: 4 })
        );
      });
      expect(useBibleStore.getState().notesPageSize).toBe(50);
    });

  it('restores the stored page when switching tags without ' +
    'remounting', async () => {
      // Navigate tag-123 -> tag-456 inside one mount (same
      // route, new param): the seed must re-read the map for
      // the new tag instead of reusing tag-123's page.
      const { rerender } = renderRoute(
        '/notes/tag/tag-123',
        true,
        {
          tagPagination: {
            'tag-123': { page: 3, pageSize: 25 },
            'tag-456': { page: 5, pageSize: 50 },
          },
        }
      );
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          'tag-123',
          expect.objectContaining({ page: 3 })
        );
      });
      mockFetchNotes.mockClear();
      mockUseParams.mockReturnValue({ tagId: 'tag-456' });
      rerender(
        <MemoryRouter initialEntries={['/notes/tag/tag-456']}>
          <TagNotesRoute />
          <LocationProbe />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          'tag-456',
          expect.objectContaining({ page: 5 })
        );
      });
      // The restored page size must be tag-456's own —
      // fetchNotes reads notesPageSize at call time.
      expect(useBibleStore.getState().notesPageSize).toBe(50);
    });

  it('still resets to page 1 on a sort change even when ' +
    'the tag has a stored page', async () => {
      renderRoute('/notes/tag/tag-123', true, {
        tagPagination: {
          'tag-123': { page: 3, pageSize: 25 },
        },
      });
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          'tag-123',
          expect.objectContaining({ page: 3 })
        );
      });
      mockFetchNotes.mockClear();

      const sortSelect = await waitFor(() =>
        visibleSelect('Custom: Ascending')
      );
      fireEvent.mouseDown(sortSelect);
      await userEvent.click(
        await screen.findByText('Date: Newest first')
      );

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenLastCalledWith(
          'tag-123',
          expect.objectContaining({ page: 1 })
        );
      });
    });

  it('restores the new tag\'s page when switching tags ' +
    'while the previous tag\'s load is in flight', async () => {
      // Both mount loads park on the same pending getTags
      // promise: switch tag-123 -> tag-456 before it
      // resolves, so tag-123's stale continuation resumes
      // after tag-456's seed was written. An unguarded
      // consume would discard that seed and fetch page 1.
      let resolveTags!: () => void;
      const tagsPromise = new Promise<void>((res) => {
        resolveTags = res;
      });
      mockGetTags.mockImplementation(() => tagsPromise);
      const { rerender } = renderRoute(
        '/notes/tag/tag-123',
        true,
        {
          tagPagination: {
            'tag-123': { page: 3, pageSize: 25 },
            'tag-456': { page: 5, pageSize: 25 },
          },
        }
      );

      mockUseParams.mockReturnValue({ tagId: 'tag-456' });
      rerender(
        <MemoryRouter initialEntries={['/notes/tag/tag-456']}>
          <TagNotesRoute />
          <LocationProbe />
        </MemoryRouter>
      );

      await act(async () => {
        resolveTags();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          'tag-456',
          expect.objectContaining({ page: 5 })
        );
      });
      // tag-456 must never have been fetched at page 1 —
      // that would clobber its stored record on the next
      // fetchNotes write.
      expect(
        mockFetchNotes.mock.calls.every(
          (call) =>
            !(call[0] === 'tag-456' && call[1]?.page === 1)
        )
      ).toBe(true);
      // The cancelled tag-123 continuation must stop before
      // issuing its fetch at all — fetchNotes' synchronous
      // cache-hit branch has no staleness check, so even a
      // response dropped by requestId would already have
      // rewritten tag-123's stored page.
      expect(
        mockFetchNotes.mock.calls.every(
          (call) => call[0] !== 'tag-123'
        )
      ).toBe(true);
    });

  it('leaves the previous tag\'s stored pagination intact ' +
    'when its in-flight load is cancelled', async () => {
      // Same in-flight A->B switch through the REAL
      // fetchNotes: without the early return after getTags,
      // tag-123's stale continuation issues
      // fetchNotes('tag-123', {page:1}), whose synchronous
      // cache-hit branch — the requestId guard only covers
      // network responses — would persist
      // {page:1, pageSize:50} for tag-123: a page/size the
      // user never viewed (50 is tag-456's restored size).
      mockGetCachedNotes.mockImplementation((id) =>
        id === 'tag-123'
          ? {
              notes: [makeNote()],
              timestamp: 0,
              count: 60,
              hasMore: true,
            }
          : null
      );
      mockApi.getNotes.mockResolvedValue({
        count: 60,
        next: null,
        previous: null,
        results: [makeNote({ id: 'note-b', tag: secondTag })],
      });
      let resolveTags!: () => void;
      const tagsPromise = new Promise<void>((res) => {
        resolveTags = res;
      });
      mockGetTags.mockImplementation(() => tagsPromise);
      const { rerender } = renderRoute(
        '/notes/tag/tag-123',
        true,
        {
          tags: [tag, secondTag],
          fetchNotes: realFetchNotes,
          tagPagination: {
            'tag-123': { page: 3, pageSize: 25 },
            'tag-456': { page: 5, pageSize: 50 },
          },
        }
      );

      mockUseParams.mockReturnValue({ tagId: 'tag-456' });
      rerender(
        <MemoryRouter initialEntries={['/notes/tag/tag-456']}>
          <TagNotesRoute />
          <LocationProbe />
        </MemoryRouter>
      );

      await act(async () => {
        resolveTags();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          useBibleStore.getState().tagPagination['tag-456']
        ).toEqual({ page: 5, pageSize: 50 });
      });
      // tag-123's cancelled loader never issued a fetch —
      // its record keeps the page/size last viewed there.
      expect(
        useBibleStore.getState().tagPagination['tag-123']
      ).toEqual({ page: 3, pageSize: 25 });
      expect(mockApi.getNotes).not.toHaveBeenCalledWith(
        'tag-123',
        expect.anything()
      );
    });

  it('falls back to page 1 when the stored page is not ' +
    'a finite number', async () => {
      // A hand-edited/injected non-finite page must not
      // reach fetchNotes (Math.max(1, Math.floor(Infinity))
      // is Infinity). No legacy fallback either — the tag
      // is not the remembered selection.
      renderRoute('/notes/tag/tag-123', true, {
        lastSelectedTagId: 'tag-999',
        tagPagination: {
          'tag-123': { page: Infinity, pageSize: 25 },
        },
      });

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          'tag-123',
          expect.objectContaining({ page: 1 })
        );
      });
    });

  it('resets to page 1 on a sort change even after an ' +
    'anonymous StrictMode replay', async () => {
      // Anonymous loads reach the restore-seed consume
      // synchronously (no getTags await), so StrictMode's
      // effect replay re-seeded the mount ref — a later
      // sort change then restored the stored page instead
      // of resetting to page 1.
      useBibleStore.setState({
        ...initialState,
        ...storeOverrides,
        tagPagination: {
          'tag-123': { page: 3, pageSize: 25 },
        },
      });
      useAuthStore.setState({
        ...authInitialState,
        token: null,
        isAuthenticated: false,
      });
      mockDomApis();
      render(
        <StrictMode>
          <MemoryRouter
            initialEntries={['/notes/tag/tag-123']}
          >
            <TagNotesRoute />
            <LocationProbe />
          </MemoryRouter>
        </StrictMode>
      );

      await waitFor(() => {
        expect(
          mockFetchNotes.mock.calls.length
        ).toBeGreaterThanOrEqual(2);
      });
      // Both the mount load and the replay restore page 3.
      expect(pagesRequested().every((p) => p === 3)).toBe(true);
      mockFetchNotes.mockClear();

      const sortSelect = await waitFor(() =>
        visibleSelect('Custom: Ascending')
      );
      fireEvent.mouseDown(sortSelect);
      await userEvent.click(
        await screen.findByText('Date: Newest first')
      );

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenLastCalledWith(
          'tag-123',
          expect.objectContaining({ page: 1 })
        );
      });
    });

  it('falls back to the default page size when the stored ' +
    'size is not a toolbar option', async () => {
      // A persisted pageSize outside {5,25,50,100} (e.g.
      // hand-edited localStorage) must not reach the Select
      // or the fetch — restore the default instead.
      renderRoute('/notes/tag/tag-123', true, {
        notesPageSize: 50,
        tagPagination: {
          'tag-123': { page: 3, pageSize: 7 },
        },
      });

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          'tag-123',
          expect.objectContaining({ page: 3 })
        );
      });
      expect(useBibleStore.getState().notesPageSize).toBe(25);
    });

  it('refreshes only the currently selected page', async () => {
    renderRoute();
    const refreshButton = await screen.findByLabelText(
      'Refresh notes'
    );
    mockFetchNotes.mockClear();

    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalledWith(
        'tag-123',
        expect.objectContaining({ page: 3 })
      );
    });
    // The cached pages for this tag are invalidated first so
    // the refetch actually reaches the server.
    expect(mockClearNotesCache).toHaveBeenCalledWith('tag-123');
  });
});

// Cases ported from the deleted TagNotesRoute.test.tsx — that
// suite rotted because it never set auth, so the tag switcher
// (authenticated-only) never rendered and 'Tag not found' was
// stale. These run against an explicitly authenticated store.
describe('TagNotesRoute route states', () => {
  const pageOneOverrides = {
    notes: [verseNote('note-1', 1)],
    notesCount: 1,
    notesPage: 1,
    notesPageSize: 25,
    lastSelectedTagId: 'tag-123',
    tags: [tag, secondTag],
    fetchNotes: mockFetchNotes,
    getTags: mockGetTags,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ tagId: 'tag-123' });
    mockFetchNotes.mockResolvedValue(undefined);
    mockGetTags.mockResolvedValue(undefined);
    mockApi.getTag.mockResolvedValue(tag);
    mockApi.fetchCommentCounts.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows "No tag ID provided" and never fetches when ' +
    'tagId is missing', async () => {
    mockUseParams.mockReturnValue({ tagId: undefined });
    renderRoute('/notes/tag/', true, pageOneOverrides);

    await waitFor(() => {
      expect(
        screen.getByText('No tag ID provided')
      ).toBeInTheDocument();
    });
    expect(mockFetchNotes).not.toHaveBeenCalled();
  });

  it('shows the shared-tag error when the tag cannot be ' +
    'resolved', async () => {
      // Anonymous viewer of a shared link: no own tags, empty
      // note list, and the public tag lookup fails.
      mockApi.getTag.mockRejectedValue(new Error('forbidden'));
      vi.spyOn(console, 'error').mockImplementation(
        () => undefined
      );
      renderRoute('/notes/tag/tag-shared', false, {
        ...pageOneOverrides,
        notes: [],
        notesCount: 0,
        tags: [],
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            'No notes found for this tag.'
          )
        ).toBeInTheDocument();
      });
    });

  it('shows the empty state when the tag has no notes',
    async () => {
      renderRoute('/notes/tag/tag-123', true, {
        ...pageOneOverrides,
        notes: [],
        notesCount: 0,
      });

      await waitFor(() => {
        expect(
          screen.getByText('No notes found for this tag.')
        ).toBeInTheDocument();
      });
      expect(screen.getByText('0 notes')).toBeInTheDocument();
    });

  it('sets showNotes and lastSelectedTagId on mount',
    async () => {
      renderRoute('/notes/tag/tag-123', true, pageOneOverrides);
      await screen.findByLabelText('Share tag link');

      expect(useBibleStore.getState().showNotes).toBe(true);
      expect(
        useBibleStore.getState().lastSelectedTagId
      ).toBe('tag-123');
    });

  it('copies the page URL when the share button is clicked ' +
    'and navigator.share is unavailable', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', {
        ...navigator,
        share: undefined,
        clipboard: { writeText },
      });
      renderRoute('/notes/tag/tag-123', true, pageOneOverrides);

      fireEvent.click(
        await screen.findByLabelText('Share tag link')
      );

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(
          window.location.href
        );
      });
    });

  it('navigates to the picked tag when the tag switcher ' +
    'changes', async () => {
      renderRoute('/notes/tag/tag-123', true, pageOneOverrides);

      const select = await screen.findByLabelText(
        'Filter by tag'
      );
      // Mantine Select displays the label, not the value.
      expect(select).toHaveValue('Bible Study');

      fireEvent.mouseDown(select);
      // Mantine's option selects on the full pointer sequence —
      // a bare fireEvent.click misses the mouseDown handler.
      await userEvent.click(await screen.findByText('Prayer'));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/notes/tag/tag-456'
        );
      });
    });
});

describe('TagNotesRoute play from note', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ tagId: 'tag-123' });
    mockFetchNotes.mockResolvedValue(undefined);
    mockGetTags.mockResolvedValue(undefined);
    mockApi.getTag.mockResolvedValue(tag);
    mockApi.fetchCommentCounts.mockResolvedValue({});
  });

  it('indexes the start note in the verse-only playlist, ' +
    'not in sortedNotes', async () => {
      // Regression: a verse-less note ahead of the clicked
      // note used to shift the start index — the playlist
      // filters verse-less notes out but the index lookup
      // ran over the unfiltered list.
      const notes = [
        makeNote({ id: 'note-quiet', tag_position: 1 }),
        verseNote('note-audible', 2),
      ];
      renderRoute('/notes/tag/tag-123', true, {
        notes,
        notesCount: notes.length,
        notesPage: 1,
        notesPageSize: 25,
        lastSelectedTagId: 'tag-123',
        tags: [tag],
        fetchNotes: mockFetchNotes,
        getTags: mockGetTags,
      });

      fireEvent.click(
        await screen.findByLabelText('play-from-note-audible')
      );

      const state = useBibleStore.getState();
      expect(state.audioPlaylistItems).toHaveLength(1);
      // Playlist itemIds carry a :book:chapter suffix (one
      // item per chapter block); `scope` keeps the note id.
      expect(state.audioPlaylistItems?.[0].itemId).toBe(
        'note-audible:JHN:3'
      );
      expect(state.audioPlaylistItems?.[0].scope).toBe(
        'note-audible'
      );
      // 0 in the filtered playlist — the buggy code said 1.
      expect(state.audioPlaylistStartIndex).toBe(0);
    });
});

describe('TagNotesRoute sort/page-size/delete handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ tagId: 'tag-123' });
    mockFetchNotes.mockResolvedValue(undefined);
    mockGetTags.mockResolvedValue(undefined);
    mockApi.getTag.mockResolvedValue(tag);
    mockApi.fetchCommentCounts.mockResolvedValue({});
    mockApi.deleteNote.mockResolvedValue('');
    mockApi.getNoteOrderIndex.mockResolvedValue([]);
    window.confirm = vi.fn(() => true);
  });

  it('writes the sort to the URL and refetches from the ' +
    'server when notes exceed the page size', async () => {
      renderRoute();
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledTimes(1);
      });
      mockFetchNotes.mockClear();

      fireEvent.mouseDown(visibleSelect('Custom: Ascending'));
      await userEvent.click(
        await screen.findByText('Date: Newest first')
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('location-search')
        ).toHaveTextContent('sort=created_desc');
      });
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledTimes(1);
      });
      // The handler no longer fetches itself — writing ?sort=
      // re-runs the load effect, which issues the single
      // server fetch on the new ordering, restarting at
      // page 1.
      expect(mockFetchNotes).toHaveBeenNthCalledWith(
        1,
        'tag-123',
        { ordering: '-created', page: 1, includeDescendants: false }
      );
    });

  it('sorts client-side without its own fetch when every ' +
    'note fits on one page', async () => {
      renderRoute('/notes/tag/tag-123', true, {
        notes: [verseNote('note-1', 1)],
        notesCount: 1,
        notesPage: 1,
        notesPageSize: 25,
        lastSelectedTagId: 'tag-123',
        tags: [tag],
        fetchNotes: mockFetchNotes,
        getTags: mockGetTags,
      });
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledTimes(1);
      });
      mockFetchNotes.mockClear();

      fireEvent.mouseDown(visibleSelect('Custom: Ascending'));
      await userEvent.click(
        await screen.findByText('Date: Newest first')
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('location-search')
        ).toHaveTextContent('sort=created_desc');
      });
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledTimes(1);
      });
      // The sole call is the load effect re-running on the
      // new sortOrder (sort is a URL param + effect dep);
      // the handler itself skips fetching because
      // notesCount <= notesPageSize.
      await act(async () => Promise.resolve());
      expect(mockFetchNotes).toHaveBeenCalledTimes(1);
      expect(mockFetchNotes).toHaveBeenLastCalledWith(
        'tag-123',
        { ordering: '-created', page: 1, includeDescendants: false }
      );
    });

  it('clears the cache and refetches from page 1 when the ' +
    'page size changes', async () => {
      renderRoute();
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledTimes(1);
      });
      mockFetchNotes.mockClear();
      mockClearNotesCache.mockClear();

      fireEvent.mouseDown(visibleSelect('25'));
      await userEvent.click(await screen.findByText('50'));

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          'tag-123',
          {
            ordering: undefined, page: 1, append: false,
            includeDescendants: false,
          }
        );
      });
      expect(useBibleStore.getState().notesPageSize).toBe(50);
      expect(mockClearNotesCache).toHaveBeenCalledWith(
        'tag-123'
      );
    });

  it('falls back to the new last page when deleting the ' +
    'last note on a page', async () => {
      // Page 3 of 51 notes (25/page) holds a single note;
      // deleting it leaves 50 notes -> last page is now 2.
      renderRoute('/notes/tag/tag-123', true, {
        notes: [makeNote()],
        notesCount: 51,
        notesPage: 3,
        notesPageSize: 25,
        lastSelectedTagId: 'tag-123',
        tags: [tag],
        fetchNotes: mockFetchNotes,
        getTags: mockGetTags,
      });
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(mockApi.getNoteOrderIndex).toHaveBeenCalledTimes(
          1
        );
      });
      mockFetchNotes.mockClear();
      mockClearNotesCache.mockClear();

      await clickRemove('note-1');

      await waitFor(() => {
        expect(mockApi.deleteNote).toHaveBeenCalledWith(
          'note-1'
        );
      });
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenLastCalledWith(
          'tag-123',
          { ordering: undefined, page: 2, includeDescendants: false }
        );
      });
      // Cache invalidation now lives in the store's deleteNote
      // action, which clears the whole notes cache (no tag arg)
      // rather than the route clearing the tag's pages.
      expect(mockClearNotesCache).toHaveBeenCalledWith();
      // The order index resyncs after the delete — the
      // removed note's rank shifted every entry below it.
      await waitFor(() => {
        expect(mockApi.getNoteOrderIndex).toHaveBeenCalledTimes(
          2
        );
      });
    });

  it('stays on the current page when deleting a note that ' +
    'is not the page\'s last', async () => {
      // Page 1 of 51 notes keeps page 1 after the delete
      // (min(1, ceil(50/25)) = 1).
      renderRoute('/notes/tag/tag-123', true, {
        notes: [makeNote()],
        notesCount: 51,
        notesPage: 1,
        notesPageSize: 25,
        lastSelectedTagId: 'tag-123',
        tags: [tag],
        fetchNotes: mockFetchNotes,
        getTags: mockGetTags,
      });
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledTimes(1);
      });
      mockFetchNotes.mockClear();

      await clickRemove('note-1');

      await waitFor(() => {
        expect(mockApi.deleteNote).toHaveBeenCalledWith(
          'note-1'
        );
      });
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenLastCalledWith(
          'tag-123',
          { ordering: undefined, page: 1, includeDescendants: false }
        );
      });
    });

  it('does nothing when the delete confirm is cancelled',
    async () => {
      window.confirm = vi.fn(() => false);
      renderRoute();
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledTimes(1);
      });
      mockFetchNotes.mockClear();

      await clickRemove('note-1');
      await act(async () => Promise.resolve());

      expect(mockApi.deleteNote).not.toHaveBeenCalled();
      expect(mockFetchNotes).not.toHaveBeenCalled();
      expect(mockClearNotesCache).not.toHaveBeenCalled();
    });
});
