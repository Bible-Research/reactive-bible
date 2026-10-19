import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor, screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/helpers';
import TagNotesRoute from '../TagNotesRoute';
import * as api from '../../api';
import { Tag } from '../../types';

// Ported from the deleted TagNotesRoute.test.tsx — the error,
// empty and toolbar cases the rotted suite covered, rewritten
// against the current useTagNotesData flow.

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

const otherTag: Tag = {
  id: 'tag-456',
  name: 'Prayer',
  parent_tag: null,
  created_at: '',
  updated_at: '',
};

const mockFetchNotes = vi.fn();
const mockGetTags = vi.fn();

const storeOverrides = {
  notes: [],
  notesCount: 0,
  notesPage: 1,
  notesPageSize: 25,
  lastSelectedTagId: null,
  tags: [tag],
  fetchNotes: mockFetchNotes,
  getTags: mockGetTags,
};

describe('TagNotesRoute states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ tagId: 'tag-123' });
    mockFetchNotes.mockResolvedValue(undefined);
    mockGetTags.mockResolvedValue(undefined);
    mockApi.getTag.mockResolvedValue(tag);
    mockApi.fetchCommentCounts.mockResolvedValue({});
    mockApi.getNoteOrderIndex.mockResolvedValue([]);
  });

  it('shows "No tag ID provided" when the param is missing',
    async () => {
      mockUseParams.mockReturnValue({});

      renderWithProviders(<TagNotesRoute />, { storeOverrides });

      await waitFor(() => {
        expect(
          screen.getByText('No tag ID provided')
        ).toBeInTheDocument();
      });
    });

  it('shows an error when the tag cannot be resolved', async () => {
    // Tag absent from the store AND the single-tag fetch fails.
    mockApi.getTag.mockRejectedValue(new Error('not found'));

    renderWithProviders(<TagNotesRoute />, {
      storeOverrides: { ...storeOverrides, tags: [] },
    });

    await waitFor(() => {
      expect(
        screen.getByText('No public notes available for this tag.')
      ).toBeInTheDocument();
    });
  });

  it('shows an error when the notes fetch fails', async () => {
    mockFetchNotes.mockRejectedValue(new Error('boom'));

    renderWithProviders(<TagNotesRoute />, { storeOverrides });

    await waitFor(() => {
      expect(
        screen.getByText('Failed to load notes')
      ).toBeInTheDocument();
    });
  });

  it('shows the empty state when the tag has no notes',
    async () => {
      renderWithProviders(<TagNotesRoute />, { storeOverrides });

      await waitFor(() => {
        expect(
          screen.getByText('No notes found for this tag.')
        ).toBeInTheDocument();
      });
    });

  it('navigates to a different tag but no-ops on the ' +
    'current one', async () => {
      // The switcher only renders for authenticated users
      // with tags; picking a tag routes to /notes/tag/:id.
      renderWithProviders(<TagNotesRoute />, {
        storeOverrides: {
          ...storeOverrides,
          tags: [tag, otherTag],
        },
        authStoreState: { isAuthenticated: true },
      });

      fireEvent.mouseDown(
        await screen.findByLabelText('Filter by tag')
      );
      // Mantine v6 Select items select on mouseDown.
      fireEvent.mouseDown(
        await screen.findByRole('option', { name: 'Prayer' })
      );
      expect(mockNavigate).toHaveBeenCalledWith(
        '/notes/tag/tag-456'
      );

      mockNavigate.mockClear();
      fireEvent.mouseDown(
        screen.getByLabelText('Filter by tag')
      );
      fireEvent.mouseDown(
        await screen.findByRole('option', {
          name: 'Bible Study',
        })
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });

  it('renders the toolbar with share and refresh controls',
    async () => {
      renderWithProviders(<TagNotesRoute />, { storeOverrides });

      await waitFor(() => {
        expect(
          screen.getByLabelText('Share tag link')
        ).toBeInTheDocument();
      });
      expect(
        screen.getByLabelText('Refresh notes')
      ).toBeInTheDocument();
    });
});
