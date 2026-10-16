import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor, screen } from '@testing-library/react';
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

  it('renders the toolbar with share and refresh controls',
    async () => {
      renderWithProviders(<TagNotesRoute />, { storeOverrides });

      await waitFor(() => {
        expect(
          screen.getByLabelText('share-tag-link')
        ).toBeInTheDocument();
      });
      expect(
        screen.getByLabelText('refresh-notes')
      ).toBeInTheDocument();
    });
});
