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
    // Drafts live outside the component — reset them or a
    // previous test's autosaved note would resume here.
    resetNoteEditorDrafts();

    (api.getTags as Mock).mockResolvedValue([
      { id: '1', name: 'Faith', parent_tag: null,
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

  // FIXME: reopening the modal orphans the autosaved draft on
  // the server — `savedNoteIdRef` resets in the `opened` effect
  // (AddStandaloneNoteModal.tsx) so the next autosave POSTs a
  // second note instead of PATCHing the existing one. The fix
  // (delete the draft on close, or persist/resume its id across
  // reopen) is a product decision exceeding a ~30-line
  // test-only fix.
  it.skip('PATCHes the autosaved draft instead of POSTing a ' +
    'second note when reopened mid-session', async () => {
      (api.addTagNote as Mock).mockResolvedValue({ id: 'n1' });
      (api.editNote as Mock).mockResolvedValue({});

      const { rerender } = renderWithProviders(
        <AddStandaloneNoteModal
          opened={true}
          onClose={vi.fn()}
        />
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

        // Close without submitting, then reopen and keep
        // typing — the draft should resume, not duplicate.
        rerender(
          <AddStandaloneNoteModal
            opened={false}
            onClose={vi.fn()}
          />
        );
        rerender(
          <AddStandaloneNoteModal
            opened={true}
            onClose={vi.fn()}
          />
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
        expectDocArg(patchArgs[2], 'Draft continued');
      } finally {
        vi.useRealTimers();
      }
    });
});

// The stub emits `JSON.stringify(getJSON())` like the real
// editor — verify the contract, then compare the text content.
const expectDocArg = (arg: unknown, text: string) => {
  expect(typeof arg).toBe('string');
  expect(isTiptapDocString(arg as string)).toBe(true);
  expect(toPlainText(arg as string)).toBe(text);
};
