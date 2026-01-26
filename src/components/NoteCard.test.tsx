import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NoteCard from './NoteCard';
import { Note, Tag } from '../types';
import { deleteNote } from "../api";
import { renderWithProviders } from '../__tests__/helpers';

window.confirm = vi.fn()

describe('NoteCard Component', () => {
  const mockTag: Tag = {
    id: '1',
    name: 'Faith',
    parent_tag: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const singleVerseNote: Note = {
    id: 'n1',
    note_text: 'This is a single verse note.',
    tag: mockTag,
    public: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    verses: [{ book: 'Genesis', chapter: 1, verse: 1, text: 'In the beginning...' }],
  };

  const multiVerseNote: Note = {
    id: 'n2',
    note_text: 'This is a multi-verse note.',
    tag: mockTag,
    public: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    verses: [
      { book: 'Genesis', chapter: 1, verse: 1, text: 'In the beginning...' },
      { book: 'Genesis', chapter: 1, verse: 2, text: 'The earth was without form...' },
    ],
  };

  const mockOnViewInBible = vi.fn();
  const mockOnEdit = vi.fn();

  it('should render correctly for a single verse note', () => {
    renderWithProviders(<NoteCard note={singleVerseNote} onViewInBible={mockOnViewInBible} onEdit={mockOnEdit} />);

    expect(screen.getByRole('heading', { name: 'Genesis 1:1' })).toBeInTheDocument();
    expect(screen.getByText('This is a single verse note.')).toBeInTheDocument();
    // Verify verse is rendered by checking for verse number and text
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('In the beginning...')).toBeInTheDocument();
  });

  it('should render correctly for a multi-verse note', () => {
    renderWithProviders(<NoteCard note={multiVerseNote} onViewInBible={mockOnViewInBible} onEdit={mockOnEdit} />);

    expect(screen.getByRole('heading', { name: 'Genesis 1:1-2' })).toBeInTheDocument();
    expect(screen.getByText('This is a multi-verse note.')).toBeInTheDocument();
    // Verify both verses are rendered
    expect(screen.getByText('In the beginning...')).toBeInTheDocument();
    expect(screen.getByText('The earth was without form...')).toBeInTheDocument();
  });

  it('should call onEdit when the edit button is clicked', async () => {
    renderWithProviders(<NoteCard note={singleVerseNote} onViewInBible={mockOnViewInBible} onEdit={mockOnEdit} />);

    const editButton = screen.getByRole('button', { name: 'Edit' });
    fireEvent.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledWith(singleVerseNote);
  });

  it('should call onViewInBible when the view button is clicked', async () => {
    renderWithProviders(<NoteCard note={singleVerseNote} onViewInBible={mockOnViewInBible} onEdit={mockOnEdit} />);

    const viewButton = screen.getByRole('button', { name: 'View in Bible' });
    fireEvent.click(viewButton);

    expect(mockOnViewInBible).toHaveBeenCalledWith('Genesis', 1, 1);
  });

  it('should call handleDeleteNode when the remove button is clicked', async () => {
    renderWithProviders(<NoteCard note={singleVerseNote} onViewInBible={mockOnViewInBible} onEdit={mockOnEdit} />);

    const removeButton = screen.getByRole('button', { name: /Remove/i  });
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Genesis 1:1-2' })).not.toBeInTheDocument();
    });
  })
});
