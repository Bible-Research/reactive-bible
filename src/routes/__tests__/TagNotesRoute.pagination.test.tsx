import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import {
  renderWithProviders,
  mockDomApis,
} from '../../__tests__/helpers';
import TagNotesRoute from '../TagNotesRoute';
import { useBibleStore, initialState } from '../../store';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../../stores/authStore';
import * as api from '../../api';
import { Note, Tag } from '../../types';

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
vi.mock('../../api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../api')>();
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
vi.mock('../../utils/cacheManager');

const mockApi = vi.mocked(api);

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
