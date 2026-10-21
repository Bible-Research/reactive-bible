import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NoteCardActions from './NoteCardActions';
import {
  renderWithProviders,
  createMockNote,
  createMockVerse,
  createMockTag,
} from '../__tests__/helpers';

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

// Edit/delete affordances are auth-gated — render as a signed-
// in user unless a case overrides the auth state.
const renderActions = (
  props: Partial<
    React.ComponentProps<typeof NoteCardActions>
  > = {},
  options?: Parameters<typeof renderWithProviders>[1]
) =>
  renderWithProviders(
    <NoteCardActions
      note={singleVerseNote}
      onViewInBible={vi.fn()}
      threadOpen={false}
      onToggleThread={vi.fn()}
      {...props}
    />,
    {
      authStoreState: { isAuthenticated: true },
      ...options,
    }
  );

// Cases ported from the rotted (skipped) NoteCard suite.
describe('NoteCardActions', () => {
  it('calls onEdit with the note when edit is clicked', () => {
    const onEdit = vi.fn();
    renderActions({ onEdit });

    fireEvent.click(
      screen.getByRole('button', { name: 'edit-note' })
    );

    expect(onEdit).toHaveBeenCalledWith(singleVerseNote);
  });

  it('calls onViewInBible with the first verse coords', () => {
    const onViewInBible = vi.fn();
    renderActions({ onViewInBible });

    fireEvent.click(
      screen.getByRole('button', { name: 'view-in-bible' })
    );

    expect(onViewInBible).toHaveBeenCalledWith('Genesis', 1, 1);
  });

  it('calls onDelete with the event and note on remove', () => {
    const onDelete = vi.fn();
    renderActions({ onDelete });

    fireEvent.click(
      screen.getByRole('button', { name: 'remove-note' })
    );

    expect(onDelete).toHaveBeenCalledWith(
      expect.any(Object),
      singleVerseNote
    );
  });

  it('hides edit/delete for a non-owner note', () => {
    const note = createMockNote({
      is_owner: false,
      verses: singleVerseNote.verses,
    });
    renderActions({
      note,
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    });

    expect(
      screen.queryByRole('button', { name: 'edit-note' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'remove-note' })
    ).not.toBeInTheDocument();
  });

  it('hides edit/delete when is_owner is absent', () => {
    // Fail-open regression: `is_owner !== false` used to show
    // the buttons for payloads missing the field entirely.
    const note = {
      ...singleVerseNote,
      is_owner: undefined,
    } as unknown as typeof singleVerseNote;
    renderActions({
      note,
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    });

    expect(
      screen.queryByRole('button', { name: 'edit-note' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'remove-note' })
    ).not.toBeInTheDocument();
  });

  it('hides share for a private note', () => {
    renderActions();

    expect(
      screen.queryByRole('button', { name: 'share-note' })
    ).not.toBeInTheDocument();
  });

  it('shows share for a public note', () => {
    renderActions({
      note: createMockNote({
        public: true,
        verses: singleVerseNote.verses,
      }),
    });

    expect(
      screen.getByRole('button', { name: 'share-note' })
    ).toBeInTheDocument();
  });

  it('disables play-from-here for a verse-less note', () => {
    renderActions({
      note: createMockNote({ id: 'n-vl', verses: [] }),
      onPlayFromNote: vi.fn(),
    });

    expect(
      screen.getByRole('button', { name: 'play-from-n-vl' })
    ).toBeDisabled();
  });

  it('shows the comment count and toggles the thread', () => {
    const onToggleThread = vi.fn();
    renderActions(
      { commentCount: 3, onToggleThread },
      { stores: { auth: { isAuthenticated: true } } }
    );

    const button = screen.getByRole('button', { name: '3' });
    fireEvent.click(button);

    expect(onToggleThread).toHaveBeenCalled();
  });

  it('hides the comment button when commentCount is undefined', () => {
    renderActions(
      {},
      { stores: { auth: { isAuthenticated: true } } }
    );

    expect(
      screen.queryByLabelText('Add a comment')
    ).not.toBeInTheDocument();
  });
});
