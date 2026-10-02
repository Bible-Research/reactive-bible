import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/helpers';
import TagNotesRoute from '../TagNotesRoute';
import { useBibleStore, type BibleState } from '../../store';
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

      // Latest server state for the current page is retrieved.
      expect(mockFetchNotes).toHaveBeenCalledWith(
        'tag-123',
        expect.objectContaining({ page: 2 })
      );
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
