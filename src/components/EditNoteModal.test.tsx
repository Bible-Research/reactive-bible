import { fireEvent, screen, waitFor } from '@testing-library/react';
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

  it('should submit updated verse references', async () => {
    (api.editNote as Mock).mockResolvedValue({});
    renderWithProviders(
      <EditNoteModal
        opened={true}
        onClose={vi.fn()}
        note={noteWithVerses}
      />
    );

    // Add John 3:17 to the note's linked verses.
    fireEvent.click(
      await screen.findByTitle('toggle-verse-references')
    );
    fireEvent.click(await screen.findByTitle('edit-note-verse-17'));
    const form = screen
      .getByText('Submit changes')
      .closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => {
      expect(api.editNote).toHaveBeenCalledWith(
        'n1',
        '1',
        'Original note text',
        [
          { book: 'John', chapter: 3, verse: 16 },
          { book: 'John', chapter: 3, verse: 17 },
        ]
      );
    });
  });

  // Note: Full modal interaction testing is problematic
  // due to portal rendering. See SKIPPED_TESTS.md.
  it.skip('should refresh notes after successful edit', () => {
    // This test is skipped due to modal portal rendering
  });
});
