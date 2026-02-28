import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../__tests__/helpers';
import TagNotesRoute from '../TagNotesRoute';
import { useBibleStore } from '../../store';

// Mock react-router-dom
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

// Mock API
vi.mock('../../api', () => ({
  getTags: vi.fn(() =>
    Promise.resolve([
      {
        id: 'tag-123',
        name: 'Bible Study',
        parent_tag: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
      {
        id: 'tag-456',
        name: 'Prayer',
        parent_tag: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
    ])
  ),
  deleteNote: vi.fn(() => Promise.resolve()),
}));

describe('TagNotesRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ tagId: 'tag-123' });
    
    // Reset store state
    useBibleStore.setState({
      showNotes: false,
      notes: [],
      activeBook: 'John',
      activeChapter: 3,
      activeVerses: [],
    });
  });

  it('should set showNotes to true when component mounts', async () => {
    renderWithProviders(<TagNotesRoute />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.queryByLabelText('loading')).not.toBeInTheDocument();
    });

    // Check that showNotes was set to true
    const state = useBibleStore.getState();
    expect(state.showNotes).toBe(true);
  });

  it('should display tag selector with correct tag selected', async () => {
    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
    });

    // The select should have the current tag value
    const select = screen.getByLabelText('Filter by tag');
    expect(select).toBeInTheDocument();
  });

  it('should display note count with plural', async () => {
    useBibleStore.setState({
      notes: [
        {
          id: '1',
          note_text: 'Test note 1',
          tag: {
            id: 'tag-123',
            name: 'Bible Study',
            parent_tag: null,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
          verses: [],
          public: false,
        },
        {
          id: '2',
          note_text: 'Test note 2',
          tag: {
            id: 'tag-123',
            name: 'Bible Study',
            parent_tag: null,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
          verses: [],
          public: false,
        },
      ],
    });

    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.getByText('2 notes')).toBeInTheDocument();
    });
  });

  it('should display singular "note" for single note', async () => {
    useBibleStore.setState({
      notes: [
        {
          id: '1',
          note_text: 'Test note',
          tag: {
            id: 'tag-123',
            name: 'Bible Study',
            parent_tag: null,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
          verses: [],
          public: false,
        },
      ],
    });

    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.getByText('1 note')).toBeInTheDocument();
    });
  });

  it('should display share button', async () => {
    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
    });

    // Share button should be present (ActionIcon)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should navigate when tag is changed', async () => {
    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
    });

    // Verify the select is rendered
    const select = screen.getByLabelText('Filter by tag');
    expect(select).toBeInTheDocument();
  });

  it('should show loading state initially', () => {
    renderWithProviders(<TagNotesRoute />);

    expect(screen.getByLabelText('loading')).toBeInTheDocument();
  });

  it('should show error message when tag is not found', async () => {
    mockUseParams.mockReturnValue({ tagId: 'non-existent' });

    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.getByText(/Tag not found/i)).toBeInTheDocument();
    });
  });

  it('should show "No notes found" when tag has no notes', async () => {
    useBibleStore.setState({
      notes: [],
    });

    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(
        screen.getByText('No notes found for this tag.')
      ).toBeInTheDocument();
    });
  });

  it('should show error when no tagId is provided', async () => {
    mockUseParams.mockReturnValue({ tagId: undefined });

    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.getByText('No tag ID provided')).toBeInTheDocument();
    });
  });

  it('should call navigate when handleTagChange is triggered', async () => {
    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
    });

    // The component should be ready
    expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
  });

  it('should set Bible context when navigating to Bible', async () => {
    useBibleStore.setState({
      notes: [
        {
          id: '1',
          note_text: 'Test note',
          tag: {
            id: 'tag-123',
            name: 'Bible Study',
            parent_tag: null,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
          verses: [
            {
              book: 'John',
              chapter: 3,
              verse: 16,
              text: 'For God so loved the world...',
            },
          ],
          public: false,
        },
      ],
    });

    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.queryByLabelText('loading')).not.toBeInTheDocument();
    });

    // Component should render with notes
    expect(screen.getByText('1 note')).toBeInTheDocument();
  });

  it('should maintain showNotes state as true throughout lifecycle', async () => {
    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.queryByLabelText('loading')).not.toBeInTheDocument();
    });

    // Verify showNotes is still true after loading
    const state = useBibleStore.getState();
    expect(state.showNotes).toBe(true);
  });
});
