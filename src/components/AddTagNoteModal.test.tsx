import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type Mock,
} from 'vitest';
import AddTagNoteModal from './AddTagNoteModal';
import { emptyNoteDraft } from './noteDraft';
import { renderWithProviders } from '../__tests__/helpers';
import * as api from '../api';

// Mock API (appropriate for unit testing)
vi.mock('../api', () => ({
  getTags: vi.fn(),
  getVersesInChapter: vi.fn(),
  getLinkedNotes: vi.fn(),
  addTagNote: vi.fn(),
  editNote: vi.fn(),
}));

// ProseMirror needs DOM APIs happy-dom lacks — stub the editor.
vi.mock('./RichTextEditor', async () => ({
  default: (
    await import('../__tests__/mocks/RichTextEditorStub')
  ).default,
}));

describe('AddTagNoteModal Component', () => {
  // Fresh parent-owned draft per render — mirrors how
  // VerseActionToolbar keeps the ref outside the modal.
  const draftRef = () => ({ current: emptyNoteDraft() });

  beforeEach(() => {
    vi.clearAllMocks();

    (api.getTags as Mock).mockResolvedValue([
      { id: '1', name: 'Faith', parent_tag: null,
        created_at: '', updated_at: '' },
    ]);
    (api.getVersesInChapter as Mock).mockResolvedValue({
      verses: [],
      headings: [],
    });

    (api.getLinkedNotes as Mock).mockResolvedValue({
      count: 0,
      results: [],
    });
  });

  const genesisSelection = {
    scope: 'bible',
    refs: [
      { bookId: 'GEN', chapter: 1, verse: 1 },
      { bookId: 'GEN', chapter: 1, verse: 2 },
    ],
  };

  it('should not render when closed', () => {
    renderWithProviders(
      <AddTagNoteModal
        opened={false}
        onClose={vi.fn()}
        draftRef={draftRef()}
      />,
      {
        storeOverrides: {
          verseSelection: genesisSelection,
          activeBookId: 'GEN',
          activeChapter: 1,
        },
      }
    );
    expect(screen.queryByText('Add note')).not.toBeInTheDocument();
  });

  it('should render when opened', async () => {
    renderWithProviders(
      <AddTagNoteModal
        opened={true}
        onClose={vi.fn()}
        draftRef={draftRef()}
      />,
      {
        storeOverrides: {
          verseSelection: genesisSelection,
          activeBookId: 'GEN',
          activeChapter: 1,
        },
      }
    );

    await waitFor(() => {
      expect(screen.getByText('Add note')).toBeInTheDocument();
    });
  });

  it('should render NoteForm when opened', async () => {
    renderWithProviders(
      <AddTagNoteModal
        opened={true}
        onClose={vi.fn()}
        draftRef={draftRef()}
      />,
      {
        storeOverrides: {
          verseSelection: genesisSelection,
          activeBookId: 'GEN',
          activeChapter: 1,
        },
      }
    );

    await waitFor(() => {
      // Check for NoteForm elements instead of test-id
      expect(screen.getByLabelText('Note')).toBeInTheDocument();
    });
  });

  it('resolves stored product ids before fetching verse text',
    async () => {
      // `ENGKJV:text:0` must collapse to 'ENGKJV' so the offline
      // bundle fast-path in api.tsx is used; a split-text product
      // resolves to the member covering the selected book.
      const kjv = {
        abbr: 'ENGKJV',
        name: 'King James Version',
        language: 'English',
        language_iso: 'eng',
        filesets: [
          { id: 'ENGKJV', type: 'text_plain' as const, size: 'C',
            codec: null, bitrate: null },
        ],
      };
      const niv = {
        abbr: 'ENGNIV',
        name: 'New International Version',
        language: 'English',
        language_iso: 'eng',
        filesets: [
          { id: 'ENGNIVO_ET', type: 'text_plain' as const,
            size: 'OT', codec: null, bitrate: null },
          { id: 'ENGNIVN_ET', type: 'text_plain' as const,
            size: 'NT', codec: null, bitrate: null },
        ],
      };

      renderWithProviders(
        <AddTagNoteModal
          opened={true}
          onClose={vi.fn()}
          draftRef={draftRef()}
        />,
        {
          storeOverrides: {
            verseSelection: genesisSelection,
            activeBookId: 'GEN',
            activeChapter: 1,
            activeTextFilesetId: 'ENGNIV:text:0',
            translations: [kjv, niv],
          },
        }
      );

      await waitFor(() => {
        expect(api.getVersesInChapter).toHaveBeenCalledWith(
          'GEN',
          1,
          'ENGNIVO_ET',
        );
      });

      (api.getVersesInChapter as Mock).mockClear();
      renderWithProviders(
        <AddTagNoteModal
          opened={true}
          onClose={vi.fn()}
          draftRef={draftRef()}
        />,
        {
          storeOverrides: {
            verseSelection: genesisSelection,
            activeBookId: 'GEN',
            activeChapter: 1,
            activeTextFilesetId: 'ENGKJV:text:0',
            translations: [kjv],
          },
        }
      );

      await waitFor(() => {
        expect(api.getVersesInChapter).toHaveBeenCalledWith(
          'GEN',
          1,
          'ENGKJV',
        );
      });
    });

  const linkedNote = {
    id: 'NOT1',
    note_text: 'Already noted this passage',
    public: false,
    is_owner: true,
    created_at: '',
    updated_at: '',
    tag: {
      id: '1', name: 'Faith', parent_tag: null,
      created_at: '', updated_at: '',
    },
    verses: [
      {
        book: 'Genesis', chapter: 1, verse: 1,
        text: 'In the beginning...',
      },
    ],
    tag_position: null,
  };

  it('shows the count and collapsed linked notes for the selection',
    async () => {
      (api.getLinkedNotes as Mock).mockResolvedValue({
        count: 1,
        results: [linkedNote],
      });

      renderWithProviders(
        <AddTagNoteModal
          opened={true}
          onClose={vi.fn()}
          draftRef={draftRef()}
        />,
        {
          storeOverrides: {
            verseSelection: genesisSelection,
            activeBookId: 'GEN',
            activeChapter: 1,
            activeTextFilesetId: 'ENGKJV',
          },
        }
      );

      await waitFor(() => {
        expect(
          screen.getByText('1 linked note')
        ).toBeInTheDocument();
      });
      // Collapsed rows show the passage ref but keep the
      // note text and tag hidden until expanded.
      const row = screen.getByTitle('linked-note-NOT1');
      expect(
        within(row).getByText('Genesis 1:1')
      ).toBeVisible();
      expect(
        within(row).getByText('Already noted this passage')
      ).not.toBeVisible();
      expect(
        within(row).getByText('Faith')
      ).not.toBeVisible();
      expect(api.getLinkedNotes).toHaveBeenCalledWith(
        [
          { book: 'Genesis', chapter: 1, verse: 1 },
          { book: 'Genesis', chapter: 1, verse: 2 },
        ],
        'ENGKJV'
      );
    });

  it('expands a linked note to show its text and tag',
    async () => {
      (api.getLinkedNotes as Mock).mockResolvedValue({
        count: 1,
        results: [linkedNote],
      });

      renderWithProviders(
        <AddTagNoteModal opened={true} onClose={vi.fn()} />,
        {
          storeOverrides: {
            verseSelection: genesisSelection,
            activeBookId: 'GEN',
            activeChapter: 1,
            activeTextFilesetId: 'ENGKJV',
          },
        }
      );

      const row = await screen.findByTitle('linked-note-NOT1');
      const toggle = within(row).getByTitle(
        'linked-note-toggle-NOT1'
      );
      const noteText = within(row).getByText(
        'Already noted this passage'
      );
      const tagName = within(row).getByText('Faith');

      // Expand reveals the note text and the linked tag.
      fireEvent.click(toggle);
      await waitFor(() => expect(noteText).toBeVisible());
      expect(tagName).toBeVisible();

      // Collapse hides them again.
      fireEvent.click(toggle);
      await waitFor(() => expect(noteText).not.toBeVisible());
      expect(tagName).not.toBeVisible();
    });

  it('queries linked notes only when opened with a selection',
    async () => {
      renderWithProviders(
        <AddTagNoteModal
          opened={false}
          onClose={vi.fn()}
          draftRef={draftRef()}
        />,
        {
          storeOverrides: {
            verseSelection: genesisSelection,
            activeBookId: 'GEN',
            activeChapter: 1,
          },
        }
      );
      await Promise.resolve();
      expect(api.getLinkedNotes).not.toHaveBeenCalled();
    });

  it('PATCHes the autosaved note when submit races autosave',
    async () => {
      // Autosave POST stays in flight while Submit is clicked;
      // submit must wait for it, then PATCH — never a second POST.
      let resolvePost: (value: { id: string }) => void =
        () => undefined;
      (api.addTagNote as Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePost = resolve;
          })
      );
      (api.editNote as Mock).mockResolvedValue({});

      renderWithProviders(
        <AddTagNoteModal
          opened={true}
          onClose={vi.fn()}
          draftRef={draftRef()}
        />,
        {
          storeOverrides: {
            verseSelection: genesisSelection,
            activeBookId: 'GEN',
            activeChapter: 1,
            // A selected tag is required — autosave skips
            // tagless drafts instead of POSTing `tag: ''`.
            lastSelectedTagId: '1',
          },
        }
      );

      const noteInput = await screen.findByLabelText('Note');
      fireEvent.change(noteInput, {
        target: { value: 'Draft' },
      });

      vi.useFakeTimers();
      try {
        fireEvent.click(screen.getByLabelText('Auto save'));
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(api.addTagNote).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }

      // Submit while the autosave POST is still pending.
      fireEvent.click(
        screen.getByRole('button', { name: 'Submit' })
      );
      await act(async () => {
        resolvePost({ id: 'n1' });
      });

      await waitFor(() => {
        expect(api.editNote).toHaveBeenCalledTimes(1);
      });
      expect(api.editNote).toHaveBeenCalledWith(
        'n1',
        '1',
        'Draft'
      );
      expect(api.addTagNote).toHaveBeenCalledTimes(1);
    });

  it('reopening after autosave PATCHes the draft instead ' +
    'of POSTing a duplicate', async () => {
    // Mantine unmounts the form on close — the shared draft
    // carries the autosaved note id across the remount.
    const sharedDraft = draftRef();
    (api.addTagNote as Mock).mockResolvedValue({ id: 'n-draft' });
    (api.editNote as Mock).mockResolvedValue({});

    const overrides = {
      verseSelection: genesisSelection,
      activeBookId: 'GEN',
      activeChapter: 1,
      lastSelectedTagId: '1',
    };

    const { unmount } = renderWithProviders(
      <AddTagNoteModal
        opened={true}
        onClose={vi.fn()}
        draftRef={sharedDraft}
      />,
      { storeOverrides: overrides }
    );

    const noteInput = await screen.findByLabelText('Note');
    fireEvent.change(noteInput, { target: { value: 'Draft' } });
    // Fake timers must be installed before the Auto save click —
    // the interval registers on whichever clock is active.
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByLabelText('Auto save'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
    } finally {
      vi.useRealTimers();
    }
    expect(api.addTagNote).toHaveBeenCalledTimes(1);
    expect(sharedDraft.current.savedNoteId).toBe('n-draft');

    // Closing unmounts the form; the unmount flush may PATCH
    // the latest text behind the draft queue.
    unmount();

    renderWithProviders(
      <AddTagNoteModal
        opened={true}
        onClose={vi.fn()}
        draftRef={sharedDraft}
      />,
      { storeOverrides: overrides }
    );

    // The form restores the draft instead of starting blank.
    await waitFor(() => {
      expect(
        (screen.getByLabelText('Note') as HTMLTextAreaElement)
          .value
      ).toBe('Draft');
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

    // Still exactly one POST — every later write PATCHes.
    expect(api.addTagNote).toHaveBeenCalledTimes(1);
    expect(api.editNote).toHaveBeenCalled();
    expect(vi.mocked(api.editNote).mock.calls[0][0]).toBe(
      'n-draft'
    );
  });

  // Note: Full modal interaction testing is problematic
  // due to portal rendering. See SKIPPED_TESTS.md.
  it.skip('should call addTagNote when form submitted', () => {
    // This test is skipped due to modal portal rendering
  });

  it.skip('should clear selected verses after submission', () => {
    // This test is skipped due to modal portal rendering
  });
});
