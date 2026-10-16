import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NoteCard from './NoteCard';
import {
  renderWithProviders,
  createMockNote,
  createMockVerse,
  createMockTag,
} from '../__tests__/helpers';

describe('NoteCard Component', () => {
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

  const mockOnViewInBible = vi.fn();
  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render correctly for a single verse note', () => {
    renderWithProviders(
      <NoteCard
        note={singleVerseNote}
        onViewInBible={mockOnViewInBible}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Genesis 1:1' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('This is a single verse note.')
    ).toBeInTheDocument();
    expect(screen.getByText('In the beginning...'))
      .toBeInTheDocument();
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

    expect(
      screen.getByRole('heading', { name: 'Genesis 1:1-2' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('This is a multi-verse note.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('The earth was without form...')
    ).toBeInTheDocument();
  });

  it('should call onEdit when the edit button is clicked', () => {
    renderWithProviders(
      <NoteCard
        note={singleVerseNote}
        onViewInBible={mockOnViewInBible}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.click(screen.getByLabelText('edit-note'));

    expect(mockOnEdit).toHaveBeenCalledWith(singleVerseNote);
  });

  it('hides edit and remove for notes the user does not own',
    () => {
      const foreign = createMockNote({
        id: 'n-foreign',
        is_owner: false,
        verses: [createMockVerse()],
      });
      renderWithProviders(
        <NoteCard
          note={foreign}
          onViewInBible={mockOnViewInBible}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />
      );

      expect(
        screen.queryByLabelText('edit-note')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText('remove-note')
      ).not.toBeInTheDocument();
    });

  it('should call onViewInBible when the view button is clicked',
    () => {
      renderWithProviders(
        <NoteCard
          note={singleVerseNote}
          onViewInBible={mockOnViewInBible}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />
      );

      fireEvent.click(screen.getByLabelText('view-in-bible'));

      expect(mockOnViewInBible)
        .toHaveBeenCalledWith('Genesis', 1, 1);
    });

  it('should call onDelete on remove click', () => {
    renderWithProviders(
      <NoteCard
        note={singleVerseNote}
        onViewInBible={mockOnViewInBible}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.click(screen.getByLabelText('remove-note'));

    expect(mockOnDelete).toHaveBeenCalledWith(
      expect.any(Object),
      singleVerseNote
    );
  });

  it('should show the share button only for public notes', () => {
    const publicNote = createMockNote({
      id: 'n-pub',
      public: true,
      verses: [createMockVerse()],
    });
    renderWithProviders(
      <NoteCard note={publicNote} onViewInBible={mockOnViewInBible} />
    );

    expect(screen.getByLabelText('share-note')).toBeInTheDocument();
  });

  it('should not show the share button for private notes', () => {
    renderWithProviders(
      <NoteCard
        note={singleVerseNote}
        onViewInBible={mockOnViewInBible}
      />
    );

    expect(
      screen.queryByLabelText('share-note')
    ).not.toBeInTheDocument();
  });

  it('should call onPlayFromNote with the note id', () => {
    const mockOnPlayFromNote = vi.fn();
    renderWithProviders(
      <NoteCard
        note={singleVerseNote}
        onViewInBible={mockOnViewInBible}
        onPlayFromNote={mockOnPlayFromNote}
      />
    );

    fireEvent.click(screen.getByLabelText('play-from-n1'));

    expect(mockOnPlayFromNote).toHaveBeenCalledWith('n1');
  });

  it('shows the comment count badge', () => {
    renderWithProviders(
      <NoteCard
        note={singleVerseNote}
        onViewInBible={mockOnViewInBible}
        commentCount={3}
      />
    );

    expect(
      screen.getByRole('button', { name: '3' })
    ).toBeInTheDocument();
  });

  it('hides the comment badge for anonymous viewers on an ' +
    'uncommented note', () => {
      renderWithProviders(
        <NoteCard
          note={singleVerseNote}
          onViewInBible={mockOnViewInBible}
          commentCount={0}
        />,
        { authStoreState: { isAuthenticated: false } }
      );

      expect(
        screen.queryByLabelText('Add a comment')
      ).not.toBeInTheDocument();
    });
});

describe('NoteCard provider error display', () => {
  it('shows the provider error when the API reports one',
    () => {
    const note = createMockNote({
      id: 'n-err',
      note_text: '',
      error: 'Bible provider rate limit exceeded (HTTP 429)',
      error_code: 'rate_limited',
      verses: [
        createMockVerse({
          book: 'John', chapter: 1, verse: 1, text: '',
        }),
      ],
    });

    renderWithProviders(
      <NoteCard note={note} onViewInBible={vi.fn()} />
    );

    expect(
      screen.getByText(/rate limit exceeded/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/reloading in a few moments/i)
    ).toBeInTheDocument();
  });

  it('renders verses normally when text is present', () => {
    const note = createMockNote({
      id: 'n-ok',
      note_text: '',
      verses: [
        createMockVerse({
          book: 'John',
          chapter: 1,
          verse: 1,
          text: 'In the beginning was the Word',
        }),
      ],
    });

    renderWithProviders(
      <NoteCard note={note} onViewInBible={vi.fn()} />
    );

    expect(
      screen.getByText(/In the beginning was the Word/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/rate limit exceeded/i)
    ).not.toBeInTheDocument();
  });

  it('shows a copyright notice instead of empty verses ' +
    'beyond the 500 verse limit', () => {
    const verses = Array.from({ length: 501 }, (_, i) =>
      createMockVerse({
        book: 'John',
        chapter: 1,
        verse: i + 1,
        text: i < 500 ? `Verse ${i + 1} text` : '',
      })
    );
    const note = createMockNote({ id: 'n-big', verses });

    renderWithProviders(
      <NoteCard note={note} onViewInBible={vi.fn()} />
    );

    expect(
      screen.getByText(
        /cannot display more than 500 verses/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByTitle('passage-verse-1-500')
    ).toBeInTheDocument();
    expect(
      screen.queryByTitle('passage-verse-1-501')
    ).not.toBeInTheDocument();
  });

  it('does not show the copyright notice at or below ' +
    'the 500 verse limit', () => {
    const verses = Array.from({ length: 500 }, (_, i) =>
      createMockVerse({
        book: 'John',
        chapter: 1,
        verse: i + 1,
        text: `Verse ${i + 1} text`,
      })
    );
    const note = createMockNote({ id: 'n-max', verses });

    renderWithProviders(
      <NoteCard note={note} onViewInBible={vi.fn()} />
    );

    expect(
      screen.queryByText(
        /cannot display more than 500 verses/i
      )
    ).not.toBeInTheDocument();
    expect(
      screen.getByTitle('passage-verse-1-500')
    ).toBeInTheDocument();
  });
});
