import {
  act,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Audio from './Audio';
import { renderWithProviders } from '../__tests__/helpers';
import { FakeHowl } from '../__tests__/mocks/FakeHowl';
import { useBibleStore } from '../store';
import { getAudioTimestamps } from '../api';

// Shared faithful Howl fake — created instances are reachable
// via FakeHowl.instances / FakeHowl.latest().
vi.mock('howler', async () => {
  const { FakeHowl } = await import('../__tests__/mocks/FakeHowl');
  return { Howl: FakeHowl };
});

// Mock API
vi.mock('../api', () => ({
  getKjvAudioUrl: vi.fn().mockReturnValue('http://audio.url/test.mp3'),
  getBibleAudioUrl: vi.fn()
    .mockResolvedValue('http://audio.url/test.mp3'),
  getChapterList: vi.fn().mockReturnValue({
    book: 'Genesis',
    chapter: 1,
  }),
  getAudioTimestamps: vi.fn().mockResolvedValue([]),
  getAdjacentChapters: vi.fn().mockReturnValue({
    previous: null,
    next: null,
  }),
  BookNotInFilesetError: class BookNotInFilesetError
    extends Error {},
}));

// Note: AudioPlayer component is now used as-is (no mock)

describe('Audio Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeHowl.reset();
    vi.mocked(getAudioTimestamps).mockResolvedValue([]);
  });

  it('should render the play button', () => {
    renderWithProviders(<Audio />, {
      storeOverrides: {
        activeBookId: 'GEN',
        activeChapter: 1,
        activeAudioFilesetId: 'ENGKJV',
        showAudioPlayer: false,
      },
    });
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('clears the audio-active verse when the player closes',
    async () => {
      renderWithProviders(<Audio />, {
        storeOverrides: {
          activeBookId: 'GEN',
          activeChapter: 1,
          activeAudioFilesetId: 'ENGKJV',
          showAudioPlayer: false,
        },
      });

      fireEvent.click(screen.getByTitle('Play audio'));
      const closeButton = await screen.findByTitle(
        'Close player'
      );

      // Simulate the highlighter marking the playing verse.
      act(() => {
        useBibleStore.getState().setAudioActiveVerse({
          bookId: 'GEN',
          chapter: 1,
          verse: 3,
          scope: 'bible',
        });
      });

      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(
          useBibleStore.getState().audioActiveVerse
        ).toBeNull();
      });
    });

  it('starts chapter audio at the earliest selected verse',
    async () => {
      // ENGESV_API timestamps include a chapter announcement at
      // verse 0 — adjustTimestampsForENGESV subtracts the
      // verse0->verse1 offset (8 - 4 = 4), so verse 5 lands
      // at 40 - 4 = 36.
      vi.mocked(getAudioTimestamps).mockResolvedValue([
        { verse_start: 0, timestamp: 4 },
        { verse_start: 1, timestamp: 8 },
        { verse_start: 5, timestamp: 40 },
        { verse_start: 9, timestamp: 55 },
      ]);
      renderWithProviders(<Audio />, {
        storeOverrides: {
          activeBookId: 'GEN',
          activeChapter: 1,
          activeAudioFilesetId: 'ENGESV_API',
          verseSelection: {
            scope: 'bible',
            refs: [
              { bookId: 'GEN', chapter: 1, verse: 9 },
              { bookId: 'GEN', chapter: 1, verse: 5 },
            ],
          },
        },
      });

      fireEvent.click(screen.getByTitle('Play audio'));

      await waitFor(() => {
        expect(FakeHowl.instances[0]?.seek).toHaveBeenCalledWith(36);
      });
    });

  it('does not seek when the selection is in another ' +
    'chapter', async () => {
      vi.mocked(getAudioTimestamps).mockResolvedValue([
        { verse_start: 2, timestamp: 10 },
      ]);
      renderWithProviders(<Audio />, {
        storeOverrides: {
          activeBookId: 'GEN',
          activeChapter: 1,
          activeAudioFilesetId: 'ENGESV_API',
          verseSelection: {
            scope: 'bible',
            refs: [{ bookId: 'GEN', chapter: 2, verse: 2 }],
          },
        },
      });

      fireEvent.click(screen.getByTitle('Play audio'));

      // play() runs after the load effect's seek decision, so
      // once it fired no seek can still be pending.
      await waitFor(() => {
        expect(FakeHowl.instances[0]?.play).toHaveBeenCalled();
      });
      expect(FakeHowl.instances[0].seek).not.toHaveBeenCalled();
    });

  it('does not seek for ENGKJV audio (no timestamps)', async () => {
    renderWithProviders(<Audio />, {
      storeOverrides: {
        activeBookId: 'GEN',
        activeChapter: 1,
        activeAudioFilesetId: 'ENGKJV',
        verseSelection: {
          scope: 'bible',
          refs: [{ bookId: 'GEN', chapter: 1, verse: 5 }],
        },
      },
    });

    fireEvent.click(screen.getByTitle('Play audio'));

    await waitFor(() => {
      expect(FakeHowl.instances[0]?.play).toHaveBeenCalled();
    });
    expect(FakeHowl.instances[0].seek).not.toHaveBeenCalled();
  });

  it('does not seek for note-scoped verse selections',
    async () => {
      vi.mocked(getAudioTimestamps).mockResolvedValue([
        { verse_start: 5, timestamp: 30 },
      ]);
      renderWithProviders(<Audio />, {
        storeOverrides: {
          activeBookId: 'GEN',
          activeChapter: 1,
          activeAudioFilesetId: 'ENGESV_API',
          verseSelection: {
            scope: 'note:1',
            refs: [{ bookId: 'GEN', chapter: 1, verse: 5 }],
          },
        },
      });

      fireEvent.click(screen.getByTitle('Play audio'));

      await waitFor(() => {
        expect(FakeHowl.instances[0]?.play).toHaveBeenCalled();
      });
      expect(FakeHowl.instances[0].seek).not.toHaveBeenCalled();
    });

  it('should update Media Session metadata when playback ' +
    'starts', async () => {
      // happy-dom has no mediaSession — stub the navigator
      // surface and the MediaMetadata constructor.
      const mediaSession = {
        metadata: null as Record<string, unknown> | null,
        setActionHandler: vi.fn(),
        setPositionState: vi.fn(),
      };
      vi.stubGlobal(
        'MediaMetadata',
        class {
          constructor(init: Record<string, unknown>) {
            Object.assign(this, init);
          }
        }
      );
      Object.defineProperty(navigator, 'mediaSession', {
        value: mediaSession,
        configurable: true,
      });

      renderWithProviders(<Audio />, {
        storeOverrides: {
          activeBookId: 'GEN',
          activeChapter: 1,
          activeAudioFilesetId: 'ENGKJV',
          showAudioPlayer: false,
        },
      });

      fireEvent.click(screen.getByTitle('Play audio'));

      await waitFor(() => {
        expect(mediaSession.metadata).toMatchObject({
          title: 'Genesis 1',
          album: 'Bible Audio',
        });
      });
    });
});
