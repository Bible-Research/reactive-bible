import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { showNotification } from '@mantine/notifications';
import { mockDomApis } from '../__tests__/helpers';
import TagNotesRoute from './TagNotesRoute';
import {
  useBibleStore,
  initialState,
} from '../store';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../stores/authStore';
import * as api from '../api';
import {
  Note,
  NoteOrderIndexEntry,
  Tag,
} from '../types';

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

// Automock every api function but keep the real ConflictError
// class — the store's moveNoteAfter relies on `instanceof`.
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
vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

const mockApi = vi.mocked(api);

const tag: Tag = {
  id: 'tag-123',
  name: 'Bible Study',
  parent_tag: null,
  public: false,
  created_at: '',
  updated_at: '',
};

const makeNote = (
  id: string,
  position: number,
  isOwner = true
): Note => ({
  id,
  note_text: `Note ${id}`,
  public: true,
  is_owner: isOwner,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '',
  tag,
  verses: [
    {
      book: 'John',
      chapter: 3,
      verse: 16,
      text: 'For God so loved the world',
    },
  ],
  tag_position: position,
});

const notes = [makeNote('note-1', 1), makeNote('note-2', 2)];

const orderIndex: NoteOrderIndexEntry[] = [
  {
    id: 'note-1',
    tag_position: 1,
    book: 'John',
    chapter: 3,
    verse_start: 16,
    verse_end: 18,
  },
  {
    id: 'note-2',
    tag_position: 2,
    book: 'Genesis',
    chapter: 1,
    verse_start: 1,
    verse_end: 1,
  },
];

const mockFetchNotes = vi.fn();
const mockGetTags = vi.fn();

const storeOverrides = {
  notes,
  notesCount: notes.length,
  notesPage: 1,
  notesPageSize: 25,
  lastSelectedTagId: 'tag-123',
  tags: [tag],
  fetchNotes: mockFetchNotes,
  getTags: mockGetTags,
};

const renderRoute = (
  route = '/notes/tag/tag-123',
  isAuthenticated = true,
  extraStoreOverrides = {}
) => {
  useBibleStore.setState({
    ...initialState,
    ...storeOverrides,
    ...extraStoreOverrides,
  });
  useAuthStore.setState({
    ...authInitialState,
    isAuthenticated,
  });
  mockDomApis();
  return render(
    <MemoryRouter initialEntries={[route]}>
      <TagNotesRoute />
    </MemoryRouter>
  );
};

const openOrderMenu = async (noteId: string) => {
  const badge = await screen.findByLabelText(`note-order-${noteId}`);
  fireEvent.click(badge);
};

describe('TagNotesRoute order menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ tagId: 'tag-123' });
    mockFetchNotes.mockResolvedValue(undefined);
    mockGetTags.mockResolvedValue(undefined);
    mockApi.getTag.mockResolvedValue(tag);
    mockApi.fetchCommentCounts.mockResolvedValue({});
    mockApi.getNoteOrderIndex.mockResolvedValue(orderIndex);
    mockApi.moveNote.mockResolvedValue({
      note_id: 'note-1',
      tag_position: 1.5,
      rebalanced: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows order badges in custom_asc when authenticated', async () => {
    renderRoute();

    const badge1 = await screen.findByLabelText(
      'note-order-note-1'
    );
    const badge2 = await screen.findByLabelText(
      'note-order-note-2'
    );
    expect(badge1).toHaveTextContent('#1');
    expect(badge2).toHaveTextContent('#2');
  });

  it('hides badges when not authenticated', async () => {
    renderRoute('/notes/tag/tag-123', false);

    await waitFor(() => {
      expect(
        screen.getAllByText('John 3:16').length
      ).toBeGreaterThan(0);
    });
    expect(
      screen.queryByLabelText('note-order-note-1')
    ).not.toBeInTheDocument();
    expect(mockApi.getNoteOrderIndex).not.toHaveBeenCalled();
  });

  it('fails closed when any loaded note is not owned ' +
    '(is_owner=false)', async () => {
    // A shared public tag can carry foreign notes; the backend
    // move/reorder endpoints only touch the requester's own
    // rows, so the whole reorder UI must stay hidden.
    const mixed = [
      makeNote('note-1', 1),
      makeNote('note-2', 2, false),
    ];
    const { container } = renderRoute(
      '/notes/tag/tag-123',
      true,
      { notes: mixed }
    );

    await waitFor(() => {
      expect(
        screen.getAllByText('John 3:16').length
      ).toBeGreaterThan(0);
    });
    expect(
      screen.queryByLabelText('note-order-note-1')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('note-order-note-2')
    ).not.toBeInTheDocument();
    expect(mockApi.getNoteOrderIndex).not.toHaveBeenCalled();
    // Non-draggable render path: no sortable drag handles.
    expect(
      container.querySelector(
        '[aria-roledescription="sortable"]'
      )
    ).toBeNull();
  });

  it('hides badges for non-custom sort orders', async () => {
    renderRoute('/notes/tag/tag-123?sort=created_desc');

    await waitFor(() => {
      expect(
        screen.getAllByText('John 3:16').length
      ).toBeGreaterThan(0);
    });
    expect(
      screen.queryByLabelText('note-order-note-1')
    ).not.toBeInTheDocument();
    expect(mockApi.getNoteOrderIndex).not.toHaveBeenCalled();
  });

  it('lists index entries with passage labels', async () => {
    renderRoute();
    await openOrderMenu('note-1');

    expect(
      await screen.findByText('#1 — John 3:16-18')
    ).toBeInTheDocument();
    expect(
      screen.getByText('#2 — Genesis 1:1')
    ).toBeInTheDocument();
    expect(screen.getByText('Move to top')).toBeInTheDocument();
  });

  it('moves after the picked entry with after placement ' +
    'in custom_asc', async () => {
    renderRoute();
    await openOrderMenu('note-1');
    fireEvent.click(await screen.findByText('#2 — Genesis 1:1'));

    await waitFor(() => {
      expect(mockApi.moveNote).toHaveBeenCalledWith(
        'tag-123',
        'note-1',
        'note-2',
        'after'
      );
    });
  });

  it('translates display after to canonical before ' +
    'in custom_desc', async () => {
    renderRoute('/notes/tag/tag-123?sort=custom_desc');
    await openOrderMenu('note-1');
    fireEvent.click(await screen.findByText('#2 — Genesis 1:1'));

    await waitFor(() => {
      expect(mockApi.moveNote).toHaveBeenCalledWith(
        'tag-123',
        'note-1',
        'note-2',
        'before'
      );
    });
  });

  it('moves to top via the first index entry with ' +
    'before placement', async () => {
    renderRoute();
    await openOrderMenu('note-2');
    fireEvent.click(await screen.findByText('Move to top'));

    await waitFor(() => {
      expect(mockApi.moveNote).toHaveBeenCalledWith(
        'tag-123',
        'note-2',
        'note-1',
        'before'
      );
    });
  });

  it('moves to visual top via the last index entry with ' +
    'after placement in custom_desc', async () => {
    renderRoute('/notes/tag/tag-123?sort=custom_desc');
    await openOrderMenu('note-1');
    fireEvent.click(await screen.findByText('Move to top'));

    await waitFor(() => {
      expect(mockApi.moveNote).toHaveBeenCalledWith(
        'tag-123',
        'note-1',
        'note-2',
        'after'
      );
    });
  });

  it('disables move-to-top for the visually first note ' +
    'in custom_desc', async () => {
    // note-2 is canonical last = visual top in desc.
    renderRoute('/notes/tag/tag-123?sort=custom_desc');
    await openOrderMenu('note-2');

    const item = await screen.findByText('Move to top');
    expect(item.closest('button')).toBeDisabled();
  });

  it('lists entries in display order under custom_desc',
    async () => {
      renderRoute('/notes/tag/tag-123?sort=custom_desc');
      await openOrderMenu('note-1');

      // custom_desc displays the index reversed on the page,
      // so the picker lists #2 ahead of #1.
      const high = await screen.findByText('#2 — Genesis 1:1');
      const low = screen.getByText('#1 — John 3:16-18');
      expect(
        high.compareDocumentPosition(low) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

  it('refetches the current page after a plain move so ' +
    'page membership stays authoritative', async () => {
    renderRoute();
    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalledTimes(1);
    });

    await openOrderMenu('note-1');
    fireEvent.click(await screen.findByText('#2 — Genesis 1:1'));

    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalledTimes(2);
    });
    expect(mockFetchNotes).toHaveBeenLastCalledWith(
      'tag-123',
      { ordering: undefined, page: 1 }
    );
  });

  it('refetches the current ordering and page when the ' +
    'server rebalances', async () => {
    mockApi.moveNote.mockResolvedValue({
      note_id: 'note-1',
      tag_position: 7,
      rebalanced: true,
    });
    renderRoute(
      '/notes/tag/tag-123?sort=custom_desc',
      true,
      { notesOrdering: '-custom', notesPage: 2 }
    );
    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalledTimes(1);
    });

    await openOrderMenu('note-1');
    fireEvent.click(
      await screen.findByText('#2 — Genesis 1:1')
    );

    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalledTimes(2);
    });
    expect(mockFetchNotes).toHaveBeenLastCalledWith(
      'tag-123',
      { ordering: '-custom', page: 2 }
    );
  });

  it('refetches the current page after a ConflictError',
    async () => {
      mockApi.moveNote.mockRejectedValue(
        new api.ConflictError('stale positions')
      );
      renderRoute(
        '/notes/tag/tag-123',
        true,
        { notesPage: 2 }
      );
      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledTimes(1);
      });

      await openOrderMenu('note-1');
      fireEvent.click(
        await screen.findByText('#2 — Genesis 1:1')
      );

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledTimes(2);
      });
      expect(mockFetchNotes).toHaveBeenLastCalledWith(
        'tag-123',
        { ordering: undefined, page: 2 }
      );
    });

  it('shows a conflict toast and resyncs the order index ' +
    'when a move hits a ConflictError', async () => {
      mockApi.moveNote.mockRejectedValue(
        new api.ConflictError('stale positions')
      );
      renderRoute();
      await waitFor(() => {
        expect(mockApi.getNoteOrderIndex).toHaveBeenCalledTimes(1);
      });

      await openOrderMenu('note-1');
      fireEvent.click(
        await screen.findByText('#2 — Genesis 1:1')
      );

      // The store surfaces a distinct conflict toast, and the
      // route's finally-block refetches the order index so the
      // badges resync with the post-conflict positions.
      await waitFor(() => {
        expect(mockApi.getNoteOrderIndex).toHaveBeenCalledTimes(2);
      });
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Conflict',
          color: 'orange',
        })
      );
      // The page the user is on is also refreshed.
      expect(mockFetchNotes).toHaveBeenCalledTimes(2);
    });

  it('renders no badge for a note missing from the index',
    async () => {
      const extraNotes = [...notes, makeNote('note-3', 3)];
      renderRoute('/notes/tag/tag-123', true, {
        notes: extraNotes,
        notesCount: extraNotes.length,
      });

      expect(
        await screen.findByLabelText('note-order-note-1')
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText('note-order-note-3')
      ).not.toBeInTheDocument();
    });

  it('renders notes without badges when the order index ' +
    'fails to load', async () => {
      vi.spyOn(console, 'error').mockImplementation(
        () => undefined
      );
      mockApi.getNoteOrderIndex.mockRejectedValue(
        new Error('boom')
      );
      renderRoute();

      await waitFor(() => {
        expect(mockApi.getNoteOrderIndex).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(
          screen.getAllByText('John 3:16').length
        ).toBeGreaterThan(0);
      });
      expect(
        screen.queryByLabelText('note-order-note-1')
      ).not.toBeInTheDocument();
    });

  it('refetches the order index after a move', async () => {
    renderRoute();
    await waitFor(() => {
      expect(mockApi.getNoteOrderIndex).toHaveBeenCalledTimes(1);
    });

    await openOrderMenu('note-1');
    fireEvent.click(await screen.findByText('#2 — Genesis 1:1'));

    await waitFor(() => {
      expect(mockApi.getNoteOrderIndex).toHaveBeenCalledTimes(2);
    });
  });
});
