import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor, fireEvent, act } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/helpers';
import TagNotesRoute from '../TagNotesRoute';
import { useAuthStore } from '../../stores/authStore';
import * as api from '../../api';
import { Tag } from '../../types';

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

const note = {
  id: 'note-1',
  note_text: 'A note',
  public: true,
  is_owner: true,
  created_at: '',
  updated_at: '',
  tag,
  verses: [],
  tag_position: 1,
};

const mockFetchNotes = vi.fn();
const mockGetTags = vi.fn();

// Simulates a user who left tag-123 sitting on page 3
// (25 notes per page, 60 notes total).
const storeOverrides = {
  notes: [note],
  notesCount: 60,
  notesPage: 3,
  notesPageSize: 25,
  lastSelectedTagId: 'tag-123',
  tags: [tag],
  fetchNotes: mockFetchNotes,
  getTags: mockGetTags,
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
    renderWithProviders(<TagNotesRoute />, { storeOverrides });
    await waitFor(() => {
      expect(
        document.querySelector('.tabler-icon-refresh')
      ).toBeTruthy();
    });
    mockFetchNotes.mockClear();

    const refreshButton = document
      .querySelector('.tabler-icon-refresh')
      ?.closest('button');
    fireEvent.click(refreshButton as HTMLElement);

    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalledWith(
        'tag-123',
        expect.objectContaining({ page: 3 })
      );
    });
  });
});
