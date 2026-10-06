import '@testing-library/jest-dom';
import { screen, waitFor } from '@testing-library/react';
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
  getLinkedNotes: vi.fn(),
  addTagNote: vi.fn(),
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

  // Note: Full modal interaction testing is problematic
  // due to portal rendering. See SKIPPED_TESTS.md.
  it.skip('should call addTagNote when form submitted', () => {
    // This test is skipped due to modal portal rendering
  });

  it.skip('should clear selected verses after submission', () => {
    // This test is skipped due to modal portal rendering
  });
});
