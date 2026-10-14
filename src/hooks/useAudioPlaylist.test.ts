import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { resolveTimestampsFilesetId } from '../utils/bibleUtils';
import { FakeHowl } from '../__tests__/mocks/FakeHowl';
import type { PlaylistItem } from '../types';
import type { Translation } from '../store';

// ---------------------------------------------------------------------------
// 1. resolveTimestampsFilesetId unit tests
// ---------------------------------------------------------------------------

describe('resolveTimestampsFilesetId', () => {
  it('returns ENGESVO1DA for ENGESV_API + OT book', () => {
    expect(
      resolveTimestampsFilesetId('SOMEAUDIO', 'ENGESV_API', 'GEN'),
    ).toBe('ENGESVO1DA');
  });

  it('returns ENGESVN1DA for ENGESV_API + NT book', () => {
    expect(
      resolveTimestampsFilesetId('SOMEAUDIO', 'ENGESV_API', 'JHN'),
    ).toBe('ENGESVN1DA');
  });

  it('strips codec suffix for any other text fileset', () => {
    expect(
      resolveTimestampsFilesetId(
        'ENGESHN1DA-opus16',
        'ENGESH',
        'JHN',
      ),
    ).toBe('ENGESHN1DA');
  });

  it('returns null when audio fileset is null and text is not ENGESV_API',
    () => {
      expect(
        resolveTimestampsFilesetId(null, 'ENGESH', 'JHN'),
      ).toBeNull();
    },
  );

  it('returns base audio id when codec suffix is absent', () => {
    expect(
      resolveTimestampsFilesetId('ENGESHN1DA', 'ENGESH', 'GEN'),
    ).toBe('ENGESHN1DA');
  });
});

// ---------------------------------------------------------------------------
// 2. useAudioPlaylist hook tests
// ---------------------------------------------------------------------------

vi.mock('../api', () => {
  class BookNotInFilesetError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'BookNotInFilesetError';
    }
  }
  return {
    getBibleAudioUrl:
      vi.fn().mockResolvedValue('http://audio.test/file.mp3'),
    getKjvAudioUrl:
      vi.fn().mockReturnValue('http://kjv.test/file.mp3'),
    getAudioTimestamps: vi.fn().mockResolvedValue([
      { verse_start: 1, timestamp: 0 },
      { verse_start: 2, timestamp: 5 },
      { verse_start: 3, timestamp: 10 },
      { verse_start: 4, timestamp: 15 },
    ]),
    BookNotInFilesetError,
  };
});

vi.mock('howler', async () => ({
  Howl: (await import('../__tests__/mocks/FakeHowl')).FakeHowl,
}));

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

vi.mock('./useVerseHighlighter', () => ({
  useVerseHighlighter: vi.fn(),
}));

// Split-testament audio translation used by the resolver tests:
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

const mockStoreState = {
  activeAudioFilesetId: 'ENGESHN1DA-opus16',
  activeTextFilesetId: 'ENGESH',
  translations: [] as Translation[],
  setAudioActiveVerse: vi.fn(),
  setShowAudioPlayer: vi.fn(),
  setAudioPlaylistEnded: vi.fn(),
};

vi.mock('../store', () => ({
  useBibleStore: vi.fn(
    (selector: (s: typeof mockStoreState) => unknown) =>
      selector(mockStoreState),
  ),
}));

import { useAudioPlaylist } from './useAudioPlaylist';
import { useVerseHighlighter } from './useVerseHighlighter';
import * as api from '../api';

const makeItem = (
  overrides: Partial<PlaylistItem> = {},
): PlaylistItem => ({
  itemId: 'note-1',
  bookId: 'JHN',
  chapter: 3,
  startVerse: 16,
  endVerse: 18,
  label: 'Note 1/3 – John 3:16-18',
  ...overrides,
});

const latestHowl = (): FakeHowl =>
  FakeHowl.instances[FakeHowl.instances.length - 1];

beforeEach(() => {
  vi.clearAllMocks();
  FakeHowl.reset();
  mockStoreState.setAudioActiveVerse.mockReset();
  mockStoreState.setShowAudioPlayer.mockReset();
  mockStoreState.activeAudioFilesetId = 'ENGESHN1DA-opus16';
  mockStoreState.activeTextFilesetId = 'ENGESH';
  mockStoreState.translations = [];
  // vi.clearAllMocks keeps mockImplementation — restore the
  // default so per-test overrides cannot leak.
  vi.mocked(api.getBibleAudioUrl)
    .mockResolvedValue('http://audio.test/file.mp3');
});

describe('useAudioPlaylist', () => {
  it('starts inactive with no items', () => {
    const { result } = renderHook(() => useAudioPlaylist());
    expect(result.current.isActive).toBe(false);
    expect(result.current.currentItem).toBeNull();
  });

  it('start() preserves item order', async () => {
    const { result } = renderHook(() => useAudioPlaylist());
    const items = [
      makeItem({ itemId: 'a', label: 'Note 1' }),
      makeItem({ itemId: 'b', label: 'Note 2' }),
      makeItem({ itemId: 'c', label: 'Note 3' }),
    ];
    act(() => { result.current.start(items); });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(0)
    );
    expect(result.current.currentItem?.itemId).toBe('a');
  });

  it('start(items, index) begins at the requested item', async () => {
    const { result } = renderHook(() => useAudioPlaylist());
    const items = [
      makeItem({ itemId: 'a', chapter: 3 }),
      makeItem({ itemId: 'b', chapter: 8 }),
    ];
    act(() => { result.current.start(items, 1); });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(1)
    );
    expect(result.current.currentItem?.itemId).toBe('b');
    // The fetched URL is for item b's chapter, not item a's.
    await waitFor(() =>
      expect(api.getBibleAudioUrl).toHaveBeenCalledWith(
        'JHN',
        8,
        expect.any(String),
      )
    );
  });

  it('next() and previous() move between items', async () => {
    const { result } = renderHook(() => useAudioPlaylist());
    const items = [
      makeItem({ itemId: 'a', chapter: 3 }),
      makeItem({ itemId: 'b', chapter: 8 }),
      makeItem({ itemId: 'c', chapter: 10 }),
    ];
    act(() => { result.current.start(items); });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(0)
    );

    act(() => { result.current.next(); });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(1)
    );
    expect(result.current.currentItem?.itemId).toBe('b');

    act(() => { result.current.next(); });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(2)
    );
    expect(result.current.currentItem?.itemId).toBe('c');

    act(() => { result.current.previous(); });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(1)
    );
    expect(result.current.currentItem?.itemId).toBe('b');
  });

  it('previous() clamps at the first item', async () => {
    const { result } = renderHook(() => useAudioPlaylist());
    act(() => {
      result.current.start([makeItem({ itemId: 'a' })]);
    });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(0)
    );
    act(() => { result.current.previous(); });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(0)
    );
    expect(result.current.currentItem?.itemId).toBe('a');
  });

  it('pause() and resume() drive the current Howl', async () => {
    const { result } = renderHook(() => useAudioPlaylist());
    act(() => { result.current.start([makeItem()]); });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(0)
    );
    const howl = latestHowl();
    act(() => { howl.emit('load'); });
    expect(howl.playing()).toBe(true);

    act(() => { result.current.pause(); });
    expect(howl.playing()).toBe(false);
    await waitFor(() =>
      expect(result.current.isPlaying).toBe(false)
    );

    act(() => { result.current.resume(); });
    expect(howl.playing()).toBe(true);
    await waitFor(() =>
      expect(result.current.isPlaying).toBe(true)
    );
  });

  it('advances on the media end event', async () => {
    const { result } = renderHook(() => useAudioPlaylist());
    const items = [
      makeItem({ itemId: 'a' }),
      makeItem({ itemId: 'b' }),
    ];
    act(() => { result.current.start(items); });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(0)
    );
    const first = latestHowl();
    act(() => { first.emit('load'); });
    act(() => { first.emit('end'); });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(1)
    );
  });

  it('stop() unloads audio and clears audioActiveVerse', async () => {
    const { result } = renderHook(() => useAudioPlaylist());
    act(() => { result.current.start([makeItem()]); });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(0)
    );
    const howl = latestHowl();
    act(() => { result.current.stop(); });
    expect(howl.state()).toBe('unloaded');
    expect(mockStoreState.setAudioActiveVerse).toHaveBeenCalledWith(
      null,
    );
    expect(result.current.isActive).toBe(false);
  });

  it('load error triggers notification and advances', async () => {
    const { showNotification } = await import('@mantine/notifications');
    const { result } = renderHook(() => useAudioPlaylist());
    const items = [makeItem({ itemId: 'a' }), makeItem({ itemId: 'b' })];
    act(() => { result.current.start(items); });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(0)
    );
    act(() => {
      latestHowl().emit('loaderror', 0, 'network error');
    });
    expect(showNotification).toHaveBeenCalled();
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(1)
    );
  });

  it('calls getAudioTimestamps with ENGESVN1DA for NT book when ENGESV_API',
    async () => {
      mockStoreState.activeTextFilesetId = 'ENGESV_API';
      const { result } = renderHook(() => useAudioPlaylist());
      act(() => {
        result.current.start([makeItem({ bookId: 'JHN' })]);
      });
      await waitFor(() =>
        expect(api.getAudioTimestamps).toHaveBeenCalledWith(
          'JHN',
          expect.any(Number),
          'ENGESVN1DA',
        )
      );
    },
  );

  it('calls getAudioTimestamps with ENGESVO1DA for OT book when ENGESV_API',
    async () => {
      mockStoreState.activeTextFilesetId = 'ENGESV_API';
      const { result } = renderHook(() => useAudioPlaylist());
      act(() => {
        result.current.start([makeItem({ bookId: 'GEN', chapter: 1 })]);
      });
      await waitFor(() =>
        expect(api.getAudioTimestamps).toHaveBeenCalledWith(
          'GEN',
          expect.any(Number),
          'ENGESVO1DA',
        )
      );
    },
  );

  it('passes the current itemId as the verse-highlight scope',
    async () => {
      const { result } = renderHook(() => useAudioPlaylist());
      act(() => {
        result.current.start([makeItem({ itemId: 'note-42' })]);
      });
      await waitFor(() =>
        expect(result.current.currentIndex).toBe(0)
      );
      expect(useVerseHighlighter).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'JHN',
        3,
        'note-42',
      );
    },
  );

  it('works with arbitrary PlaylistItem shapes', async () => {
    const { result } = renderHook(() => useAudioPlaylist());
    const items: PlaylistItem[] = [
      {
        itemId: 'result-0',
        bookId: 'ROM',
        chapter: 8,
        startVerse: 1,
        endVerse: 1,
        label: 'Result 1/5 – Romans 8:1',
      },
    ];
    act(() => { result.current.start(items); });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(0)
    );
    expect(result.current.currentItem?.itemId).toBe('result-0');
  });

  it('auto-switches to the OT member of the same audio product',
    async () => {
      mockStoreState.translations = [eshTranslation];
      mockStoreState.activeAudioFilesetId = 'ENGESHN1DA';
      const { result } = renderHook(() => useAudioPlaylist());
      act(() => {
        result.current.start([
          makeItem({ bookId: 'GEN', chapter: 1 }),
        ]);
      });
      await waitFor(() =>
        expect(api.getBibleAudioUrl).toHaveBeenCalledWith(
          'GEN',
          1,
          'ENGESHO1DA-opus16',
        )
      );
    },
  );

  it('retries the mp3 sibling after a codec fetch failure',
    async () => {
      const { BookNotInFilesetError } = await import('../api');
      mockStoreState.translations = [eshTranslation];
      mockStoreState.activeAudioFilesetId = 'ENGESHN1DA';
      vi.mocked(api.getBibleAudioUrl).mockImplementation(
        async (_book, _chapter, filesetId) =>
          filesetId.endsWith('-opus16')
            ? Promise.reject(
                new BookNotInFilesetError('not covered'),
              )
            : Promise.resolve('http://audio.test/mp3.mp3'),
      );
      const { result } = renderHook(() => useAudioPlaylist());
      act(() => {
        result.current.start([makeItem({ bookId: 'JHN' })]);
      });
      await waitFor(() =>
        expect(api.getBibleAudioUrl).toHaveBeenCalledWith(
          'JHN',
          3,
          'ENGESHN1DA',
        )
      );
      expect(result.current.currentIndex).toBe(0);
    },
  );

  it('notifies and ends the item when a detached retry rejects',
    async () => {
      const { showNotification } =
        await import('@mantine/notifications');
      mockStoreState.translations = [eshTranslation];
      mockStoreState.activeAudioFilesetId = 'ENGESHN1DA';
      // The first candidate resolves; the detached retry after a
      // Howler decode failure then hits a non-coverage error,
      // which loadFromIndex rethrows. The retry must catch it,
      // notify and advance — an unhandled rejection would stall
      // the playlist silently.
      vi.mocked(api.getBibleAudioUrl)
        .mockResolvedValueOnce('http://audio.test/opus16.webm')
        .mockRejectedValue(new Error('network boom'));
      const { result } = renderHook(() => useAudioPlaylist());
      act(() => {
        result.current.start([makeItem({ itemId: 'a' })]);
      });
      await waitFor(() =>
        expect(result.current.currentIndex).toBe(0)
      );
      act(() => {
        latestHowl().emit('loaderror', 0, 'decode error');
      });
      await waitFor(() =>
        expect(showNotification).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Audio unavailable' }),
        )
      );
      await waitFor(() =>
        expect(result.current.isActive).toBe(false)
      );
    },
  );

  it('notifies once per item after exhausting all candidates',
    async () => {
      const { BookNotInFilesetError } = await import('../api');
      const { showNotification } =
        await import('@mantine/notifications');
      mockStoreState.translations = [eshTranslation];
      mockStoreState.activeAudioFilesetId = 'ENGESHN1DA';
      vi.mocked(api.getBibleAudioUrl).mockRejectedValue(
        new BookNotInFilesetError('not covered'),
      );
      const { result } = renderHook(() => useAudioPlaylist());
      act(() => {
        result.current.start([
          makeItem({ itemId: 'a' }),
          makeItem({ itemId: 'b' }),
        ]);
      });
      await waitFor(() =>
        expect(showNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Audio not available',
          }),
        )
      );
      // One 'Audio not available' per skipped item — each
      // candidate retry must not notify again.
      await waitFor(() =>
        expect(
          vi.mocked(showNotification).mock.calls.filter(
            ([arg]) =>
              (arg as { title?: string }).title ===
              'Audio not available',
          ),
        ).toHaveLength(2)
      );
    },
  );

  it('a superseded in-flight load cannot clobber the newer item',
    async () => {
      // Item a's URL fetch hangs; next() supersedes it with item
      // b. When the stale fetch finally resolves it must not
      // materialize a Howl or steal audioRef back — without a
      // generation counter in playIndex the last-resolved run
      // wins and the orphaned Howl plays invisibly.
      let resolveA: ((url: string) => void) | null = null;
      vi.mocked(api.getBibleAudioUrl).mockImplementation(
        (_book, chapter) =>
          chapter === 3
            ? new Promise<string>((r) => { resolveA = r; })
            : Promise.resolve('http://audio.test/jhn8.mp3'),
      );
      const { result } = renderHook(() => useAudioPlaylist());
      const items = [
        makeItem({ itemId: 'a', chapter: 3 }),
        makeItem({ itemId: 'b', chapter: 8 }),
      ];
      act(() => { result.current.start(items); });

      // Item a's fetch is still in flight — supersede it.
      act(() => { result.current.next(); });
      await waitFor(() =>
        expect(FakeHowl.instances.length).toBe(1)
      );
      const itemBHowl = latestHowl();
      expect(itemBHowl.src).toEqual([
        'http://audio.test/jhn8.mp3',
      ]);

      // Item a's stale fetch resolves — its run must bail out
      // instead of overwriting the newer item's audio.
      await act(async () => {
        resolveA?.('http://audio.test/jhn3.mp3');
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(FakeHowl.instances.length).toBe(1);
      expect(result.current.currentIndex).toBe(1);
      expect(result.current.currentItem?.itemId).toBe('b');
      expect(result.current.audio).toBe(itemBHowl);
    },
  );

  it('stop() during a pending load prevents the Howl from playing',
    async () => {
      let resolveA: ((url: string) => void) | null = null;
      vi.mocked(api.getBibleAudioUrl).mockImplementation(
        () => new Promise<string>((r) => { resolveA = r; }),
      );
      const { result } = renderHook(() => useAudioPlaylist());
      act(() => { result.current.start([makeItem()]); });
      act(() => { result.current.stop(); });
      await act(async () => {
        resolveA?.('http://audio.test/late.mp3');
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(FakeHowl.instances.length).toBe(0);
      expect(result.current.isActive).toBe(false);
    },
  );

  describe('verse-bounds playback (endTs)', () => {
    // Timestamps covering verses 16-19 — a verse AFTER endVerse
    // must exist so the hook derives a non-null endTs and the
    // bounds checker (timeupdate + 100ms poll) installs.
    const BOUNDS_TIMESTAMPS = [
      { verse_start: 16, timestamp: 0 },
      { verse_start: 17, timestamp: 10 },
      { verse_start: 18, timestamp: 20 },
      { verse_start: 19, timestamp: 30 },
    ];

    beforeEach(() => {
      vi.mocked(api.getAudioTimestamps).mockResolvedValue(
        BOUNDS_TIMESTAMPS,
      );
    });

    const fireTimeUpdate = (howl: FakeHowl) => {
      const node = howl._sounds[0]?._node;
      expect(node).not.toBeNull();
      act(() => {
        node?.dispatchEvent(new Event('timeupdate'));
      });
    };

    it('advances when playback passes the end timestamp',
      async () => {
        const { result } = renderHook(() => useAudioPlaylist());
        const items = [
          makeItem({ itemId: 'a', chapter: 3 }),
          makeItem({ itemId: 'b', chapter: 8 }),
        ];
        act(() => { result.current.start(items); });
        await waitFor(() =>
          expect(result.current.currentIndex).toBe(0)
        );
        const howl = latestHowl();
        act(() => { howl.emit('load'); });

        // Still inside the verse range — no advance.
        act(() => { howl.seek(15); });
        fireTimeUpdate(howl);
        expect(result.current.currentIndex).toBe(0);

        // Past verse 19's timestamp (endTs = 30) — the checker
        // advances to the next item instead of replaying.
        act(() => { howl.seek(31); });
        fireTimeUpdate(howl);
        await waitFor(() =>
          expect(result.current.currentIndex).toBe(1)
        );
        expect(howl.state()).toBe('unloaded');
      },
    );

    it('seeks past verses excluded by verseNumbers', async () => {
      const { result } = renderHook(() => useAudioPlaylist());
      act(() => {
        result.current.start([
          makeItem({ verseNumbers: [16, 18] }),
        ]);
      });
      await waitFor(() =>
        expect(result.current.currentIndex).toBe(0)
      );
      const howl = latestHowl();
      act(() => { howl.emit('load'); });
      expect(howl._pos).toBe(0);

      // Position inside verse 17 — not in verseNumbers — the
      // checker skips ahead to verse 18's timestamp.
      act(() => { howl.seek(15); });
      fireTimeUpdate(howl);
      expect(howl._pos).toBe(20);
    });
  });
});
