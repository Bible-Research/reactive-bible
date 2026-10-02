import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { resolveTimestampsFilesetId } from '../utils/bibleUtils';
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

let mockHowlOnLoad: (() => void) | null = null;
let mockHowlOnEnd: (() => void) | null = null;
let mockHowlOnLoadError:
  | ((_id: number, err: unknown) => void)
  | null = null;
let mockHowlSeekValue = 0;
let mockHowlUnload = vi.fn();
let mockHowlPause = vi.fn();
let mockHowlPlay = vi.fn();
let mockHowlStop = vi.fn();
let mockHowlOn = vi.fn();

vi.mock('howler', () => ({
  Howl: vi.fn().mockImplementation(function (opts: Record<string, unknown>) {
    mockHowlOnLoad = opts.onload as () => void;
    mockHowlOnEnd = opts.onend as () => void;
    mockHowlOnLoadError = opts.onloaderror as (
      _id: number,
      err: unknown,
    ) => void;
    mockHowlSeekValue = 0;
    mockHowlUnload = vi.fn();
    mockHowlPause = vi.fn();
    mockHowlPlay = vi.fn();
    mockHowlStop = vi.fn();
    mockHowlOn = vi.fn();
    return {
      seek: vi.fn((v?: number) => {
        if (v !== undefined) mockHowlSeekValue = v;
        return mockHowlSeekValue;
      }),
      play: mockHowlPlay,
      pause: mockHowlPause,
      stop: mockHowlStop,
      unload: mockHowlUnload,
      loop: vi.fn(),
      duration: vi.fn().mockReturnValue(60),
      on: mockHowlOn,
    };
  }),
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
  useBibleStore: vi.fn((selector: (s: typeof mockStoreState) => unknown) =>
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

beforeEach(() => {
  vi.clearAllMocks();
  mockHowlOnLoad = null;
  mockHowlOnEnd = null;
  mockHowlOnLoadError = null;
  mockHowlSeekValue = 0;
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

  it('advances on onend', async () => {
    const { result } = renderHook(() => useAudioPlaylist());
    const items = [
      makeItem({ itemId: 'a' }),
      makeItem({ itemId: 'b' }),
    ];
    act(() => { result.current.start(items); });
    await waitFor(() =>
      expect(result.current.currentIndex).toBe(0)
    );
    // Simulate onload to start playing
    act(() => { mockHowlOnLoad?.(); });
    // Simulate onend to advance
    act(() => { mockHowlOnEnd?.(); });
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
    act(() => { result.current.stop(); });
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
    act(() => { mockHowlOnLoadError?.(0, 'network error'); });
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

  it('notifies once after exhausting all candidates', async () => {
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
      result.current.start([makeItem(), makeItem()]);
    });
    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Audio not available',
        }),
      )
    );
  });
});
