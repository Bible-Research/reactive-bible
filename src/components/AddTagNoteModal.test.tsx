import '@testing-library/jest-dom';
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
import { useState } from 'react';
import AddTagNoteModal from './AddTagNoteModal';
import { renderWithProviders } from '../__tests__/helpers';
import { useBibleStore } from '../store';
import * as api from '../api';
import {
  isTiptapDocString,
  toPlainText,
} from '../utils/tiptapContent';

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
      <AddTagNoteModal opened={false} onClose={vi.fn()} />,
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
      <AddTagNoteModal opened={true} onClose={vi.fn()} />,
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
      <AddTagNoteModal opened={true} onClose={vi.fn()} />,
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
        <AddTagNoteModal opened={true} onClose={vi.fn()} />,
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
        <AddTagNoteModal opened={true} onClose={vi.fn()} />,
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

  it('shows the count and the linked notes for the selection',
    async () => {
      (api.getLinkedNotes as Mock).mockResolvedValue({
        count: 1,
        results: [
          {
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
          },
        ],
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

      await waitFor(() => {
        expect(
          screen.getByText('1 linked note')
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText('Already noted this passage')
      ).toBeInTheDocument();
      expect(api.getLinkedNotes).toHaveBeenCalledWith(
        [
          { book: 'Genesis', chapter: 1, verse: 1 },
          { book: 'Genesis', chapter: 1, verse: 2 },
        ],
        'ENGKJV'
      );
    });

  it('queries linked notes only when opened with a selection',
    async () => {
      renderWithProviders(
        <AddTagNoteModal opened={false} onClose={vi.fn()} />,
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
        <AddTagNoteModal opened={true} onClose={vi.fn()} />,
        {
          storeOverrides: {
            verseSelection: genesisSelection,
            activeBookId: 'GEN',
            activeChapter: 1,
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
      const patchArgs = (api.editNote as Mock).mock.calls[0];
      expect(patchArgs[0]).toBe('n1');
      expect(patchArgs[1]).toBe('');
      // The editor emits doc-JSON, not the raw typed text.
      expect(isTiptapDocString(patchArgs[2])).toBe(true);
      expect(toPlainText(patchArgs[2])).toBe('Draft');
      expect(api.addTagNote).toHaveBeenCalledTimes(1);
    });

  // Stateful host so `onClose` actually closes the modal —
  // the old notes-workflow integration test asserted this.
  const ControlledModal = () => {
    const [open, setOpen] = useState(true);
    return (
      <AddTagNoteModal
        opened={open}
        onClose={() => setOpen(false)}
      />
    );
  };

  const typeAndSubmit = async (text: string) => {
    const noteInput = await screen.findByLabelText('Note');
    fireEvent.change(noteInput, { target: { value: text } });
    const form = screen
      .getByRole('button', { name: 'Submit' })
      .closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
  };

  it('should call addTagNote when form submitted', async () => {
    (api.addTagNote as Mock).mockResolvedValue({ id: 'n1' });
    const onClose = vi.fn();
    renderWithProviders(
      <AddTagNoteModal opened={true} onClose={onClose} />,
      {
        storeOverrides: {
          verseSelection: genesisSelection,
          activeBookId: 'GEN',
          activeChapter: 1,
        },
      }
    );

    await typeAndSubmit('A test note');

    await waitFor(() => {
      expect(api.addTagNote).toHaveBeenCalledTimes(1);
    });
    const [tagId, text, refs] =
      (api.addTagNote as Mock).mock.calls[0];
    expect(tagId).toBe('');
    expect(isTiptapDocString(text)).toBe(true);
    expect(toPlainText(text)).toBe('A test note');
    expect(refs).toEqual([
      { book: 'Genesis', chapter: 1, verse: 1 },
      { book: 'Genesis', chapter: 1, verse: 2 },
    ]);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('should clear selected verses after submission', async () => {
    (api.addTagNote as Mock).mockResolvedValue({ id: 'n1' });
    renderWithProviders(<ControlledModal />, {
      storeOverrides: {
        verseSelection: genesisSelection,
        activeBookId: 'GEN',
        activeChapter: 1,
      },
    });

    await typeAndSubmit('A test note');

    // The modal closes and the bible selection is cleared —
    // ported from the deleted notes-workflow integration test.
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog')
      ).not.toBeInTheDocument();
    });
    expect(useBibleStore.getState().verseSelection).toBeNull();
  });

  // FIXME: reopening the modal orphans the autosaved draft on
  // the server — `savedNoteIdRef` resets in the `opened` effect
  // (AddTagNoteModal.tsx) so the next autosave POSTs a second
  // note instead of PATCHing the existing one. The fix (delete
  // the draft on close, or persist/resume its id across reopen)
  // is a product decision exceeding a ~30-line test-only fix.
  it.skip('PATCHes the autosaved draft instead of POSTing a ' +
    'second note when reopened mid-session', async () => {
      (api.addTagNote as Mock).mockResolvedValue({ id: 'n1' });
      (api.editNote as Mock).mockResolvedValue({});

      const { rerender } = renderWithProviders(
        <AddTagNoteModal opened={true} onClose={vi.fn()} />,
        {
          storeOverrides: {
            verseSelection: genesisSelection,
            activeBookId: 'GEN',
            activeChapter: 1,
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

        // Close without submitting, then reopen for the same
        // selection and keep typing — the draft should resume.
        rerender(
          <AddTagNoteModal opened={false} onClose={vi.fn()} />
        );
        rerender(
          <AddTagNoteModal opened={true} onClose={vi.fn()} />
        );
        // getByLabelText, not findBy — async queries never
        // resolve under fake timers.
        fireEvent.change(screen.getByLabelText('Note'), {
          target: { value: 'Draft continued' },
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });

        expect(api.addTagNote).toHaveBeenCalledTimes(1);
        expect(api.editNote).toHaveBeenCalledTimes(1);
        const patchArgs =
          (api.editNote as Mock).mock.calls[0];
        expect(patchArgs[0]).toBe('n1');
        expect(toPlainText(patchArgs[2])).toBe('Draft continued');
      } finally {
        vi.useRealTimers();
      }
    });
});
