import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
// class — the store actions rely on `instanceof`.
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

// Replace the DnD-heavy TagSection with a button that replays
// the props.onReorder call a drag would fire — dnd-kit pointer
// gestures can't be simulated reliably under happy-dom.
vi.mock('../components/TagSection', () => ({
  default: ({
    tagId = '',
    onReorder,
    currentPage = 1,
    pageSize = 25,
  }: {
    tagId?: string;
    onReorder?: (
      tagId: string,
      noteIds: string[],
      currentPage: number,
      pageSize: number
    ) => void;
    currentPage?: number;
    pageSize?: number;
  }) => (
    <button
      type="button"
      aria-label="trigger-reorder"
      onClick={() =>
        onReorder?.(
          tagId,
          ['note-2', 'note-1'],
          currentPage,
          pageSize
        )
      }
    />
  ),
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

const makeNote = (id: string, position: number): Note => ({
  id,
  note_text: `Note ${id}`,
  public: true,
  is_owner: true,
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

const renderRoute = (route = '/notes/tag/tag-123') => {
  useBibleStore.setState({
    ...initialState,
    ...storeOverrides,
  });
  useAuthStore.setState({
    ...authInitialState,
    isAuthenticated: true,
  });
  mockDomApis();
  return render(
    <MemoryRouter initialEntries={[route]}>
      <TagNotesRoute />
    </MemoryRouter>
  );
};

describe('TagNotesRoute drag reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ tagId: 'tag-123' });
    mockFetchNotes.mockResolvedValue(undefined);
    mockGetTags.mockResolvedValue(undefined);
    mockApi.getTag.mockResolvedValue(tag);
    mockApi.fetchCommentCounts.mockResolvedValue({});
    mockApi.getNoteOrderIndex.mockResolvedValue(orderIndex);
    mockApi.reorderNotes.mockResolvedValue(undefined);
  });

  it('refetches the order index after a drag reorder ' +
    'resolves', async () => {
    renderRoute();
    await waitFor(() => {
      expect(mockApi.getNoteOrderIndex).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(
      await screen.findByLabelText('trigger-reorder')
    );

    // The store recomputes positions from the passed ids and
    // page before calling the API.
    await waitFor(() => {
      expect(mockApi.reorderNotes).toHaveBeenCalledWith(
        'tag-123',
        [
          { note_id: 'note-2', position: 1 },
          { note_id: 'note-1', position: 2 },
        ]
      );
    });
    await waitFor(() => {
      expect(mockApi.getNoteOrderIndex).toHaveBeenCalledTimes(2);
    });
    // The refetch is issued after the reorder settles so the
    // new index reflects the post-drag order.
    expect(
      mockApi.getNoteOrderIndex.mock.invocationCallOrder[1]
    ).toBeGreaterThan(
      mockApi.reorderNotes.mock.invocationCallOrder[0]
    );
  });

  it('refetches the order index even when the reorder ' +
    'fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(
      () => undefined
    );
    mockApi.reorderNotes.mockRejectedValue(new Error('boom'));
    renderRoute();
    await waitFor(() => {
      expect(mockApi.getNoteOrderIndex).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(
      await screen.findByLabelText('trigger-reorder')
    );

    await waitFor(() => {
      expect(mockApi.getNoteOrderIndex).toHaveBeenCalledTimes(2);
    });
  });
});
