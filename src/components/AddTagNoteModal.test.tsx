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
  addTagNote: vi.fn(),
  getVersesInChapter: vi.fn(),
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

  // Note: Full modal interaction testing is problematic
  // due to portal rendering. See SKIPPED_TESTS.md.
  it.skip('should call addTagNote when form submitted', () => {
    // This test is skipped due to modal portal rendering
  });

  it.skip('should clear selected verses after submission', () => {
    // This test is skipped due to modal portal rendering
  });
});
