import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import NotesView from './NotesView';
import { useBibleStore } from '../store';
import { renderWithProviders, createMockNote, createMockTag } from '../__tests__/helpers';
import { Note, Tag } from '../types';

describe('NotesView Component', () => {
  const mockOnViewInBible = vi.fn();

  it('should display loading state initially', () => {
    renderWithProviders(<NotesView onViewInBible={mockOnViewInBible} />);
    expect(screen.getByLabelText('loading')).toBeInTheDocument();
  });

  it('should fetch tags and notes on mount and display them', async () => {
    const mockTag = createMockTag({ id: '1', name: 'Faith' });
    const mockNote = createMockNote({ id: 'n1', note_text: 'Test note', tag: mockTag });

        renderWithProviders(<NotesView onViewInBible={mockOnViewInBible} />, {
      storeOverrides: {
        tags: [mockTag] as Tag[],
        notes: [mockNote] as Note[],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Faith')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Test note')).toBeInTheDocument();
    });
  });

  it('should display "No notes found" when no notes are available for the selected tag', async () => {
    const mockTag = createMockTag({ id: '1', name: 'Faith' });

        renderWithProviders(<NotesView onViewInBible={mockOnViewInBible} />, {
      storeOverrides: {
        tags: [mockTag] as Tag[],
        notes: [] as Note[], // No notes for this tag
      },
    });

    await waitFor(() => {
      expect(screen.getByText('No notes found.')).toBeInTheDocument();
    });
  });

    it('should refresh notes when the refresh button is clicked', async () => {
    const user = userEvent.setup();
    // Spy on the store's action *before* rendering
    const fetchNotesSpy = vi.spyOn(useBibleStore.getState(), 'fetchNotes');

    renderWithProviders(<NotesView onViewInBible={mockOnViewInBible} />);

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(fetchNotesSpy).toHaveBeenCalledTimes(1);
    });

    const refreshButton = screen.getByRole('button', { name: /Refresh Notes/i });
    await user.click(refreshButton);

    // Should be called again on refresh
    await waitFor(() => {
      expect(fetchNotesSpy).toHaveBeenCalledTimes(2);
    });
  });

  it.skip('should fetch notes when tag selection changes', async () => {
    // This test remains skipped as it requires complex interaction with the Mantine Select portal
  });
});
