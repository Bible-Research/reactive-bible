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
import { clearNotesCache } from '../utils/cacheManager';
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

const tag: Tag = {
  id: 'tag-123',
  name: 'Bible Study',
  parent_tag: null,
  created_at: '',
  updated_at: '',
};

const secondTag: Tag = {
  id: 'tag-456',
  name: 'Prayer',
  parent_tag: null,
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
          { ordering: '-custom', page: 3 }
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
            'No public notes available for this tag.'
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
      expect(state.audioPlaylistItems?.[0].itemId).toBe(
        'note-audible'
      );
      // 0 in the filtered playlist — the buggy code said 1.
      expect(state.audioPlaylistStartIndex).toBe(0);
    });
});

describe('TagNotesRoute sort/page-size/delete handlers', () => {
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
      // The handler only rewrites the URL — the load effect
      // re-runs on the new sort and issues the single server
      // refetch, restarting at page 1.
      expect(mockFetchNotes).toHaveBeenCalledWith(
        'tag-123',
        { ordering: '-created', page: 1 }
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
        { ordering: '-created', page: 1 }
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
          { ordering: undefined, page: 1, append: false }
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

      fireEvent.click(
        await screen.findByLabelText('remove-note')
      );

      await waitFor(() => {
        expect(mockApi.deleteNote).toHaveBeenCalledWith(
          'note-1'
        );
      });
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenLastCalledWith(
          'tag-123',
          { ordering: undefined, page: 2 }
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

      fireEvent.click(
        await screen.findByLabelText('remove-note')
      );

      await waitFor(() => {
        expect(mockApi.deleteNote).toHaveBeenCalledWith(
          'note-1'
        );
      });
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenLastCalledWith(
          'tag-123',
          { ordering: undefined, page: 1 }
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

      fireEvent.click(
        await screen.findByLabelText('remove-note')
      );
      await act(async () => Promise.resolve());

      expect(mockApi.deleteNote).not.toHaveBeenCalled();
      expect(mockFetchNotes).not.toHaveBeenCalled();
      expect(mockClearNotesCache).not.toHaveBeenCalled();
    });
});
