import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { mockDomApis, renderWithProviders } from '../../__tests__/helpers';
import TagNotesRoute from '../TagNotesRoute';
import { useBibleStore, type BibleState } from '../../store';
import { useAuthStore } from '../../stores/authStore';
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

vi.mock('../../api');
vi.mock('../../utils/cacheManager');

const mockApi = vi.mocked(api);

const tag: Tag = {
  id: 'tag-123',
  name: 'Bible Study',
  parent_tag: null,
  created_at: '',
  updated_at: '',
};

// Each note gets a distinct verse so its card heading
// ("John 3:<verse>") is unique on the page.
const makeNote = (id: string, verse: number): Note => ({
  id,
  note_text: `Text of ${id}`,
  public: true,
  is_owner: true,
  created_at: '',
  updated_at: '',
  tag,
  verses: [
    { book: 'John', chapter: 3, verse, text: `Verse ${verse}` },
  ],
  tag_position: verse,
});

const mockFetchNotes = vi.fn();
const mockGetTags = vi.fn();

const renderRoute = (
  notes: Note[],
  overrides: Partial<BibleState> = {}
) =>
  renderWithProviders(<TagNotesRoute />, {
    storeOverrides: {
      notes,
      notesCount: notes.length,
      notesPage: 1,
      notesPageSize: 25,
      lastSelectedTagId: 'tag-123',
      tags: [tag],
      fetchNotes: mockFetchNotes,
      getTags: mockGetTags,
      ...overrides,
    },
    authStoreState: {
      token: 't',
      isAuthenticated: true,
      isLoading: false,
    },
  });

const deleteButtons = () => screen.getAllByLabelText('remove-note');

describe('TagNotesRoute note deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ tagId: 'tag-123' });
    mockFetchNotes.mockResolvedValue(undefined);
    mockGetTags.mockResolvedValue(undefined);
    mockApi.getTag.mockResolvedValue(tag);
    mockApi.fetchCommentCounts.mockResolvedValue({});
    mockApi.deleteNote.mockResolvedValue('');
    window.confirm = vi.fn(() => true);
  });

  it('removes the card reactively and refetches the page',
    async () => {
      renderRoute(
        [makeNote('note-1', 16), makeNote('note-2', 17)],
        { notesCount: 40, notesPage: 2 }
      );
      await waitFor(() => {
        expect(screen.getByText('John 3:16')).toBeInTheDocument();
      });
      mockFetchNotes.mockClear();

      // Keep the refetch pending so the card's removal can be
      // observed while the latest page state is still being
      // retrieved.
      let resolveRefetch: (() => void) | undefined;
      mockFetchNotes.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveRefetch = resolve;
          })
      );

      fireEvent.click(deleteButtons()[0]);

      // The card is removed as soon as the DELETE resolves,
      // without waiting for the page refetch.
      await waitFor(() => {
        expect(mockApi.deleteNote).toHaveBeenCalledWith('note-1');
        expect(
          screen.queryByText('John 3:16')
        ).not.toBeInTheDocument();
      });
      expect(screen.getByText('John 3:17')).toBeInTheDocument();
      expect(useBibleStore.getState().notesCount).toBe(39);

      // Latest server state for the current page is requested
      // while the card is already gone.
      expect(mockFetchNotes).toHaveBeenCalledWith(
        'tag-123',
        expect.objectContaining({ page: 2 })
      );

      await act(async () => {
        resolveRefetch?.();
      });
    });

  it('falls back to the last page when deleting the only note ' +
    'on the page', async () => {
      renderRoute([makeNote('note-51', 16)], {
        notesCount: 51,
        notesPage: 3,
      });
      await waitFor(() => {
        expect(screen.getByText('John 3:16')).toBeInTheDocument();
      });
      mockFetchNotes.mockClear();

      fireEvent.click(deleteButtons()[0]);

      await waitFor(() => {
        expect(
          screen.getByText('No notes found for this tag.')
        ).toBeInTheDocument();
      });
      // 51 - 1 = 50 notes, so page 3 no longer exists.
      expect(mockFetchNotes).toHaveBeenCalledWith(
        'tag-123',
        expect.objectContaining({ page: 2 })
      );
    });

  it('refetches with the active ordering on sorted views',
    async () => {
      // Rendered directly (not via renderWithProviders) so the
      // MemoryRouter can carry ?sort=created_desc.
      useBibleStore.setState({
        notes: [makeNote('note-1', 16)],
        notesCount: 5,
        notesPage: 1,
        notesPageSize: 25,
        lastSelectedTagId: 'tag-123',
        tags: [tag],
        fetchNotes: mockFetchNotes,
        getTags: mockGetTags,
        versesFolded: false,
      });
      useAuthStore.setState({
        token: 't',
        isAuthenticated: true,
        isLoading: false,
      });
      mockDomApis();
      render(
        <MemoryRouter
          initialEntries={['/notes/tag/tag-123?sort=created_desc']}
        >
          <Routes>
            <Route
              path="/notes/tag/:tagId"
              element={<TagNotesRoute />}
            />
          </Routes>
        </MemoryRouter>
      );
      await waitFor(() => {
        expect(screen.getByText('John 3:16')).toBeInTheDocument();
      });
      mockFetchNotes.mockClear();

      fireEvent.click(deleteButtons()[0]);

      await waitFor(() => {
        expect(mockApi.deleteNote).toHaveBeenCalledWith('note-1');
      });
      expect(mockFetchNotes).toHaveBeenCalledWith(
        'tag-123',
        expect.objectContaining({ ordering: '-created', page: 1 })
      );
    });

  it('ignores a second delete while one is in flight',
    async () => {
      // Hold the first DELETE open so a second click overlaps it.
      let resolveDelete: ((value: string) => void) | undefined;
      mockApi.deleteNote.mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveDelete = resolve;
          })
      );
      renderRoute([makeNote('note-1', 16), makeNote('note-2', 17)]);
      await waitFor(() => {
        expect(screen.getByText('John 3:16')).toBeInTheDocument();
      });

      fireEvent.click(deleteButtons()[0]);
      fireEvent.click(deleteButtons()[1]);

      await waitFor(() => {
        expect(mockApi.deleteNote).toHaveBeenCalledTimes(1);
      });

      await act(async () => {
        resolveDelete?.('');
      });
      await waitFor(() => {
        expect(
          screen.queryByText('John 3:16')
        ).not.toBeInTheDocument();
      });
    });

  it('does nothing when the confirmation is cancelled',
    async () => {
      window.confirm = vi.fn(() => false);
      renderRoute([makeNote('note-1', 16)]);
      await waitFor(() => {
        expect(screen.getByText('John 3:16')).toBeInTheDocument();
      });
      mockFetchNotes.mockClear();

      fireEvent.click(deleteButtons()[0]);

      expect(mockApi.deleteNote).not.toHaveBeenCalled();
      expect(mockFetchNotes).not.toHaveBeenCalled();
      expect(screen.getByText('John 3:16')).toBeInTheDocument();
    });

  it('keeps the note card when the delete request fails',
    async () => {
      mockApi.deleteNote.mockRejectedValue(new Error('boom'));
      renderRoute([makeNote('note-1', 16)]);
      await waitFor(() => {
        expect(screen.getByText('John 3:16')).toBeInTheDocument();
      });
      mockFetchNotes.mockClear();

      fireEvent.click(deleteButtons()[0]);

      await waitFor(() => {
        expect(mockApi.deleteNote).toHaveBeenCalledWith('note-1');
      });
      // The card stays and no refetch is attempted.
      expect(screen.getByText('John 3:16')).toBeInTheDocument();
      expect(mockFetchNotes).not.toHaveBeenCalled();
      expect(useBibleStore.getState().notes).toHaveLength(1);
    });
});
