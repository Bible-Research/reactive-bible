import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeHowl } from '../__tests__/mocks/FakeHowl';
import type { Howl } from 'howler';

// Captures the exact options object handed to the Howl
// constructor — the factory's contract is the produced config.
const seen = vi.hoisted(() => ({
  opts: [] as Record<string, unknown>[],
}));

vi.mock('howler', async () => {
  const { FakeHowl } = await import('../__tests__/mocks/FakeHowl');
  class SpyHowl extends FakeHowl {
    constructor(opts: Record<string, unknown> = {}) {
      super(opts);
      seen.opts.push(opts);
    }
  }
  return { Howl: SpyHowl };
});

import { createChapterHowl } from './chapterHowl';

const lastOpts = (): Record<string, unknown> =>
  seen.opts[seen.opts.length - 1];

beforeEach(() => {
  seen.opts.length = 0;
  FakeHowl.reset();
});

describe('createChapterHowl', () => {
  it('builds only the shared chapter-mode base by default',
    () => {
      createChapterHowl('http://x/chapter.mp3');
      // No format/loop/preload/handlers keys — identical to the
      // pre-refactor preload config minus its own extras.
      expect(lastOpts()).toEqual({
        src: ['http://x/chapter.mp3'],
        html5: true,
        pool: 1,
      });
    },
  );

  it('produces the preload-site config (format + preload)', () => {
    createChapterHowl('blob:abc', {
      format: ['mp3'],
      preload: true,
    });
    expect(lastOpts()).toEqual({
      src: ['blob:abc'],
      html5: true,
      pool: 1,
      format: ['mp3'],
      preload: true,
    });
  });

  it('produces the load/fallback config (loop + handlers)',
    () => {
      const onplay = vi.fn();
      const onpause = vi.fn();
      const onend = vi.fn();
      const onloaderror = vi.fn();
      const onplayerror = vi.fn();
      const howl = createChapterHowl('http://x/a.mp3', {
        loop: true,
        onplay,
        onpause,
        onend,
        onloaderror,
        onplayerror,
      });
      expect(lastOpts()).toEqual({
        src: ['http://x/a.mp3'],
        html5: true,
        pool: 1,
        loop: true,
        onplay,
        onpause,
        onend,
        onloaderror,
        onplayerror,
      });
      // The handlers actually registered — FakeHowl wires the
      // constructor on* options as event handlers.
      const fake = howl as unknown as FakeHowl;
      fake.emit('play', 0);
      fake.emit('pause', 0);
      fake.emit('end', 0);
      fake.emit('loaderror', 0, 'err');
      fake.emit('playerror', 0, 'err');
      expect(onplay).toHaveBeenCalledOnce();
      expect(onpause).toHaveBeenCalledOnce();
      expect(onend).toHaveBeenCalledOnce();
      expect(onloaderror).toHaveBeenCalledOnce();
      expect(onplayerror).toHaveBeenCalledOnce();
    },
  );

  it('returns a usable Howl instance', () => {
    const howl: Howl = createChapterHowl('http://x/b.mp3');
    expect(howl.state()).toBe('loading');
  });
});
