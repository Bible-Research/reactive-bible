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
import { resetNoteEditorDrafts } from '../hooks/useNoteEditor';
import { resetNoteImages } from '../hooks/useNoteImages';
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
  UNTAGGED_TAG_ID: 'untagged',
  getNotes: vi.fn().mockResolvedValue({
    results: [],
    count: 0,
    next: null,
  }),
  editNote: vi.fn(),
  uploadNoteImage: vi.fn(),
  deleteImage: vi.fn(),
  fetchNoteImages: vi.fn(),
  getVersesInChapter: vi.fn().mockResolvedValue({
    verses: [],
    headings: [],
  }),
}));

// PassagePicker + utils/scriptureMention import structure
// lookups from the leaf module — mock it here so the barrel
// mock above isn't bypassed (C10 structure-seam repoint).
vi.mock('../api/structure', () => ({
  getBooks: vi.fn(() => [
    { book_name: 'Genesis', book_id: 'GEN' },
    { book_name: 'John', book_id: 'JHN' },
  ]),
  getChapters: vi.fn(() => [1, 2, 3]),
  getVerses: vi.fn(() => [15, 16, 17]),
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
    // Editor drafts and the shared note-image store are
    // module-scoped — reset them between tests.
    resetNoteEditorDrafts();
    resetNoteImages();

    (api.getTags as Mock).mockResolvedValue([
      createMockTag({ id: '1', name: 'Faith' }),
    ]);
    // The modal lazy-fetches the note's image list on open.
    (api.fetchNoteImages as Mock).mockResolvedValue([]);
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

  it('autosave PATCHes carry the picker verse refs', async () => {
    (api.editNote as Mock).mockResolvedValue({});
    renderWithProviders(
      <EditNoteModal
        opened={true}
        onClose={vi.fn()}
        note={noteWithVerses}
      />
    );

    // Add John 3:17 to the linked verses, then let an autosave
    // tick fire — the save must include the CURRENT refs, not
    // drop the picker change (the old bug).
    fireEvent.click(
      await screen.findByTitle('toggle-verse-references')
    );
    fireEvent.click(
      await screen.findByTitle('edit-note-verse-17')
    );
    const noteInput = await screen.findByLabelText('Note');
    fireEvent.change(noteInput, {
      target: { value: 'Edited note text' },
    });

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByLabelText('Auto save'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
    } finally {
      vi.useRealTimers();
    }

    const patchArgs = (api.editNote as Mock).mock.calls[0];
    expect(patchArgs[0]).toBe('n1');
    expect(patchArgs[1]).toBe('1');
    // The editor emits doc-JSON, not the raw typed text.
    expect(toPlainText(patchArgs[2])).toBe('Edited note text');
    expect(patchArgs[3]).toEqual([
      { book: 'John', chapter: 3, verse: 16 },
      { book: 'John', chapter: 3, verse: 17 },
    ]);
  });

  it('refetches the viewed tag page after submit', async () => {
    const fetchNotes = vi.fn().mockResolvedValue(undefined);
    (api.editNote as Mock).mockResolvedValue({});
    renderWithProviders(
      <EditNoteModal
        opened={true}
        onClose={vi.fn()}
        note={mockNote}
      />,
      {
        storeOverrides: {
          fetchNotes,
          notesPage: 2,
          notesOrdering: 'created_at',
        },
      }
    );

    const form = screen
      .getByText('Submit changes')
      .closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    // The refetch targets the viewed tag's page and ordering —
    // not the select's value at page 1 (the old bug). Assert on
    // the store action itself: an earlier test's fetchNotes
    // stub can otherwise linger via setState merges.
    await waitFor(() => {
      expect(fetchNotes).toHaveBeenCalledWith('1', {
        ordering: 'created_at',
        page: 2,
      });
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

  describe('note images', () => {
    const makeImage = (id: string) => ({
      id,
      storage_url: `gs://bucket/originals/${id}/${id}.png`,
      signed_url: `https://example.com/${id}.png`,
      content_type: 'image/png',
      size_bytes: 1024,
      uploaded_by: 1,
      created_at: '2024-01-01T00:00:00Z',
    });

    const noteWithImage = () =>
      createMockNote({
        id: 'n1',
        note_text: 'Original note text',
        tag: createMockTag({ id: '1', name: 'Faith' }),
        verses: [],
      });

    // Note payloads carry no images — the modal fetches the
    // list on open, so tests seed it through the API mock.
    const seedImages = (...images: ReturnType<typeof makeImage>[]) => {
      (api.fetchNoteImages as Mock).mockResolvedValue(images);
    };

    const attachFiles = (files: File[]) => {
      const input = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      Object.defineProperty(input, 'files', {
        value: files,
        configurable: true,
      });
      fireEvent.change(input);
    };

    it('renders attached images and deletes one', async () => {
      seedImages(makeImage('img-1'));
      (api.deleteImage as Mock).mockResolvedValue(undefined);
      renderWithProviders(
        <EditNoteModal
          opened={true}
          onClose={vi.fn()}
          note={noteWithImage()}
        />
      );

      const thumb = await screen.findByAltText('img-1.png');
      expect(thumb).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Remove image img-1.png',
        })
      );

      await waitFor(() => {
        expect(api.deleteImage).toHaveBeenCalledWith('img-1');
      });
      expect(
        document.querySelector('img[alt="img-1.png"]')
      ).not.toBeInTheDocument();
    });

    it('uploads immediately when a file is attached',
      async () => {
        (api.uploadNoteImage as Mock).mockResolvedValue(
          makeImage('img-2')
        );
        renderWithProviders(
          <EditNoteModal
            opened={true}
            onClose={vi.fn()}
            note={mockNote}
          />
        );

        const file = new File(
          ['x'], 'photo.png', { type: 'image/png' }
        );
        attachFiles([file]);

        // Edit mode knows the note id — no staging.
        await waitFor(() => {
          expect(api.uploadNoteImage).toHaveBeenCalledWith(
            'n1',
            file
          );
        });
        // The uploaded image's thumb is appended.
        await waitFor(() => {
          expect(
            document.querySelector('img[alt="img-2.png"]')
          ).toBeInTheDocument();
        });
      });

    it('re-uploads a file after its attached thumb is ' +
      'deleted', async () => {
        (api.uploadNoteImage as Mock)
          .mockResolvedValueOnce(makeImage('img-2'))
          .mockResolvedValueOnce(makeImage('img-3'));
        (api.deleteImage as Mock).mockResolvedValue(undefined);
        renderWithProviders(
          <EditNoteModal
            opened={true}
            onClose={vi.fn()}
            note={mockNote}
          />
        );

        // lastModified pins the content signature — a
        // re-selected file is a new File object with the
        // same signature.
        const makeFile = () =>
          new File(['x'], 'photo.png', {
            type: 'image/png',
            lastModified: 1000,
          });
        attachFiles([makeFile()]);
        await waitFor(() => {
          expect(
            document.querySelector('img[alt="img-2.png"]')
          ).toBeInTheDocument();
        });

        fireEvent.click(
          screen.getByRole('button', {
            name: 'Remove image img-2.png',
          })
        );
        await waitFor(() => {
          expect(api.deleteImage).toHaveBeenCalledWith(
            'img-2'
          );
          expect(
            document.querySelector('img[alt="img-2.png"]')
          ).not.toBeInTheDocument();
        });

        // The deleted image's signature must no longer
        // block the re-select: the upload fires again.
        attachFiles([makeFile()]);
        await waitFor(() => {
          expect(api.uploadNoteImage).toHaveBeenCalledTimes(
            2
          );
        });
        await waitFor(() => {
          expect(
            document.querySelector('img[alt="img-3.png"]')
          ).toBeInTheDocument();
        });
      });

    it('uploads a rapidly re-selected file only once',
      async () => {
        let resolveUpload: (
          value: Awaited<
            ReturnType<typeof api.uploadNoteImage>
          >
        ) => void = () => undefined;
        (api.uploadNoteImage as Mock).mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveUpload = resolve;
            })
        );
        renderWithProviders(
          <EditNoteModal
            opened={true}
            onClose={vi.fn()}
            note={mockNote}
          />
        );

        const file = new File(['x'], 'photo.png', {
          type: 'image/png',
          lastModified: 1000,
        });
        // The second select lands while the first upload
        // is still in flight — the claimed signature must
        // dedup it.
        attachFiles([file]);
        attachFiles([file]);

        await act(async () => {
          resolveUpload(makeImage('img-2'));
        });
        expect(api.uploadNoteImage).toHaveBeenCalledTimes(1);
        await waitFor(() => {
          expect(
            document.querySelector('img[alt="img-2.png"]')
          ).toBeInTheDocument();
        });
      });

    it('refreshes the image list when a thumb fails ' +
      'to load', async () => {
        (api.fetchNoteImages as Mock)
          .mockResolvedValueOnce([makeImage('img-1')])
          .mockResolvedValue([makeImage('img-9')]);
        renderWithProviders(
          <EditNoteModal
            opened={true}
            onClose={vi.fn()}
            note={noteWithImage()}
          />
        );

        const thumb = await screen.findByAltText('img-1.png');
        fireEvent.error(thumb as HTMLElement);

        await waitFor(() => {
          expect(api.fetchNoteImages).toHaveBeenCalledWith(
            'n1'
          );
        });
        await waitFor(() => {
          expect(
            document.querySelector('img[alt="img-9.png"]')
          ).toBeInTheDocument();
        });
      });

    it('refreshes the image list once when several ' +
      'thumbs error in one commit', async () => {
        let resolveFetch: (
          value: Awaited<
            ReturnType<typeof api.fetchNoteImages>
          >
        ) => void = () => undefined;
        (api.fetchNoteImages as Mock)
          .mockResolvedValueOnce([
            makeImage('img-1'),
            makeImage('img-2'),
          ])
          .mockImplementation(
            () =>
              new Promise((resolve) => {
                resolveFetch = resolve;
              })
          );
        const twoImages = createMockNote({
          id: 'n1',
          note_text: 'Original note text',
          tag: createMockTag({ id: '1', name: 'Faith' }),
          verses: [],
        });
        renderWithProviders(
          <EditNoteModal
            opened={true}
            onClose={vi.fn()}
            note={twoImages}
          />
        );

        const first = await screen.findByAltText('img-1.png');
        const second = document.querySelector(
          'img[alt="img-2.png"]'
        );
        expect(second).toBeInTheDocument();
        fireEvent.error(first as HTMLElement);
        fireEvent.error(second as HTMLElement);

        // The second error sees the refresh already in
        // flight — one refresh for the whole commit, on top
        // of the initial load.
        expect(api.fetchNoteImages).toHaveBeenCalledTimes(2);

        await act(async () => {
          resolveFetch([
            makeImage('img-1'),
            makeImage('img-2'),
          ]);
        });
      });

    it('submits an image-only note with no text or ' +
      'verses', async () => {
        (api.editNote as Mock).mockResolvedValue({});
        seedImages(makeImage('img-1'));
        const imageOnlyNote = createMockNote({
          id: 'n1',
          note_text: '',
          tag: createMockTag({ id: '1', name: 'Faith' }),
          verses: [],
        });
        renderWithProviders(
          <EditNoteModal
            opened={true}
            onClose={vi.fn()}
            note={imageOnlyNote}
          />
        );

        // The attached image is the note's only content —
        // submit must reach the API, not the "add text or
        // an image" validation.
        await waitFor(() => {
          expect(
            document.querySelector('img[alt="img-1.png"]')
          ).toBeInTheDocument();
        });
        const form = screen
          .getByText('Submit changes')
          .closest('form');
        fireEvent.submit(form as HTMLFormElement);

        await waitFor(() => {
          expect(api.editNote).toHaveBeenCalledWith(
            'n1',
            '1',
            '',
            [],
            false
          );
        });
      });
  });
});
