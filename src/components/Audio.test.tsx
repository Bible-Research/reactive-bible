import {
  act,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import Audio from './Audio';
import { renderWithProviders } from '../__tests__/helpers';
import { useBibleStore } from '../store';
import {
  getBibleAudioUrl,
  getAudioTimestamps,
} from '../api';
import { FakeHowl } from '../__tests__/mocks/FakeHowl';
import {
  stubMediaSession,
  type MediaSessionStub,
} from '../__tests__/mocks/mediaSession';
import type { BibleState, Translation } from '../store';

vi.mock('howler', async () => ({
  Howl: (await import('../__tests__/mocks/FakeHowl')).FakeHowl,
}));

// Mock API — importOriginal keeps BookNotInFilesetError's real
// class so prod instanceof checks behave like production.
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>(
    '../api',
  );
  return {
    ...actual,
    getKjvAudioUrl:
      vi.fn().mockReturnValue('http://audio.url/test.mp3'),
    getBibleAudioUrl: vi.fn()
      .mockResolvedValue('http://audio.url/test.mp3'),
    // Real signature returns an array of {book_name, book_id,
    // chapter} entries — previously mocked as a single object.
    getChapterList: vi.fn().mockReturnValue([
      { book_name: 'Genesis', book_id: 'GEN', chapter: 1 },
    ]),
    getAudioTimestamps: vi.fn().mockResolvedValue([]),
    // No adjacent chapters: no next-chapter preload, so each test
    // sees exactly the Howls it causes.
    getAdjacentChapters: vi.fn().mockReturnValue({
      previous: null,
      next: null,
    }),
  };
});

// Split-testament audio translation for the fallback test:
// {OT: ENGESHO1DA, NT: ENGESHN1DA} in both codecs.
const eshTranslation: Translation = {
  abbr: 'ENGESH',
  name: 'English Test Version',
  language: 'English',
  language_iso: 'eng',
  filesets: [
    { id: 'ENGESHO1DA', type: 'audio', size: 'OT',
      codec: 'mp3', bitrate: '64' },
    { id: 'ENGESHO1DA-opus16', type: 'audio', size: 'OT',
      codec: 'opus', bitrate: '16' },
    { id: 'ENGESHN1DA', type: 'audio', size: 'NT',
      codec: 'mp3', bitrate: '64' },
    { id: 'ENGESHN1DA-opus16', type: 'audio', size: 'NT',
      codec: 'opus', bitrate: '16' },
  ],
};

// happy-dom has no MediaMetadata — a minimal class carrying the
// init fields so assertions can read them back.
class FakeMediaMetadata {
  title: string;
  artist: string;
  album: string;
  artwork?: MediaImage[];
  constructor(init: MediaMetadataInit) {
    this.title = init.title ?? '';
    this.artist = init.artist ?? '';
    this.album = init.album ?? '';
    this.artwork = init.artwork;
  }
}

let session: MediaSessionStub;

const renderAudio = (
  storeOverrides: Partial<BibleState> = {},
) =>
  renderWithProviders(<Audio />, {
    storeOverrides: {
      activeBookId: 'GEN',
      activeChapter: 1,
      activeAudioFilesetId: 'ENGKJV',
      showAudioPlayer: false,
      ...storeOverrides,
    },
  });

describe('Audio Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeHowl.reset();
    session = stubMediaSession();
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata);
    // vi.clearAllMocks keeps mockImplementation — restore the
    // default so per-test overrides cannot leak.
    vi.mocked(getAudioTimestamps).mockResolvedValue([]);
  });

  afterEach(() => {
    session.restore();
    vi.unstubAllGlobals();
  });

  it('should render the play button', () => {
    renderAudio();
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('clears the audio-active verse when the player closes',
    async () => {
      renderAudio();

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

  it('updates Media Session metadata when audio starts',
    async () => {
      renderAudio({ activeBookId: 'JHN', activeChapter: 3 });

      fireEvent.click(screen.getByTitle('Play audio'));
      await waitFor(() =>
        expect(FakeHowl.instances.length).toBe(1),
      );

      await waitFor(() => {
        expect(navigator.mediaSession.metadata?.title).toBe(
          'John 3',
        );
      });
      expect(navigator.mediaSession.metadata?.artist).toBe(
        'Bible Audio',
      );
      expect(navigator.mediaSession.playbackState).toBe(
        'playing',
      );
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
      const seekSpy = vi.spyOn(FakeHowl.prototype, 'seek');
      renderAudio({
        activeAudioFilesetId: 'ENGESV_API',
        verseSelection: {
          scope: 'bible',
          refs: [
            { bookId: 'GEN', chapter: 1, verse: 9 },
            { bookId: 'GEN', chapter: 1, verse: 5 },
          ],
        },
      });

      fireEvent.click(screen.getByTitle('Play audio'));
      await waitFor(() =>
        expect(FakeHowl.instances.length).toBe(1),
      );
      act(() => {
        FakeHowl.instances[0].emit('load');
      });

      await waitFor(() => {
        expect(seekSpy).toHaveBeenCalledWith(36);
      });
    });

  it('does not seek when the selection is in another ' +
    'chapter', async () => {
      vi.mocked(getAudioTimestamps).mockResolvedValue([
        { verse_start: 2, timestamp: 10 },
      ]);
      const seekSpy = vi.spyOn(FakeHowl.prototype, 'seek');
      renderAudio({
        activeAudioFilesetId: 'ENGESV_API',
        verseSelection: {
          scope: 'bible',
          refs: [{ bookId: 'GEN', chapter: 2, verse: 2 }],
        },
      });

      fireEvent.click(screen.getByTitle('Play audio'));
      await waitFor(() =>
        expect(FakeHowl.instances.length).toBe(1),
      );
      act(() => {
        FakeHowl.instances[0].emit('load');
      });

      // play() runs after the load effect's seek decision, so
      // once it fired no seek can still be pending.
      await waitFor(() => {
        expect(FakeHowl.instances[0].playing()).toBe(true);
      });
      expect(seekSpy).not.toHaveBeenCalled();
    });

  it('does not seek for ENGKJV audio (no timestamps)', async () => {
    const seekSpy = vi.spyOn(FakeHowl.prototype, 'seek');
    renderAudio({
      verseSelection: {
        scope: 'bible',
        refs: [{ bookId: 'GEN', chapter: 1, verse: 5 }],
      },
    });

    fireEvent.click(screen.getByTitle('Play audio'));
    await waitFor(() =>
      expect(FakeHowl.instances.length).toBe(1),
    );
    act(() => {
      FakeHowl.instances[0].emit('load');
    });

    await waitFor(() => {
      expect(FakeHowl.instances[0].playing()).toBe(true);
    });
    expect(seekSpy).not.toHaveBeenCalled();
  });

  it('cancelling a stalled load keeps it from materializing a ' +
    'Howl', async () => {
      let resolveUrl!: (url: string) => void;
      vi.mocked(getBibleAudioUrl).mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveUrl = resolve;
          }),
      );
      renderAudio({
        activeBookId: 'JHN',
        activeChapter: 3,
        activeAudioFilesetId: 'ENGESHN1DA',
      });

      fireEvent.click(screen.getByTitle('Play audio'));

      // While loading the button stays enabled and cancels.
      const cancel = await screen.findByTitle('Cancel loading');
      expect(cancel).toBeEnabled();
      fireEvent.click(cancel);

      // The fetch resolving after the cancel must not create a
      // Howl or leave the spinner stuck.
      await act(async () => {
        resolveUrl('http://audio.url/test.mp3');
      });
      await waitFor(() =>
        expect(
          screen.getByTitle('Play audio'),
        ).toBeInTheDocument(),
      );
      expect(FakeHowl.instances.length).toBe(0);
    });

  it('does not seek for note-scoped verse selections',
    async () => {
      vi.mocked(getAudioTimestamps).mockResolvedValue([
        { verse_start: 5, timestamp: 30 },
      ]);
      const seekSpy = vi.spyOn(FakeHowl.prototype, 'seek');
      renderAudio({
        activeAudioFilesetId: 'ENGESV_API',
        verseSelection: {
          scope: 'note:1',
          refs: [{ bookId: 'GEN', chapter: 1, verse: 5 }],
        },
      });

      fireEvent.click(screen.getByTitle('Play audio'));
      await waitFor(() =>
        expect(FakeHowl.instances.length).toBe(1),
      );
      act(() => {
        FakeHowl.instances[0].emit('load');
      });

      await waitFor(() => {
        expect(FakeHowl.instances[0].playing()).toBe(true);
      });
      expect(seekSpy).not.toHaveBeenCalled();
    });

  it('ignores a fallback fetch that resolves after close',
    async () => {
      // opus16 candidate loads instantly; its decode failure
      // sends the mp3 sibling's fetch to a deferred promise so the
      // fallback stays in flight when the player is closed.
      let resolveFallback: ((url: string) => void) | null = null;
      vi.mocked(getBibleAudioUrl).mockImplementation(
        (_book, _chapter, filesetId) =>
          filesetId === 'ENGESHN1DA'
            ? new Promise<string>((r) => { resolveFallback = r; })
            : Promise.resolve('http://audio.url/opus16.webm'),
      );
      renderAudio({
        activeBookId: 'JHN',
        activeChapter: 3,
        activeAudioFilesetId: 'ENGESHN1DA-opus16',
        activeTextFilesetId: 'ENGESH',
        translations: [eshTranslation],
      });

      fireEvent.click(screen.getByTitle('Play audio'));
      await waitFor(() =>
        expect(FakeHowl.instances.length).toBe(1),
      );

      act(() => {
        FakeHowl.instances[0].emit(
          'loaderror',
          0,
          new Error('codec decode failed'),
        );
      });
      await waitFor(() =>
        expect(resolveFallback).not.toBeNull(),
      );

      const closeButton = await screen.findByTitle('Close player');
      fireEvent.click(closeButton);

      // The pending fallback resolves after the player closed —
      // it must not materialize a Howl or resurrect the player.
      await act(async () => {
        resolveFallback?.('http://audio.url/mp3.mp3');
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(FakeHowl.instances.length).toBe(1);
      expect(FakeHowl.instances[0].state()).toBe('unloaded');
      expect(screen.queryByTitle('Close player')).toBeNull();
      // Closing also tears the media session down — no stray
      // lock-screen handlers survive, and the late fallback must
      // not re-register any.
      expect(session.handlers.size).toBe(0);
    });
});
