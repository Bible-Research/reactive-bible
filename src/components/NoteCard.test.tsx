import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NoteCard from './NoteCard';
import {
  renderWithProviders,
  createMockNote,
  createMockVerse,
  createMockTag,
} from '../__tests__/helpers';

describe.skip('NoteCard Component', () => {
  const singleVerseNote = createMockNote({
    id: 'n1',
    note_text: 'This is a single verse note.',
    tag: createMockTag({ id: '1', name: 'Faith' }),
    verses: [
      createMockVerse({
        book: 'Genesis',
        chapter: 1,
        verse: 1,
        text: 'In the beginning...',
      }),
    ],
  });

  const multiVerseNote = createMockNote({
    id: 'n2',
    note_text: 'This is a multi-verse note.',
    tag: createMockTag({ id: '1', name: 'Faith' }),
    verses: [
      createMockVerse({
        book: 'Genesis',
        chapter: 1,
        verse: 1,
        text: 'In the beginning...',
      }),
      createMockVerse({
        book: 'Genesis',
        chapter: 1,
        verse: 2,
        text: 'The earth was without form...',
      }),
    ],
  });

  const noteWithScripturePresent = createMockNote({
    id: 'n3',
    note_text: 'This is a note with scripture present. @John.1:1-5',
    tag: createMockTag({ id: '2', name: 'Jesus is God' }),
    verses: [
      createMockVerse({
        book: 'John',
        chapter: 1,
        verse: 1,
        text: 'In the beginning...',
      }),
      createMockVerse({
        book: 'John',
        chapter: 1,
        verse: 2,
        text: 'He was in the beginning...',
      }),
      createMockVerse({
        book: 'John',
        chapter: 1,
        verse: 3,
        text: 'All things were made through him...',
      }),
      createMockVerse({
        book: 'John',
        chapter: 1,
        verse: 4,
        text: 'In him was life, and the life...',
      }),
      createMockVerse({
        book: 'John',
        chapter: 1,
        verse: 5,
        text: 'There was a man...',
      }),
    ]
  })

  const mockOnViewInBible = vi.fn();
  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();

  it('should render correctly for a single verse note', () => {
    renderWithProviders(
      <NoteCard
        note={singleVerseNote}
        onViewInBible={mockOnViewInBible}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByRole('heading', { name: 'Genesis 1:1' })).toBeInTheDocument();
    expect(screen.getByText('This is a single verse note.')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('In the beginning...')).toBeInTheDocument();
  });

  it('should render correctly for a multi-verse note', () => {
    renderWithProviders(
      <NoteCard
        note={multiVerseNote}
        onViewInBible={mockOnViewInBible}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByRole('heading', { name: 'Genesis 1:1-2' })).toBeInTheDocument();
    expect(screen.getByText('This is a multi-verse note.')).toBeInTheDocument();
    expect(screen.getByText('In the beginning...')).toBeInTheDocument();
    expect(screen.getByText('The earth was without form...')).toBeInTheDocument();
  });

  it('should call onEdit when the edit button is clicked', async () => {
    renderWithProviders(
      <NoteCard
        note={singleVerseNote}
        onViewInBible={mockOnViewInBible}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    const editButton = screen.getByRole('button', { name: 'Edit' });
    fireEvent.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledWith(singleVerseNote);
  });

  it('should call onViewInBible when the view button is clicked', async () => {
    renderWithProviders(
      <NoteCard
        note={singleVerseNote}
        onViewInBible={mockOnViewInBible}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    const viewButton = screen.getByRole('button', { name: 'View in Bible' });
    fireEvent.click(viewButton);

    expect(mockOnViewInBible).toHaveBeenCalledWith('Genesis', 1, 1);
  });

  it('should call handleDeleteNode when the remove button is clicked', async () => {
    window.confirm = vi.fn(() => true);

    renderWithProviders(
      <NoteCard
        note={singleVerseNote}
        onViewInBible={mockOnViewInBible}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    const removeButton = screen.getByRole('button', { name: /Remove/i });
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(mockOnDelete).toHaveBeenCalledWith(
        expect.any(Object),
        singleVerseNote.id
      );
    });
  });

  it('should render open passage container', async () => {
    renderWithProviders(
      <NoteCard
        note={noteWithScripturePresent}
        onViewInBible={mockOnViewInBible}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    const openButton = screen.getByRole('link');
    const passageContainer = screen.getByTestId('passage-container');
    fireEvent.click(openButton);
    expect(passageContainer).toBeInTheDocument();
  });
});
