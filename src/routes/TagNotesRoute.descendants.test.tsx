import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { mockDomApis } from '../__tests__/helpers';
import TagNotesRoute from './TagNotesRoute';
import { useBibleStore, initialState } from '../store';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../stores/authStore';
import * as api from '../api';
import { Note, Tag } from '../types';

// `?descendants=1` merged subtree view: the toolbar's
// "Include sub-tags" switch drives a URL param that folds
// into fetchNotes as `includeDescendants`, groups the page
// into one TagSection per tag, and disables per-tag reorder.

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
const mockFetchNotes = vi.fn();
const mockGetTags = vi.fn();

const parentTag: Tag = {
  id: 'tag-123',
  name: 'Bible Study',
  parent_tag: null,
  public: false,
  created_at: '',
  updated_at: '',
};

const childTag: Tag = {
  id: 'tag-456',
  name: 'Prayer',
  parent_tag: 'tag-123',
  public: false,
  created_at: '',
  updated_at: '',
};

const noteFor = (id: string, tag: Tag): Note => ({
  id,
  note_text: `Note ${id}`,
  public: false,
  is_owner: true,
  created_at: '',
  updated_at: '',
  tag,
  verses: [],
  tag_position: null,
});

const renderRoute = (
  url: string,
  notes: Note[]
) => {
  useBibleStore.setState({
    ...initialState,
    notes,
    notesCount: notes.length,
    notesPage: 1,
    notesPageSize: 25,
    lastSelectedTagId: 'tag-123',
    tags: [parentTag, childTag],
    fetchNotes: mockFetchNotes,
    getTags: mockGetTags,
  });
  useAuthStore.setState({
    ...authInitialState,
    token: 'token',
    isAuthenticated: true,
  });
  mockDomApis();
  return render(
    <MemoryRouter initialEntries={[url]}>
      <TagNotesRoute />
    </MemoryRouter>
  );
};

describe('TagNotesRoute include-descendants view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ tagId: 'tag-123' });
    mockFetchNotes.mockResolvedValue(undefined);
    mockGetTags.mockResolvedValue(undefined);
    mockApi.getTag.mockResolvedValue(parentTag);
    mockApi.fetchCommentCounts.mockResolvedValue({});
    mockApi.getNoteOrderIndex.mockResolvedValue([]);
  });

  it('sends include_descendants when ?descendants=1 is set',
    async () => {
      renderRoute(
        '/notes/tag/tag-123?descendants=1',
        [noteFor('n1', parentTag)]
      );

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          'tag-123',
          expect.objectContaining({
            includeDescendants: true,
          })
        );
      });
    });

  it('fetches direct-only notes without the param',
    async () => {
      renderRoute(
        '/notes/tag/tag-123',
        [noteFor('n1', parentTag)]
      );

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          'tag-123',
          expect.objectContaining({
            includeDescendants: false,
          })
        );
      });
    });

  it('groups merged notes under one heading per tag',
    async () => {
      renderRoute('/notes/tag/tag-123?descendants=1', [
        noteFor('n1', parentTag),
        noteFor('n2', childTag),
      ]);

      await waitFor(() => {
        // Both the section heading and the note card render
        // the tag name — getAllByRole, not getByRole.
        expect(
          screen.getAllByRole('heading', {
            name: 'Bible Study',
          }).length
        ).toBeGreaterThan(0);
        expect(
          screen.getAllByRole('heading', { name: 'Prayer' })
            .length
        ).toBeGreaterThan(0);
      });
      expect(screen.getByText('Note n1')).toBeInTheDocument();
      expect(screen.getByText('Note n2')).toBeInTheDocument();
    });

  it('disables the per-tag order index in merged mode',
    async () => {
      // custom_asc + ownership would normally fetch the
      // order index — the merged view suppresses it.
      renderRoute(
        '/notes/tag/tag-123?descendants=1&sort=custom_asc',
        [noteFor('n1', parentTag)]
      );

      await waitFor(() => {
        expect(
          screen.getByText('Note n1')
        ).toBeInTheDocument();
      });
      expect(mockApi.getNoteOrderIndex).not.toHaveBeenCalled();
    });

  it('shows the merged empty state', async () => {
    renderRoute('/notes/tag/tag-123?descendants=1', []);

    await waitFor(() => {
      expect(
        screen.getByText('No notes in this tag or its sub-tags.')
      ).toBeInTheDocument();
    });
  });

  it('renders the "Include sub-tags" switch only when the ' +
    'tag has children, and toggling it updates the URL',
    async () => {
      renderRoute('/notes/tag/tag-123', [noteFor('n1', parentTag)]);

      const toggle = await screen.findByLabelText(
        'Include sub-tags'
      );
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          'tag-123',
          expect.objectContaining({
            includeDescendants: true,
          })
        );
      });
    });

  it('hides the switch when the viewed tag has no children',
    async () => {
      // Only the parent tag exists — tag-123 has no children.
      useBibleStore.setState({
        ...initialState,
        notes: [noteFor('n1', parentTag)],
        notesCount: 1,
        notesPage: 1,
        notesPageSize: 25,
        lastSelectedTagId: 'tag-123',
        tags: [parentTag],
        fetchNotes: mockFetchNotes,
        getTags: mockGetTags,
      });
      useAuthStore.setState({
        ...authInitialState,
        token: 'token',
        isAuthenticated: true,
      });
      mockDomApis();
      render(
        <MemoryRouter initialEntries={['/notes/tag/tag-123']}>
          <TagNotesRoute />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Note n1')
        ).toBeInTheDocument();
      });
      expect(
        screen.queryByLabelText('Include sub-tags')
      ).not.toBeInTheDocument();
    });
});
