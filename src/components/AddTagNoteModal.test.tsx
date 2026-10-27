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
import { useState } from 'react';
import AddTagNoteModal from './AddTagNoteModal';
import { resetNoteEditorDrafts } from '../hooks/useNoteEditor';
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
    // Drafts live outside the component — reset them or a
    // previous test's autosaved note would resume here.
    resetNoteEditorDrafts();

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
      // bundle fast-path in src/api/verses.ts is used; a
      // split-text product resolves to the member covering the
      // selected book.
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
      const patchArgs = (api.editNote as Mock).mock.calls[0];
      expect(patchArgs[0]).toBe('n1');
      expect(patchArgs[1]).toBe('1');
      // The editor emits doc-JSON, not the raw typed text.
      expect(isTiptapDocString(patchArgs[2])).toBe(true);
      expect(toPlainText(patchArgs[2])).toBe('Draft');
      // Edit-mode saves carry the picker's current refs.
      expect(patchArgs[3]).toEqual([
        { book: 'Genesis', chapter: 1, verse: 1 },
        { book: 'Genesis', chapter: 1, verse: 2 },
      ]);
      expect(api.addTagNote).toHaveBeenCalledTimes(1);
    });

  it('reopening after autosave PATCHes the draft instead ' +
    'of POSTing a duplicate', async () => {
    // Mantine unmounts the form on close — the editor draft
    // carries the autosaved note id across the remount.
    (api.addTagNote as Mock).mockResolvedValue({ id: 'n-draft' });
    (api.editNote as Mock).mockResolvedValue({});

    const overrides = {
      verseSelection: genesisSelection,
      activeBookId: 'GEN',
      activeChapter: 1,
      lastSelectedTagId: '1',
    };

    const { unmount } = renderWithProviders(
      <AddTagNoteModal opened={true} onClose={vi.fn()} />,
      { storeOverrides: overrides }
    );

    const noteInput = await screen.findByLabelText('Note');
    fireEvent.change(noteInput, { target: { value: 'Draft' } });
    // Fake timers must be installed before the Auto save
    // click — the interval registers on whichever clock is
    // active.
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

    // Closing unmounts the form; the unmount flush may PATCH
    // the latest text behind the draft's save queue.
    unmount();

    renderWithProviders(
      <AddTagNoteModal opened={true} onClose={vi.fn()} />,
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
    expect(
      vi.mocked(api.editNote).mock.calls[0][0]
    ).toBe('n-draft');
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
          lastSelectedTagId: '1',
        },
      }
    );

    await typeAndSubmit('A test note');

    await waitFor(() => {
      expect(api.addTagNote).toHaveBeenCalledTimes(1);
    });
    const [tagId, text, refs] =
      (api.addTagNote as Mock).mock.calls[0];
    expect(tagId).toBe('1');
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

  it('submits a verse-only note with no text', async () => {
    (api.addTagNote as Mock).mockResolvedValue({ id: 'n1' });
    const onClose = vi.fn();
    renderWithProviders(
      <AddTagNoteModal opened={true} onClose={onClose} />,
      {
        storeOverrides: {
          verseSelection: genesisSelection,
          activeBookId: 'GEN',
          activeChapter: 1,
          lastSelectedTagId: '1',
        },
      }
    );

    // Wait for the form, then submit without typing — the
    // linked verses are the note's content.
    await screen.findByLabelText('Note');
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Submit' })
        .closest('form') as HTMLFormElement
    );

    await waitFor(() => {
      expect(api.addTagNote).toHaveBeenCalledTimes(1);
    });
    const [tagId, text, refs] =
      (api.addTagNote as Mock).mock.calls[0];
    expect(tagId).toBe('1');
    expect(toPlainText(text)).toBe('');
    expect(refs).toEqual([
      { book: 'Genesis', chapter: 1, verse: 1 },
      { book: 'Genesis', chapter: 1, verse: 2 },
    ]);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('does not POST a duplicate when the modal closes ' +
    'mid-submit', async () => {
    // Repro: autosave on, text typed since the last tick,
    // Submit clicked, modal closed while the submit's POST
    // is still in flight. The unmount flush used to chain
    // save() behind the whole submit promise — it resolved
    // only after drafts.delete(), so the flush recreated a
    // fresh draft and POSTed the same note twice.
    let resolvePost: (value: { id: string }) => void =
      () => undefined;
    (api.addTagNote as Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        })
    );

    const { unmount } = renderWithProviders(
      <AddTagNoteModal opened={true} onClose={vi.fn()} />,
      {
        storeOverrides: {
          verseSelection: genesisSelection,
          activeBookId: 'GEN',
          activeChapter: 1,
          lastSelectedTagId: '1',
        },
      }
    );

    const noteInput = await screen.findByLabelText('Note');
    fireEvent.change(noteInput, { target: { value: 'Draft' } });
    // The unmount flush only runs when autosave is enabled.
    fireEvent.click(screen.getByLabelText('Auto save'));

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Submit' })
      );
    });
    await waitFor(() => {
      expect(api.addTagNote).toHaveBeenCalledTimes(1);
    });

    // Close while the submit's POST is still pending.
    unmount();

    await act(async () => {
      resolvePost({ id: 'n1' });
      // Flush every queued continuation — submit completion
      // and the deferred flush decision behind it.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(api.addTagNote).toHaveBeenCalledTimes(1);
  });

  it('should clear selected verses after submission', async () => {
    (api.addTagNote as Mock).mockResolvedValue({ id: 'n1' });
    renderWithProviders(<ControlledModal />, {
      storeOverrides: {
        verseSelection: genesisSelection,
        activeBookId: 'GEN',
        activeChapter: 1,
        lastSelectedTagId: '1',
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

  // The useNoteEditor drafts map persists the autosaved note id
  // across modal unmounts, so a reopen resumes the draft and
  // PATCHes it instead of POSTing a second note.
  it('PATCHes the autosaved draft instead of POSTing a ' +
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
            // Autosave skips tagless drafts.
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

  it('restores the tag for a files-only draft on reopen',
    async () => {
      const faith = {
        id: '1', name: 'Faith', parent_tag: null,
        created_at: '', updated_at: '',
      };
      const hope = {
        id: '2', name: 'Hope', parent_tag: null,
        created_at: '', updated_at: '',
      };
      (api.getTags as Mock).mockResolvedValue([faith, hope]);
      const overrides = {
        verseSelection: genesisSelection,
        activeBookId: 'GEN',
        activeChapter: 1,
        tags: [faith, hope],
        lastSelectedTagId: '2',
      };
      // store.getTags clears `tags` for anonymous sessions —
      // the tag Select only populates when authenticated.
      const auth = {
        isAuthenticated: true,
        token: 'test-token',
        user: { username: 'testuser' },
      };

      const { unmount } = renderWithProviders(
        <AddTagNoteModal opened={true} onClose={vi.fn()} />,
        { storeOverrides: overrides, authStoreState: auth }
      );

      // Stage a file and pick a tag — no text, no save.
      const file = new File(
        ['x'], 'photo.png', { type: 'image/png' }
      );
      const input = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      Object.defineProperty(input, 'files', {
        value: [file],
        configurable: true,
      });
      fireEvent.change(input);
      await waitFor(() => {
        expect(
          document.querySelector('img[alt="photo.png"]')
        ).toBeInTheDocument();
      });
      fireEvent.mouseDown(screen.getByLabelText('Tag'));
      fireEvent.mouseDown(
        await screen.findByRole('option', { name: 'Faith' })
      );

      unmount();

      renderWithProviders(
        <AddTagNoteModal opened={true} onClose={vi.fn()} />,
        { storeOverrides: overrides, authStoreState: auth }
      );

      // The files-only draft restores both the staged
      // thumb and the picked tag — it used to fall back
      // to lastSelectedTagId ('Hope').
      await waitFor(() => {
        expect(
          (screen.getByLabelText('Tag') as HTMLInputElement)
            .value
        ).toBe('Faith');
      });
      expect(
        document.querySelector('img[alt="photo.png"]')
      ).toBeInTheDocument();
    });
});
