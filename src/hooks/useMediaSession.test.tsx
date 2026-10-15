import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useMediaSession,
  type MediaSessionMetadata,
  type MediaSessionPosition,
  type UseMediaSessionParams,
} from './useMediaSession';
import {
  stubMediaSession,
  type MediaSessionStub,
} from '../__tests__/mocks/mediaSession';

const ALL_ACTIONS: MediaSessionAction[] = [
  'play',
  'pause',
  'stop',
  'previoustrack',
  'nexttrack',
  'seekbackward',
  'seekforward',
  'seekto',
];

const makeControls = () => ({
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  nextTrack: vi.fn(),
  previousTrack: vi.fn(),
  seekTo: vi.fn(),
  seekBy: vi.fn(),
});

class FakeMediaMetadata {
  title: string;
  artist: string;
  album: string;
  constructor(init: MediaMetadataInit) {
    this.title = init.title ?? '';
    this.artist = init.artist ?? '';
    this.album = init.album ?? '';
  }
}

const METADATA: MediaSessionMetadata = {
  title: 'John 3',
  artist: 'English Test Version',
  album: 'Bible Audio',
};

let session: MediaSessionStub;

const setup = (
  overrides: Partial<UseMediaSessionParams> = {},
) =>
  renderHook(
    (props: UseMediaSessionParams) => useMediaSession(props),
    {
      initialProps: {
        active: true,
        isPlaying: true,
        metadata: null,
        controls: makeControls(),
        ...overrides,
      },
    },
  );

const dispatch = (
  action: MediaSessionAction,
  details: Partial<MediaSessionActionDetails> = {},
) => {
  session.handlers.get(action)?.({ action, ...details });
};

describe('useMediaSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session = stubMediaSession();
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata);
  });

  afterEach(() => {
    session.restore();
    vi.unstubAllGlobals();
  });

  it('registers every action handler while active', () => {
    setup();
    for (const action of ALL_ACTIONS) {
      expect(session.handlers.has(action)).toBe(true);
    }
  });

  it('registers nothing while inactive', () => {
    setup({ active: false });
    expect(session.handlers.size).toBe(0);
  });

  it('clears all handlers when the session goes inactive', () => {
    const { rerender } = setup();
    expect(session.handlers.size).toBe(ALL_ACTIONS.length);

    rerender({
      active: false,
      isPlaying: false,
      metadata: null,
      controls: makeControls(),
    });
    expect(session.handlers.size).toBe(0);
  });

  it('dispatches play/pause/stop to controls', () => {
    const controls = makeControls();
    setup({ controls });
    dispatch('play');
    dispatch('pause');
    dispatch('stop');
    expect(controls.play).toHaveBeenCalledTimes(1);
    expect(controls.pause).toHaveBeenCalledTimes(1);
    expect(controls.stop).toHaveBeenCalledTimes(1);
  });

  it('falls back to pause when controls lack stop', () => {
    const { play, pause, seekBy, seekTo } = makeControls();
    setup({ controls: { play, pause, seekBy, seekTo } });
    dispatch('stop');
    expect(pause).toHaveBeenCalledTimes(1);
    expect(seekBy).not.toHaveBeenCalled();
  });

  it('falls back to seekBy(±10) without track controls', () => {
    const { play, pause, seekBy, seekTo } = makeControls();
    setup({ controls: { play, pause, seekBy, seekTo } });
    dispatch('nexttrack');
    dispatch('previoustrack');
    expect(seekBy).toHaveBeenCalledWith(10);
    expect(seekBy).toHaveBeenCalledWith(-10);
  });

  it('dispatches real track controls when provided', () => {
    const controls = makeControls();
    setup({ controls });
    dispatch('nexttrack');
    dispatch('previoustrack');
    expect(controls.nextTrack).toHaveBeenCalledTimes(1);
    expect(controls.previousTrack).toHaveBeenCalledTimes(1);
    expect(controls.seekBy).not.toHaveBeenCalled();
  });

  it('seeks backward/forward by details.seekOffset', () => {
    const controls = makeControls();
    setup({ controls });
    dispatch('seekbackward', { seekOffset: 15 });
    dispatch('seekforward', { seekOffset: 30 });
    dispatch('seekbackward');
    expect(controls.seekBy).toHaveBeenCalledWith(-15);
    expect(controls.seekBy).toHaveBeenCalledWith(30);
    // Missing offset defaults to 10.
    expect(controls.seekBy).toHaveBeenCalledWith(-10);
  });

  it('seekto only fires with a numeric seekTime', () => {
    const controls = makeControls();
    setup({ controls });
    dispatch('seekto', { seekTime: 42 });
    dispatch('seekto', { fastSeek: true });
    // Some platforms report a null seekTime — must be ignored.
    dispatch('seekto', {
      seekTime: null as unknown as number,
    });
    expect(controls.seekTo).toHaveBeenCalledTimes(1);
    expect(controls.seekTo).toHaveBeenCalledWith(42);
  });

  it('never throws — handler errors are caught and logged', () => {
    const warn = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const controls = makeControls();
    controls.play.mockImplementation(() => {
      throw new Error('boom');
    });
    setup({ controls });
    expect(() => dispatch('play')).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      'MediaSession handler error:',
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it('uses the latest controls after a rerender', () => {
    const first = makeControls();
    const second = makeControls();
    const { rerender } = setup({ controls: first });
    rerender({
      active: true,
      isPlaying: true,
      metadata: null,
      controls: second,
    });
    dispatch('play');
    expect(first.play).not.toHaveBeenCalled();
    expect(second.play).toHaveBeenCalledTimes(1);
  });

  it('sets metadata while active and clears it when inactive',
    () => {
      const { rerender } = setup({ metadata: METADATA });
      expect(navigator.mediaSession.metadata?.title).toBe(
        'John 3',
      );
      expect(navigator.mediaSession.metadata?.artist).toBe(
        'English Test Version',
      );

      rerender({
        active: false,
        isPlaying: false,
        metadata: null,
        controls: makeControls(),
      });
      expect(navigator.mediaSession.metadata).toBeNull();
    },
  );

  it('tracks playbackState from active/isPlaying', () => {
    const { rerender } = setup();
    expect(navigator.mediaSession.playbackState).toBe('playing');

    rerender({
      active: true,
      isPlaying: false,
      metadata: null,
      controls: makeControls(),
    });
    expect(navigator.mediaSession.playbackState).toBe('paused');

    rerender({
      active: false,
      isPlaying: false,
      metadata: null,
      controls: makeControls(),
    });
    expect(navigator.mediaSession.playbackState).toBe('none');
  });

  describe('setPositionState validation', () => {
    const valid: MediaSessionPosition = {
      duration: 60,
      position: 12,
      playbackRate: 1,
    };

    it('pushes a valid position on registration', () => {
      setup({ getPosition: () => valid });
      expect(session.positionStates).toContainEqual({
        duration: 60,
        playbackRate: 1,
        position: 12,
      });
    });

    it('refuses invalid positions', () => {
      const cases: (MediaSessionPosition | null)[] = [
        null,
        { duration: 0, position: 0 },
        { duration: 60, position: -1 },
        { duration: 60, position: 61 },
        { duration: 60, position: Number.NaN },
      ];
      for (const pos of cases) {
        session.positionStates.length = 0;
        const { unmount } = setup({ getPosition: () => pos });
        expect(session.positionStates).toEqual([]);
        unmount();
      }
    });

    it('pushes position after seek dispatches', () => {
      const controls = makeControls();
      setup({ controls, getPosition: () => valid });
      session.positionStates.length = 0;
      dispatch('seekforward', { seekOffset: 10 });
      expect(session.positionStates.length).toBeGreaterThan(0);
    });
  });
});
