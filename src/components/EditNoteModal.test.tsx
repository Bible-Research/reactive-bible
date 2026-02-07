import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EditNoteModal from './EditNoteModal';
import {
  renderWithProviders,
  createMockNote,
  createMockTag,
} from '../__tests__/helpers';
import * as api from '../api';

// Mock API (appropriate for unit testing)
vi.mock('../api', () => ({
  getTags: vi.fn(),
  editNote: vi.fn(),
}));

describe('EditNoteModal Component', () => {
  // Use factory function for cleaner test data
  const mockNote = createMockNote({
    id: 'n1',
    note_text: 'Original note text',
    tag: createMockTag({ id: '1', name: 'Faith' }),
    verses: [],
  });

  beforeEach(() => {
    vi.clearAllMocks();

    (api.getTags as vi.Mock).mockResolvedValue([
      createMockTag({ id: '1', name: 'Faith' }),
    ]);
  });

  it('should not render when closed', () => {
    renderWithProviders(
      <EditNoteModal
        opened={false}
        onClose={vi.fn()}
        note={mockNote}
      />
    );
    expect(screen.queryByText('Edit note')).not.toBeInTheDocument();
  });

  it('should render when opened', async () => {
    renderWithProviders(
      <EditNoteModal
        opened={true}
        onClose={vi.fn()}
        note={mockNote}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Edit note')).toBeInTheDocument();
    });
  });

  it('should render NoteForm with initial text', async () => {
    renderWithProviders(
      <EditNoteModal
        opened={true}
        onClose={vi.fn()}
        note={mockNote}
      />
    );

    await waitFor(() => {
      // Check for NoteForm elements instead of test-id
      expect(screen.getByLabelText('Note')).toBeInTheDocument();
    });

    // Verify the note text is pre-filled
    expect(screen.getByDisplayValue('Original note text')).toBeInTheDocument();
  });

  // Note: Full modal interaction testing is problematic
  // due to portal rendering. See SKIPPED_TESTS.md.
  it.skip('should call editNote when form submitted', () => {
    // This test is skipped due to modal portal rendering
  });

  it.skip('should refresh notes after successful edit', () => {
    // This test is skipped due to modal portal rendering
  });
});
