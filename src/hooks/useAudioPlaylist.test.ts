import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { resolveTimestampsFilesetId } from '../utils/bibleUtils';
import type { PlaylistItem } from '../types';

// ---------------------------------------------------------------------------
// 1. resolveTimestampsFilesetId unit tests
// ---------------------------------------------------------------------------

describe('resolveTimestampsFilesetId', () => {
  it('returns ENGESVO1DA for ENGESV_API + OT book', () => {
    expect(
      resolveTimestampsFilesetId('SOMEAUDIO', 'ENGESV_API', 'Genesis'),
    ).toBe('ENGESVO1DA');
  });

  it('returns ENGESVN1DA for ENGESV_API + NT book', () => {
    expect(
      resolveTimestampsFilesetId('SOMEAUDIO', 'ENGESV_API', 'John'),
    ).toBe('ENGESVN1DA');
  });

  it('strips codec suffix for any other text fileset', () => {
    expect(
      resolveTimestampsFilesetId(
        'ENGESHN1DA-opus16',
        'ENGESH',
        'John',
      ),
    ).toBe('ENGESHN1DA');
  });

  it('returns null when audio fileset is null and text is not ENGESV_API',
    () => {
      expect(
        resolveTimestampsFilesetId(null, 'ENGESH', 'John'),
      ).toBeNull();
    },
  );

  it('returns base audio id when codec suffix is absent', () => {
    expect(
      resolveTimestampsFilesetId('ENGESHN1DA', 'ENGESH', 'Genesis'),
    ).toBe('ENGESHN1DA');
  });
});

// ---------------------------------------------------------------------------
// 2. useAudioPlaylist hook tests
// ---------------------------------------------------------------------------

vi.mock('../api', () => ({
  getBibleAudioUrl: vi.fn().mockResolvedValue('http://audio.test/file.mp3'),
  getKjvAudioUrl: vi.fn().mockReturnValue('http://kjv.test/file.mp3'),
  getAudioTimestamps: vi.fn().mockResolvedValue([
    { verse_start: 1, timestamp: 0 },
    { verse_start: 2, timestamp: 5 },
    { verse_start: 3, timestamp: 10 },
    { verse_start: 4, timestamp: 15 },
  ]),
}));

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
  Howl: vi.fn().mockImplementation((opts: Record<string, unknown>) => {
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

const mockStoreState = {
  activeAudioFilesetId: 'ENGESHN1DA-opus16',
  activeTextFilesetId: 'ENGESH',
  translations: [],
  setAudioActiveVerse: vi.fn(),
  setShowAudioPlayer: vi.fn(),
};

vi.mock('../store', () => ({
  useBibleStore: vi.fn((selector: (s: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
  ),
}));

import { useAudioPlaylist } from './useAudioPlaylist';
import * as api from '../api';

const makeItem = (
  overrides: Partial<PlaylistItem> = {},
): PlaylistItem => ({
  itemId: 'note-1',
  book: 'John',
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
        result.current.start([makeItem({ book: 'John' })]);
      });
      await waitFor(() =>
        expect(api.getAudioTimestamps).toHaveBeenCalledWith(
          'John',
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
        result.current.start([makeItem({ book: 'Genesis', chapter: 1 })]);
      });
      await waitFor(() =>
        expect(api.getAudioTimestamps).toHaveBeenCalledWith(
          'Genesis',
          expect.any(Number),
          'ENGESVO1DA',
        )
      );
    },
  );

  it('works with arbitrary PlaylistItem shapes (source-agnostic)', async () => {
    const { result } = renderHook(() => useAudioPlaylist());
    const items: PlaylistItem[] = [
      {
        itemId: 'result-0',
        book: 'Romans',
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
});
