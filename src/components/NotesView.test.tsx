import { render, screen, waitFor, fireEvent, act } from
  '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import NotesView from './NotesView';
import { useBibleStore } from '../store';
import * as api from '../api';

// Mock API
vi.mock('../api', () => ({
  getTags: vi.fn(),
}));

// Mock child components
vi.mock('./TagSection', () => ({
  default: ({ tagName, notes }: any) => (
    <div data-testid="tag-section">
      <h3>{tagName}</h3>
      <div>{notes.length} notes</div>
    </div>
  ),
}));

vi.mock('./EditNoteModal', () => ({
  default: () => <div data-testid="edit-note-modal" />,
}));

const initialStoreState = useBibleStore.getState();

describe('NotesView Component', () => {
  const mockOnViewInBible = vi.fn();
  const mockFetchNotes = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useBibleStore.setState({
      ...initialStoreState,
      notes: [],
      fetchNotes: mockFetchNotes,
    });

    (api.getTags as vi.Mock).mockResolvedValue([
      { id: '1', name: 'Faith', parent_tag: null,
        created_at: '', updated_at: '' },
      { id: '2', name: 'Hope', parent_tag: null,
        created_at: '', updated_at: '' },
    ]);
  });

  afterEach(async () => {
    // Wait for any pending state updates to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it('should display loading state initially', async () => {
    mockFetchNotes.mockImplementation(() => new Promise(() => {}));

    await act(async () => {
      render(<NotesView onViewInBible={mockOnViewInBible} />);
    });

    expect(screen.getByLabelText('loading')).toBeInTheDocument();
  });

  it('should fetch tags and notes on mount', async () => {
    mockFetchNotes.mockResolvedValue([]);

    await act(async () => {
      render(<NotesView onViewInBible={mockOnViewInBible} />);
    });

    await waitFor(() => {
      expect(api.getTags).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalledWith('1');
    });
  });

  it('should display "No notes found" when no notes', async () => {
    mockFetchNotes.mockResolvedValue([]);

    await act(async () => {
      render(<NotesView onViewInBible={mockOnViewInBible} />);
    });

    await waitFor(() => {
      expect(screen.getByText('No notes found.')).toBeInTheDocument();
    });
  });

  it('should display notes when available', async () => {
    const mockNotes = [
      {
        id: 'n1',
        note_text: 'Test note',
        tag: { id: '1', name: 'Faith', parent_tag: null,
          created_at: '', updated_at: '' },
        public: false,
        created_at: '',
        updated_at: '',
        verses: [],
      },
    ];

    mockFetchNotes.mockResolvedValue(mockNotes);
    useBibleStore.setState({ notes: mockNotes });

    await act(async () => {
      render(<NotesView onViewInBible={mockOnViewInBible} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('tag-section')).toBeInTheDocument();
    });
  });

  it('should call fetchNotes when refresh button clicked', async () => {
    mockFetchNotes.mockResolvedValue([]);

    await act(async () => {
      render(<NotesView onViewInBible={mockOnViewInBible} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Refresh Notes')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Refresh Notes'));
    });

    // Should be called twice: once on mount, once on refresh
    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalledTimes(2);
    });
  });

  // Note: Testing Select dropdown interactions is problematic
  // due to portal rendering. See SKIPPED_TESTS.md for details.
  it.skip('should fetch notes when tag selection changes', () => {
    // This test is skipped due to Select portal rendering
  });
});
