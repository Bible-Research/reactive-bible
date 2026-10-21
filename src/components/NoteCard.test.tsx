import {
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import NoteCard from './NoteCard';
import {
  renderWithProviders,
  createMockNote,
  createMockVerse,
  createMockTag,
} from '../__tests__/helpers';

// CommentThread is covered by its own suite; stub it so the
// badge-toggle test only asserts the mount, not the thread's
// fetch/render internals.
vi.mock('./CommentThread', () => ({
  default: () => <div data-testid="comment-thread" />,
}));

describe('NoteCard Component', () => {
  const singleVerseNote = createMockNote({
    id: 'n1',
    note_text: 'This is a single verse note.',
    public: true,
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

  const noteWithScriptureRef = createMockNote({
    id: 'n3',
    note_text: 'Compare with @JHN.1.1-5 here.',
    tag: createMockTag({ id: '2', name: 'Jesus is God' }),
    verses: [
      createMockVerse({
        book: 'John',
        chapter: 1,
        verse: 1,
        text: 'In the beginning was the Word...',
      }),
    ],
  });

  const mockOnViewInBible = vi.fn();
  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
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
    expect(
      screen.getByText('In the beginning...')
    ).toBeInTheDocument();
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
      screen.getByText('In the beginning...')
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
        isTagOwner
      />,
      { stores: { auth: { isAuthenticated: true } } }
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'edit-note' })
    );

    expect(mockOnEdit).toHaveBeenCalledWith(singleVerseNote);
  });

  it('should call onViewInBible when the view button ' +
    'is clicked', () => {
    renderWithProviders(
      <NoteCard
        note={singleVerseNote}
        onViewInBible={mockOnViewInBible}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'view-in-bible' })
    );

    expect(mockOnViewInBible).toHaveBeenCalledWith(
      'Genesis',
      1,
      1
    );
  });

  it('should call onDelete with the event and the note',
    () => {
      renderWithProviders(
        <NoteCard
          note={singleVerseNote}
          onViewInBible={mockOnViewInBible}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          isTagOwner
        />,
        { stores: { auth: { isAuthenticated: true } } }
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'remove-note' })
      );

      expect(mockOnDelete).toHaveBeenCalledWith(
        expect.any(Object),
        singleVerseNote
      );
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
        screen.queryByRole('button', { name: 'edit-note' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'remove-note' })
      ).not.toBeInTheDocument();
    });

  it('copies the note link to the clipboard when share is ' +
    'clicked and navigator.share is unavailable', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', {
        ...navigator,
        share: undefined,
        clipboard: { writeText },
      });

      renderWithProviders(
        <NoteCard
          note={singleVerseNote}
          onViewInBible={mockOnViewInBible}
        />
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'share-note' })
      );

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(
          `${window.location.origin}/notes/n1`
        );
      });
    });

  it('shows the share button for public notes', () => {
    renderWithProviders(
      <NoteCard
        note={singleVerseNote}
        onViewInBible={mockOnViewInBible}
      />
    );

    expect(
      screen.getByRole('button', { name: 'share-note' })
    ).toBeInTheDocument();
  });

  it('hides the share button for private notes', () => {
    renderWithProviders(
      <NoteCard
        note={createMockNote({
          id: 'n-priv',
          public: false,
          verses: [
            createMockVerse({
              book: 'John',
              chapter: 3,
              verse: 16,
            }),
          ],
        })}
        onViewInBible={mockOnViewInBible}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'share-note' })
    ).not.toBeInTheDocument();
  });

  it('calls onPlayFromNote with the note id when play ' +
    'is clicked', () => {
      const onPlayFromNote = vi.fn();
      renderWithProviders(
        <NoteCard
          note={singleVerseNote}
          onViewInBible={mockOnViewInBible}
          onPlayFromNote={onPlayFromNote}
        />
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'play-from-n1' })
      );

      expect(onPlayFromNote).toHaveBeenCalledWith('n1');
    });

  it('shows only the first verse when verses are folded',
    () => {
      renderWithProviders(
        <NoteCard
          note={multiVerseNote}
          onViewInBible={mockOnViewInBible}
        />,
        { storeOverrides: { versesFolded: true } }
      );

      expect(
        screen.getByText('In the beginning...')
      ).toBeInTheDocument();
      expect(
        screen.queryByText('The earth was without form...')
      ).not.toBeInTheDocument();
      // The action group still renders in the folded header.
      expect(
        screen.getByRole('button', { name: 'view-in-bible' })
      ).toBeInTheDocument();
    });

  it('toggles the comment thread via the comment badge',
    async () => {
      renderWithProviders(
        <NoteCard
          note={singleVerseNote}
          onViewInBible={mockOnViewInBible}
          commentCount={3}
        />,
        { stores: { auth: { isAuthenticated: true } } }
      );

      const badge = document.querySelector(
        '[aria-controls="comment-thread-n1"]'
      ) as HTMLElement;
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute('aria-expanded', 'false');
      expect(
        screen.queryByTestId('comment-thread')
      ).not.toBeInTheDocument();

      fireEvent.click(badge);

      expect(
        await screen.findByTestId('comment-thread')
      ).toBeInTheDocument();
      expect(badge).toHaveAttribute('aria-expanded', 'true');
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
        screen.queryByRole('button', { name: 'Add a comment' })
      ).not.toBeInTheDocument();
    });

  it('hides the comment badge on the detail route where ' +
    'commentCount is undefined', () => {
      renderWithProviders(
        <NoteCard
          note={singleVerseNote}
          onViewInBible={mockOnViewInBible}
        />
      );

      expect(
        screen.queryByRole('button', { name: 'Add a comment' })
      ).not.toBeInTheDocument();
    });

  it('opens the passage preview popover when a scripture ' +
    'link in the note text is clicked', async () => {
      renderWithProviders(
        <NoteCard
          note={noteWithScriptureRef}
          onViewInBible={mockOnViewInBible}
        />
      );

      // The linkified token renders as a clickable Anchor; the
      // popover anchors to it. happy-dom has no layout, so the
      // rect is stubbed — an all-zero rect is read as a
      // deleted anchor and would close the popover instantly.
      const link = screen.getByText('@JHN.1.1-5');
      vi.spyOn(link, 'getBoundingClientRect').mockReturnValue(
        {
          top: 100,
          bottom: 120,
          left: 40,
          right: 90,
          width: 50,
          height: 20,
          x: 40,
          y: 100,
          toJSON: () => ({}),
        } as DOMRect
      );
      fireEvent.click(link);

      expect(
        await screen.findByTestId('passage-container')
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('scripture-passage-popover')
          .parentElement
      ).toBe(document.body);

      // A second click on the same ref toggles it closed.
      fireEvent.click(link);
      await waitFor(() =>
        expect(
          screen.queryByTestId('passage-container')
        ).not.toBeInTheDocument()
      );
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
