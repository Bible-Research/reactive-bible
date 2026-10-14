import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import SortableNoteCard from '../SortableNoteCard';
import {
  renderWithProviders,
  createMockNote,
  createMockVerse,
} from '../../__tests__/helpers';

// useSortable requires a real DndContext ancestor — render the
// card inside a minimal one.
const renderSortable = () =>
  renderWithProviders(
    <DndContext>
      <SortableContext
        items={['n1']}
        strategy={verticalListSortingStrategy}
      >
        <SortableNoteCard
          note={createMockNote({
            id: 'n1',
            note_text: 'Sortable body',
            verses: [
              createMockVerse({
                book: 'John',
                chapter: 3,
                verse: 16,
                text: 'For God so loved the world',
              }),
            ],
          })}
          onViewInBible={vi.fn()}
        />
      </SortableContext>
    </DndContext>
  );

describe('SortableNoteCard', () => {
  it('renders the note inside a sortable wrapper', () => {
    renderSortable();

    expect(
      screen.getByRole('heading', { name: 'John 3:16' })
    ).toBeInTheDocument();
    expect(screen.getByText('Sortable body'))
      .toBeInTheDocument();

    // useSortable's attributes land on the wrapper Box.
    expect(
      document.querySelector('[aria-roledescription="sortable"]')
    ).not.toBeNull();
  });
});
