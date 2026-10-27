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
import AddStandaloneNoteModal from './AddStandaloneNoteModal';
import { renderWithProviders } from '../__tests__/helpers';
import { useBibleStore } from '../store';
import {
  resetNoteEditorDrafts,
} from '../hooks/useNoteEditor';
import * as api from '../api';
import {
  isTiptapDocString,
  toPlainText,
} from '../utils/tiptapContent';

// Mock API (appropriate for unit testing)
vi.mock('../api', () => ({
  getTags: vi.fn(),
  addTagNote: vi.fn(),
  editNote: vi.fn(),
}));

// ProseMirror needs DOM APIs happy-dom lacks — stub the editor.
vi.mock('./RichTextEditor', async () => ({
  default: (
    await import('../__tests__/mocks/RichTextEditorStub')
  ).default,
}));

describe('AddStandaloneNoteModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The editor drafts map is module-scoped — clear it or a
    // previous test's draft resumes inside this one.
    resetNoteEditorDrafts();

    (api.getTags as Mock).mockResolvedValue([
      { id: '1', name: 'Faith', parent_tag: null, public: false,
        created_at: '', updated_at: '' },
    ]);
  });

  const typeAndSubmit = async (text: string) => {
    const noteInput = await screen.findByLabelText('Note');
    fireEvent.change(noteInput, { target: { value: text } });
    const form = screen
      .getByRole('button', { name: 'Submit' })
      .closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
  };

  it('should not render when closed', () => {
    renderWithProviders(
      <AddStandaloneNoteModal opened={false} onClose={vi.fn()} />
    );
    expect(
      screen.queryByText('New note')
    ).not.toBeInTheDocument();
  });

  it('should render NoteForm when opened', async () => {
    renderWithProviders(
      <AddStandaloneNoteModal opened={true} onClose={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Note')).toBeInTheDocument();
    });
  });

  it('submits a standalone note with no verse references',
    async () => {
      (api.addTagNote as Mock).mockResolvedValue({ id: 'n1' });
      const onClose = vi.fn();
      renderWithProviders(
        <AddStandaloneNoteModal
          opened={true}
          onClose={onClose}
        />,
        { storeOverrides: { lastSelectedTagId: '1' } }
      );

      await typeAndSubmit('Standalone body');

      await waitFor(() => {
        expect(api.addTagNote).toHaveBeenCalledTimes(1);
      });
      const [tagId, text, refs] =
        (api.addTagNote as Mock).mock.calls[0];
      expect(tagId).toBe('1');
      // The editor emits doc-JSON, not the raw typed text.
      expect(isTiptapDocString(text)).toBe(true);
      expect(toPlainText(text)).toBe('Standalone body');
      // Standalone notes carry no verse links.
      expect(refs).toEqual([]);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
      expect(useBibleStore.getState().lastSelectedTagId).toBe('1');
    });

  it('PATCHes the autosaved draft on the next tick',
    async () => {
      (api.addTagNote as Mock).mockResolvedValue({ id: 'n1' });
      (api.editNote as Mock).mockResolvedValue({});

      renderWithProviders(
        <AddStandaloneNoteModal
          opened={true}
          onClose={vi.fn()}
        />,
        // Autosave skips tagless drafts — give the form a
        // selected tag via the store.
        { storeOverrides: { lastSelectedTagId: '1' } }
      );

      fireEvent.change(await screen.findByLabelText('Note'), {
        target: { value: 'Draft' },
      });

      vi.useFakeTimers();
      try {
        fireEvent.click(screen.getByLabelText('Auto save'));
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(api.addTagNote).toHaveBeenCalledTimes(1);

        // A second tick after editing PATCHes the created note
        // instead of POSTing a duplicate.
        fireEvent.change(screen.getByLabelText('Note'), {
          target: { value: 'Draft v2' },
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(api.editNote).toHaveBeenCalledTimes(1);
        const patchArgs =
          (api.editNote as Mock).mock.calls[0];
        expect(patchArgs[0]).toBe('n1');
        expectDocArg(patchArgs[2], 'Draft v2');
        expect(api.addTagNote).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

  it('PATCHes the autosaved note when submit races autosave',
    async () => {
      // Autosave POST stays in flight while Submit is clicked;
      // submit must wait for it, then PATCH — never a second
      // POST. Twin of the AddTagNoteModal race test.
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
        <AddStandaloneNoteModal
          opened={true}
          onClose={vi.fn()}
        />,
        // Autosave skips tagless drafts — give the form a
        // selected tag via the store.
        { storeOverrides: { lastSelectedTagId: '1' } }
      );

      fireEvent.change(await screen.findByLabelText('Note'), {
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
      expectDocArg(patchArgs[2], 'Draft');
      expect(api.addTagNote).toHaveBeenCalledTimes(1);
    });

  it('reopening after autosave PATCHes the draft instead ' +
    'of POSTing a duplicate', async () => {
    // Mantine unmounts the form on close — the editor draft
    // carries the autosaved note id across the remount.
    // Twin of the AddTagNoteModal reopen test.
    (api.addTagNote as Mock).mockResolvedValue({ id: 'n1' });
    (api.editNote as Mock).mockResolvedValue({});

    const overrides = { lastSelectedTagId: '1' };

    const { unmount } = renderWithProviders(
      <AddStandaloneNoteModal
        opened={true}
        onClose={vi.fn()}
      />,
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
      <AddStandaloneNoteModal
        opened={true}
        onClose={vi.fn()}
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
    expect(
      vi.mocked(api.editNote).mock.calls[0][0]
    ).toBe('n1');
  });
});

// The stub emits `JSON.stringify(getJSON())` like the real
// editor — verify the contract, then compare the text content.
const expectDocArg = (arg: unknown, text: string) => {
  expect(typeof arg).toBe('string');
  expect(isTiptapDocString(arg as string)).toBe(true);
  expect(toPlainText(arg as string)).toBe(text);
};
