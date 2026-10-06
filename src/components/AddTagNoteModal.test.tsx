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
import AddTagNoteModal from './AddTagNoteModal';
import { renderWithProviders } from '../__tests__/helpers';
import * as api from '../api';

// Mock API (appropriate for unit testing)
vi.mock('../api', () => ({
  getTags: vi.fn(),
  getVersesInChapter: vi.fn(),
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
      expect(api.editNote).toHaveBeenCalledWith('n1', '', 'Draft');
      expect(api.addTagNote).toHaveBeenCalledTimes(1);
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
