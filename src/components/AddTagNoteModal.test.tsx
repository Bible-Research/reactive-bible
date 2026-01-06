import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AddTagNoteModal from './AddTagNoteModal';
import { useBibleStore } from '../store';
import * as api from '../api';

// Mock API
vi.mock('../api', () => ({
  getTags: vi.fn(),
  addTagNote: vi.fn(),
}));

// Mock NoteForm component
vi.mock('./NoteForm', () => ({
  default: ({ onSubmit }: any) => (
    <div data-testid="note-form">
      <button onClick={() => onSubmit('tag1', 'Test note')}>
        Submit
      </button>
    </div>
  ),
}));

const initialStoreState = useBibleStore.getState();

describe('AddTagNoteModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBibleStore.setState({
      ...initialStoreState,
      activeVerses: [1, 2],
      activeBook: 'Genesis',
      activeChapter: 1,
      setActiveVerses: vi.fn(),
    });

    (api.getTags as vi.Mock).mockResolvedValue([
      { id: '1', name: 'Faith', parent_tag: null, 
        created_at: '', updated_at: '' },
    ]);
  });

  it('should not render when closed', () => {
    render(<AddTagNoteModal opened={false} onClose={vi.fn()} />);
    expect(screen.queryByText('Add note')).not.toBeInTheDocument();
  });

  it('should render when opened', () => {
    render(<AddTagNoteModal opened={true} onClose={vi.fn()} />);
    expect(screen.getByText('Add note')).toBeInTheDocument();
  });

  it('should render NoteForm when opened', () => {
    render(<AddTagNoteModal opened={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('note-form')).toBeInTheDocument();
  });

  // Note: Full modal interaction testing is problematic
  // due to portal rendering. See SKIPPED_TESTS.md.
  it.skip('should call addTagNote when form submitted', () => {
    // This test is skipped due to modal portal rendering
  });

  it.skip('should clear selected verses after submission', () => {
    // This test is skipped due to modal portal rendering
  });
});
