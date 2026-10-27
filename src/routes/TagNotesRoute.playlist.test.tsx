import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../__tests__/helpers';
import TagNotesRoute from './TagNotesRoute';
import * as api from '../api';
import { Note, PlaylistItem, Tag } from '../types';

const mockNavigate = vi.fn();
const mockUseParams = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<
    typeof import('react-router-dom')
  >('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
  };
});

vi.mock('../api');
vi.mock('../utils/cacheManager');

const mockApi = vi.mocked(api);

const tag: Tag = {
  id: 'tag-123',
  name: 'Bible Study',
  parent_tag: null,
  public: false,
  created_at: '',
  updated_at: '',
};

const makeNote = (
  id: string,
  position: number,
  verses: Note['verses']
): Note => ({
  id,
  note_text: `Note ${id}`,
  public: true,
  is_owner: true,
  created_at: '',
  updated_at: '',
  tag,
  verses,
  tag_position: position,
});

// The verse-less note sorts first — the play index must come
// from the filtered playlist, not the full sorted list.
const verseLess = makeNote('note-no-verses', 1, []);
const playable = makeNote('note-playable', 2, [
  { book: 'John', chapter: 3, verse: 16, text: 'For God...' },
  { book: 'John', chapter: 3, verse: 17, text: 'For God sent' },
]);
// A note whose verses span two chapters must produce one
// playlist item per book/chapter block — the old code silently
// dropped every block after the first.
const spanning = makeNote('note-spanning', 3, [
  { book: 'John', chapter: 3, verse: 16, text: 'For God...' },
  { book: 'John', chapter: 5, verse: 1, text: 'After this' },
]);

const mockFetchNotes = vi.fn();
const mockGetTags = vi.fn();
const mockSetPlaylistItems = vi.fn();
const mockSetPlaylistStart = vi.fn();

const storeOverrides = {
  notes: [verseLess, playable, spanning],
  notesCount: 3,
  notesPage: 1,
  notesPageSize: 25,
  lastSelectedTagId: 'tag-123',
  tags: [tag],
  fetchNotes: mockFetchNotes,
  getTags: mockGetTags,
  setAudioPlaylistItems: mockSetPlaylistItems,
  setAudioPlaylistStartIndex: mockSetPlaylistStart,
};

const lastPlaylist = (): PlaylistItem[] => {
  const calls = mockSetPlaylistItems.mock.calls;
  const withItems = calls.filter(
    ([items]) => Array.isArray(items) && items.length > 0
  );
  return withItems[withItems.length - 1]?.[0] ?? [];
};

describe('TagNotesRoute playlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ tagId: 'tag-123' });
    mockFetchNotes.mockResolvedValue(undefined);
    mockGetTags.mockResolvedValue(undefined);
    mockApi.getTag.mockResolvedValue(tag);
    mockApi.fetchCommentCounts.mockResolvedValue({});
  });

  it('indexes play-from-note into the filtered playlist',
    async () => {
      renderWithProviders(<TagNotesRoute />, {
        storeOverrides,
      });

      await waitFor(() => {
        expect(
          document.querySelector(
            '[aria-label="play-from-note-playable"]'
          )
        ).toBeTruthy();
      });
      const playButton = document.querySelector(
        '[aria-label="play-from-note-playable"]'
      ) as HTMLElement;

      fireEvent.click(playButton);

      // `playable` is sortedNotes[1] but playlist item 0 — the
      // verse-less note produces no item.
      expect(mockSetPlaylistStart).toHaveBeenCalledWith(0);
    });

  it('splits multi-chapter notes into one item per block',
    async () => {
      renderWithProviders(<TagNotesRoute />, {
        storeOverrides,
      });

      await waitFor(() => {
        expect(lastPlaylist().length).toBeGreaterThan(0);
      });

      const items = lastPlaylist();
      // `playable` -> one item, `spanning` -> two blocks.
      expect(items).toHaveLength(3);
      const spanningItems = items.filter(
        (item) => item.scope === 'note-spanning'
      );
      expect(
        spanningItems.map((item) => item.chapter).sort()
      ).toEqual([3, 5]);
      const chapter5 = spanningItems.find(
        (item) => item.chapter === 5
      );
      expect(chapter5?.startVerse).toBe(1);
      expect(chapter5?.endVerse).toBe(1);
      // itemId must be unique per block — Audio's navigation
      // effect keys on it, so identical ids would skip the
      // re-run when playback crosses to the second block.
      // `scope` stays at the note level for DOM/highlight ids.
      const itemIds = items.map((item) => item.itemId);
      expect(new Set(itemIds).size).toBe(itemIds.length);
      expect(
        spanningItems.map((item) => item.itemId)
      ).toEqual([
        'note-spanning:JHN:3',
        'note-spanning:JHN:5',
      ]);
    });

  it('hides the play button on verse-less notes', async () => {
    renderWithProviders(<TagNotesRoute />, {
      storeOverrides,
    });

    await waitFor(() => {
      expect(
        document.querySelector(
          '[aria-label="play-from-note-playable"]'
        )
      ).toBeTruthy();
    });
    // Verse-less notes never enter the playlist —
    // NoteCardActions hides the play button entirely
    // (canPlay && onPlayFromNote), matching its unit test.
    const button = document.querySelector(
      '[aria-label="play-from-note-no-verses"]'
    );
    expect(button).toBeNull();
  });
});
