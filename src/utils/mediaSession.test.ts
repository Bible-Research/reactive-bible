import { describe, it, expect, vi } from 'vitest';
import {
  dispatchMediaAction,
  isValidPosition,
  type MediaSessionControls,
} from './mediaSession';

const makeControls = (
  overrides: Partial<MediaSessionControls> = {},
): MediaSessionControls => ({
  play: vi.fn(),
  pause: vi.fn(),
  ...overrides,
});

describe('isValidPosition', () => {
  it('rejects null and undefined', () => {
    expect(isValidPosition(null)).toBe(false);
    expect(isValidPosition(undefined)).toBe(false);
  });

  it('rejects a non-positive duration', () => {
    expect(
      isValidPosition({ duration: 0, position: 0 }),
    ).toBe(false);
    expect(
      isValidPosition({ duration: -5, position: 0 }),
    ).toBe(false);
  });

  it('rejects NaN, negative and past-end positions', () => {
    expect(
      isValidPosition({ duration: 60, position: NaN }),
    ).toBe(false);
    expect(
      isValidPosition({ duration: 60, position: -1 }),
    ).toBe(false);
    expect(
      isValidPosition({ duration: 60, position: 61 }),
    ).toBe(false);
  });

  it('accepts a position inside [0, duration]', () => {
    expect(
      isValidPosition({ duration: 60, position: 0 }),
    ).toBe(true);
    expect(
      isValidPosition({ duration: 60, position: 60 }),
    ).toBe(true);
  });
});

describe('dispatchMediaAction', () => {
  it('routes play, pause and stop to their controls', () => {
    const controls = makeControls({ stop: vi.fn() });
    const updatePosition = vi.fn();
    dispatchMediaAction('play', {}, controls, updatePosition);
    dispatchMediaAction('pause', {}, controls, updatePosition);
    dispatchMediaAction('stop', {}, controls, updatePosition);
    expect(controls.play).toHaveBeenCalledOnce();
    expect(controls.pause).toHaveBeenCalledOnce();
    expect(controls.stop).toHaveBeenCalledOnce();
    expect(updatePosition).not.toHaveBeenCalled();
  });

  it('falls back to pause when stop is not provided', () => {
    const controls = makeControls();
    dispatchMediaAction('stop', {}, controls, vi.fn());
    expect(controls.pause).toHaveBeenCalledOnce();
  });

  it('uses real track navigation when provided', () => {
    const controls = makeControls({
      nextTrack: vi.fn(),
      previousTrack: vi.fn(),
      seekBy: vi.fn(),
    });
    const updatePosition = vi.fn();
    dispatchMediaAction(
      'nexttrack', {}, controls, updatePosition,
    );
    dispatchMediaAction(
      'previoustrack', {}, controls, updatePosition,
    );
    expect(controls.nextTrack).toHaveBeenCalledOnce();
    expect(controls.previousTrack).toHaveBeenCalledOnce();
    expect(controls.seekBy).not.toHaveBeenCalled();
    expect(updatePosition).not.toHaveBeenCalled();
  });

  it('falls back to a 10s seek when track navigation is ' +
    'absent', () => {
      const controls = makeControls({ seekBy: vi.fn() });
      const updatePosition = vi.fn();
      dispatchMediaAction(
        'nexttrack', {}, controls, updatePosition,
      );
      dispatchMediaAction(
        'previoustrack', {}, controls, updatePosition,
      );
      expect(controls.seekBy).toHaveBeenNthCalledWith(1, 10);
      expect(controls.seekBy).toHaveBeenNthCalledWith(2, -10);
      expect(updatePosition).toHaveBeenCalledTimes(2);
    },
  );

  it('seeks by the given offset, defaulting to 10s', () => {
    const controls = makeControls({ seekBy: vi.fn() });
    const updatePosition = vi.fn();
    dispatchMediaAction(
      'seekforward', { seekOffset: 30 }, controls, updatePosition,
    );
    dispatchMediaAction(
      'seekbackward', {}, controls, updatePosition,
    );
    expect(controls.seekBy).toHaveBeenNthCalledWith(1, 30);
    expect(controls.seekBy).toHaveBeenNthCalledWith(2, -10);
    expect(updatePosition).toHaveBeenCalledTimes(2);
  });

  it('seekto requires a seekTime and pushes position state',
    () => {
      const controls = makeControls({ seekTo: vi.fn() });
      const updatePosition = vi.fn();
      dispatchMediaAction(
        'seekto', { seekTime: 12.5 }, controls, updatePosition,
      );
      dispatchMediaAction(
        'seekto', { seekTime: null }, controls, updatePosition,
      );
      dispatchMediaAction(
        'seekto', {}, controls, updatePosition,
      );
      expect(controls.seekTo).toHaveBeenCalledOnce();
      expect(controls.seekTo).toHaveBeenCalledWith(12.5);
      expect(updatePosition).toHaveBeenCalledTimes(1);
    },
  );

  it('never throws — a failing control only warns', () => {
    const warn = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const controls = makeControls({
      play: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    expect(() =>
      dispatchMediaAction('play', {}, controls, vi.fn()),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
