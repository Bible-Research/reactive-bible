import React from 'react';
import { screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TagSection from './TagSection';
import {
  renderWithProviders,
  createMockNote,
  createMockTag,
  createMockVerse,
} from '../__tests__/helpers';

describe('TagSection Component', () => {
  // Use factory functions for cleaner, more maintainable test data
  const mockTag = createMockTag({ id: '1', name: 'Faith' });

  const mockNotes = [
    createMockNote({
      id: 'n1',
      note_text: 'This is note 1',
      tag: mockTag,
      verses: [
        createMockVerse({
          book: 'Genesis',
          chapter: 1,
          verse: 1,
          text: 'In the beginning...',
        }),
      ],
    }),
    createMockNote({
      id: 'n2',
      note_text: 'This is note 2',
      tag: mockTag,
      verses: [
        createMockVerse({
          book: 'Genesis',
          chapter: 1,
          verse: 2,
          text: 'The earth was without form...',
        }),
      ],
    }),
  ];

  const mockOnViewInBible = vi.fn();
  const mockOnEditNote = vi.fn();

  it('should render the tag name and the correct number of notes', () => {
    renderWithProviders(
      <TagSection
        tagName="Faith"
        notes={mockNotes}
        onViewInBible={mockOnViewInBible}
        onEditNote={mockOnEditNote}
      />
    );

    expect(screen.getByRole('heading', { name: 'Faith' })).toBeInTheDocument();
    expect(screen.getByText('This is note 1')).toBeInTheDocument();
    expect(screen.getByText('This is note 2')).toBeInTheDocument();
  });

  it('should call onEditNote when an edit button is clicked', () => {
    renderWithProviders(
      <TagSection
        tagName="Faith"
        notes={mockNotes}
        onViewInBible={mockOnViewInBible}
        onEditNote={mockOnEditNote}
      />
    );

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    editButtons[0].click();

    expect(mockOnEditNote).toHaveBeenCalledWith(mockNotes[0]);
  });

  it('should call onViewInBible when a view button is clicked', () => {
    renderWithProviders(
      <TagSection
        tagName="Faith"
        notes={mockNotes}
        onViewInBible={mockOnViewInBible}
        onEditNote={mockOnEditNote}
      />
    );

    const viewButtons = screen.getAllByRole('button', { name: 'View in Bible' });
    viewButtons[0].click();

    expect(mockOnViewInBible).toHaveBeenCalledWith('Genesis', 1, 1);
  });
});
