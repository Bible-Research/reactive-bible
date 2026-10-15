import {
  act,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type Mock,
} from 'vitest';
import EditNoteModal from './EditNoteModal';
import {
  renderWithProviders,
  createMockNote,
  createMockTag,
} from '../__tests__/helpers';

import * as api from '../api';
import {
  isTiptapDocString,
  toPlainText,
} from '../utils/tiptapContent';

// Mock API (appropriate for unit testing)
vi.mock('../api', () => ({
  getTags: vi.fn(),
  getNotes: vi.fn().mockResolvedValue({
    results: [],
    count: 0,
    next: null,
  }),
  editNote: vi.fn(),
  getBooks: vi.fn(() => [
    { book_name: 'Genesis', book_id: 'GEN' },
    { book_name: 'John', book_id: 'JHN' },
  ]),
  getChapters: vi.fn(() => [1, 2, 3]),
  getVerses: vi.fn(() => [15, 16, 17]),
  getVersesInChapter: vi.fn().mockResolvedValue({
    verses: [],
    headings: [],
  }),
}));

// ProseMirror needs DOM APIs happy-dom lacks — stub the editor.
vi.mock('./RichTextEditor', async () => ({
  default: (
    await import('../__tests__/mocks/RichTextEditorStub')
  ).default,
}));

describe('EditNoteModal Component', () => {
  // Use factory function for cleaner test data
  const mockNote = createMockNote({
    id: 'n1',
    note_text: 'Original note text',
    tag: createMockTag({ id: '1', name: 'Faith' }),
    verses: [],
  });

  const noteWithVerses = createMockNote({
    id: 'n1',
    note_text: 'Original note text',
    tag: createMockTag({ id: '1', name: 'Faith' }),
    verses: [
      {
        book: 'John',
        chapter: 3,
        verse: 16,
        text: 'For God so loved the world...',
      },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();

    (api.getTags as Mock).mockResolvedValue([
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

  it('should keep verse references collapsed by default', async () => {
    renderWithProviders(
      <EditNoteModal
        opened={true}
        onClose={vi.fn()}
        note={noteWithVerses}
      />
    );

    const toggle = await screen.findByTitle('toggle-verse-references');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByTitle('edit-note-verse-16')
    ).not.toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => {
      expect(
        screen.getByTitle('edit-note-verse-16')
      ).toBeVisible();
    });
  });

  it('should render the verse picker seeded from the note', async () => {
    renderWithProviders(
      <EditNoteModal
        opened={true}
        onClose={vi.fn()}
        note={noteWithVerses}
      />
    );

    fireEvent.click(
      await screen.findByTitle('toggle-verse-references')
    );

    // John 3:16 is linked, so the picker shows chapter 3 verses
    // with verse 16 highlighted.
    const verse16 = await screen.findByTitle('edit-note-verse-16');
    expect(verse16).toHaveAttribute('data-active', 'true');
    expect(
      screen.getByTitle('edit-note-verse-15')
    ).not.toHaveAttribute('data-active');
  });

  it('should toggle a verse link when clicked in the picker', async () => {
    renderWithProviders(
      <EditNoteModal
        opened={true}
        onClose={vi.fn()}
        note={noteWithVerses}
      />
    );

    fireEvent.click(
      await screen.findByTitle('toggle-verse-references')
    );
    const verse17 = await screen.findByTitle('edit-note-verse-17');
    fireEvent.click(verse17);
    expect(verse17).toHaveAttribute('data-active', 'true');
    fireEvent.click(verse17);
    expect(verse17).not.toHaveAttribute('data-active');
  });

  it('should keep note edits when verse references change',
    async () => {
    renderWithProviders(
      <EditNoteModal
        opened={true}
        onClose={vi.fn()}
        note={noteWithVerses}
      />
    );

    const noteInput = await screen.findByLabelText('Note');
    fireEvent.change(noteInput, {
      target: { value: 'Edited note text' },
    });

    fireEvent.click(
      await screen.findByTitle('toggle-verse-references')
    );
    fireEvent.click(
      await screen.findByTitle('edit-note-verse-17')
    );

    expect((noteInput as HTMLTextAreaElement).value).toBe(
      'Edited note text'
    );
  });

  it('should submit updated verse references', async () => {
    const fetchNotes = vi.fn().mockResolvedValue(undefined);
    (api.editNote as Mock).mockResolvedValue({});
    renderWithProviders(
      <EditNoteModal
        opened={true}
        onClose={vi.fn()}
        note={noteWithVerses}
      />,
      { storeOverrides: { fetchNotes } }
    );

    // Add John 3:17 to the note's linked verses and edit text.
    fireEvent.click(
      await screen.findByTitle('toggle-verse-references')
    );
    fireEvent.click(await screen.findByTitle('edit-note-verse-17'));
    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'Edited note text' },
    });
    const form = screen
      .getByText('Submit changes')
      .closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => {
      expect(api.editNote).toHaveBeenCalledTimes(1);
    });
    const [noteId, tagId, text, refs] =
      (api.editNote as Mock).mock.calls[0];
    expect(noteId).toBe('n1');
    expect(tagId).toBe('1');
    // The editor emits doc-JSON, not the raw typed text.
    expect(isTiptapDocString(text)).toBe(true);
    expect(toPlainText(text)).toBe('Edited note text');
    expect(refs).toEqual([
      { book: 'John', chapter: 3, verse: 16 },
      { book: 'John', chapter: 3, verse: 17 },
    ]);

    // The viewed notes page is refreshed after the edit.
    await waitFor(() => {
      expect(fetchNotes).toHaveBeenCalledTimes(1);
    });
  });

  it('refreshes the viewed tag page after autosave on close',
    async () => {
      const fetchNotes = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      (api.editNote as Mock).mockResolvedValue({});
      renderWithProviders(
        <EditNoteModal
          opened={true}
          onClose={onClose}
          note={mockNote}
        />,
        {
          storeOverrides: {
            fetchNotes,
            // The route is showing tag 1, page 3, sorted.
            lastSelectedTagId: '1',
            notesPage: 3,
            notesOrdering: '-created_at',
          },
        }
      );

      const noteInput = await screen.findByLabelText('Note');
      fireEvent.change(noteInput, {
        target: { value: 'Updated text' },
      });

      vi.useFakeTimers();
      try {
        fireEvent.click(screen.getByLabelText('Auto save'));
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(api.editNote).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }

      // Close via the modal's X button.
      const closeButton = document.querySelector(
        '.mantine-Modal-close'
      );
      expect(closeButton).not.toBeNull();
      fireEvent.click(closeButton as HTMLElement);

      // The refresh must target the viewed tag's current page
      // and ordering — not bounce to page 1, and not the
      // (possibly re-tagged) note's stale tag.
      await waitFor(() => {
        expect(fetchNotes).toHaveBeenCalledTimes(1);
      });
      expect(fetchNotes).toHaveBeenCalledWith('1', {
        ordering: '-created_at',
        page: 3,
      });
      expect(onClose).toHaveBeenCalled();
    });

  it('refreshes the viewed tag after submit even when the ' +
    'note moved tags', async () => {
      (api.getTags as Mock).mockResolvedValue([
        createMockTag({ id: '1', name: 'Faith' }),
        createMockTag({ id: '2', name: 'Hope' }),
      ]);
      const fetchNotes = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      (api.editNote as Mock).mockResolvedValue({});
      renderWithProviders(
        <EditNoteModal
          opened={true}
          onClose={onClose}
          note={mockNote}
        />,
        {
          storeOverrides: {
            fetchNotes,
            lastSelectedTagId: '1',
            notesPage: 2,
            notesOrdering: 'verse',
          },
          // store.getTags no-ops without a token — the tag
          // Select only populates for authenticated sessions.
          authStoreState: {
            isAuthenticated: true,
            token: 'test-token',
            user: { username: 'testuser' },
          },
        }
      );

      // Re-tag the note from Faith to Hope via the Select.
      const tagInput = await screen.findByLabelText('Tag');
      fireEvent.mouseDown(tagInput);
      fireEvent.mouseDown(
        await screen.findByRole('option', { name: 'Hope' })
      );
      const form = screen
        .getByText('Submit changes')
        .closest('form');
      fireEvent.submit(form as HTMLFormElement);

      await waitFor(() => {
        expect(api.editNote).toHaveBeenCalledTimes(1);
      });
      expect((api.editNote as Mock).mock.calls[0][1]).toBe('2');

      // The route still shows tag 1 — refetch that view, not
      // the note's new tag.
      await waitFor(() => {
        expect(fetchNotes).toHaveBeenCalledTimes(1);
      });
      expect(fetchNotes).toHaveBeenCalledWith('1', {
        ordering: 'verse',
        page: 2,
      });
    });
});
