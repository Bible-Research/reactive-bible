import type { ComponentProps } from 'react';
import { screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TagSection from './TagSection';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  renderWithProviders,
  createMockNote,
  createMockTag,
  createMockVerse,
} from '../__tests__/helpers';

// dnd-kit pointer gestures can't be simulated reliably under
// happy-dom. Instead wrap the real DndContext and capture the
// onDragEnd handler TagSection registers, then invoke it with
// synthetic events — the reorder math runs for real.
let capturedDragEnd:
  | ((event: DragEndEvent) => void)
  | undefined;

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@dnd-kit/core')>();
  const RealDndContext = actual.DndContext;
  return {
    ...actual,
    DndContext: (
      props: ComponentProps<typeof RealDndContext>
    ) => {
      capturedDragEnd = props.onDragEnd;
      return <RealDndContext {...props} />;
    },
  };
});

const mockTag = createMockTag({ id: '1', name: 'Faith' });

const note = (id: string) =>
  createMockNote({
    id,
    note_text: `This is ${id}`,
    tag: mockTag,
    verses: [
      createMockVerse({
        book: 'Genesis',
        chapter: 1,
        verse: 1,
        text: 'In the beginning...',
      }),
    ],
  });

const dragEnd = (activeId: string, overId: string | null) =>
  act(() => {
    capturedDragEnd?.({
      active: { id: activeId },
      over: overId === null ? null : { id: overId },
    } as unknown as DragEndEvent);
  });

describe('TagSection Component', () => {
  const mockNotes = [note('n1'), note('n2')];

  const mockOnViewInBible = vi.fn();
  const mockOnEditNote = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    capturedDragEnd = undefined;
  });

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
    expect(screen.getByText('This is n1')).toBeInTheDocument();
    expect(screen.getByText('This is n2')).toBeInTheDocument();
  });

  it('should call onEditNote when an edit button is clicked', () => {
    renderWithProviders(
      <TagSection
        tagName="Faith"
        notes={mockNotes}
        onViewInBible={mockOnViewInBible}
        onEditNote={mockOnEditNote}
        isTagOwner
      />,
      // Edit/delete affordances are auth-gated (fail closed).
      { authStoreState: { isAuthenticated: true } }
    );

    const editButtons = screen.getAllByRole('button', { name: 'edit-note' });
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

    const viewButtons = screen.getAllByRole(
      'button',
      { name: 'view-in-bible' }
    );
    viewButtons[0].click();

    expect(mockOnViewInBible).toHaveBeenCalledWith('Genesis', 1, 1);
  });
});

describe('TagSection drag reorder', () => {
  const mockNotes = [note('n1'), note('n2')];
  const mockOnViewInBible = vi.fn();

  const renderDraggable = (sortOrder?: string) => {
    const onReorder = vi.fn();
    renderWithProviders(
      <TagSection
        tagName="Faith"
        notes={mockNotes}
        onViewInBible={mockOnViewInBible}
        isDraggable
        tagId="tag-1"
        onReorder={onReorder}
        sortOrder={sortOrder}
        currentPage={2}
        pageSize={25}
      />
    );
    return onReorder;
  };

  it('sends the reordered ids as-is in custom_asc', () => {
    const onReorder = renderDraggable('custom_asc');

    // Drag n1 below n2 → display order becomes [n2, n1].
    dragEnd('n1', 'n2');

    expect(onReorder).toHaveBeenCalledWith(
      'tag-1',
      ['n2', 'n1'],
      2,
      25
    );
  });

  it('reverses idsToSend in custom_desc so position 1 ' +
    'lands on the bottom note', () => {
      const onReorder = renderDraggable('custom_desc');

      // Same drag: display order [n2, n1], but canonical
      // ascending positions must invert the display order.
      dragEnd('n1', 'n2');

      expect(onReorder).toHaveBeenCalledWith(
        'tag-1',
        ['n1', 'n2'],
        2,
        25
      );
    });

  it('does not call onReorder when the drag ends off a ' +
    'target or on the same note', () => {
      const onReorder = renderDraggable('custom_asc');

      dragEnd('n1', null);
      dragEnd('n1', 'n1');

      expect(onReorder).not.toHaveBeenCalled();
    });
});
