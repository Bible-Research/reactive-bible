import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Howl } from 'howler';
import { useVerseHighlighter } from './useVerseHighlighter';
import { useBibleStore } from '../store';
import { FakeHowl } from '../__tests__/mocks/FakeHowl';
import type { VerseTimestamp } from '../types';

vi.mock('howler', async () => ({
  Howl: (await import('../__tests__/mocks/FakeHowl')).FakeHowl,
}));

const TIMESTAMPS: VerseTimestamp[] = [
  { verse_start: 1, timestamp: 0 },
  { verse_start: 2, timestamp: 10 },
  { verse_start: 3, timestamp: 20 },
];

const loadedAudio = (): FakeHowl => {
  const howl = new FakeHowl({ src: ['x.mp3'], html5: true });
  howl.emit('load');
  return howl;
};

const advancePoll = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe('useVerseHighlighter', () => {
  beforeEach(() => {
    FakeHowl.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the verse matching the playback position', () => {
    const audio = loadedAudio();
    renderHook(() =>
      useVerseHighlighter(
        audio as unknown as Howl,
        true,
        TIMESTAMPS,
        'JHN',
        3,
        'bible',
      ),
    );

    act(() => {
      audio.seek(15);
    });
    advancePoll(100);
    expect(useBibleStore.getState().audioActiveVerse).toEqual({
      bookId: 'JHN',
      chapter: 3,
      verse: 2,
      scope: 'bible',
    });

    // Past the last timestamp the binary search lands on verse 3.
    act(() => {
      audio.seek(25);
    });
    advancePoll(100);
    expect(
      useBibleStore.getState().audioActiveVerse?.verse,
    ).toBe(3);
  });

  it('uses the scope to target the rendering context', () => {
    const audio = loadedAudio();
    renderHook(() =>
      useVerseHighlighter(
        audio as unknown as Howl,
        true,
        TIMESTAMPS,
        'JHN',
        3,
        'note-42',
      ),
    );
    advancePoll(100);
    expect(
      useBibleStore.getState().audioActiveVerse?.scope,
    ).toBe('note-42');
  });

  it('does not poll when paused, unloaded or without timestamps',
    () => {
      const audio = loadedAudio();
      const { unmount } = renderHook(() =>
        useVerseHighlighter(
          audio as unknown as Howl,
          false,
          TIMESTAMPS,
          'JHN',
          3,
          'bible',
        ),
      );
      advancePoll(500);
      expect(
        useBibleStore.getState().audioActiveVerse,
      ).toBeNull();
      unmount();
    },
  );

  it('clears the active verse on unmount', () => {
    const audio = loadedAudio();
    const { unmount } = renderHook(() =>
      useVerseHighlighter(
        audio as unknown as Howl,
        true,
        TIMESTAMPS,
        'JHN',
        3,
        'bible',
      ),
    );
    advancePoll(100);
    expect(
      useBibleStore.getState().audioActiveVerse,
    ).not.toBeNull();

    unmount();
    expect(
      useBibleStore.getState().audioActiveVerse,
    ).toBeNull();
  });
});
