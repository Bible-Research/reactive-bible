import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import type { Howl } from 'howler';
import { FakeHowl } from '../__tests__/mocks/FakeHowl';
import { attachVerseBounds } from './verseBounds';
import type { VerseTimestamp } from '../types';

const ts = (
  verseStart: number,
  timestamp: number,
): VerseTimestamp => ({ verse_start: verseStart, timestamp });

// Five 5-second verses; the chapter file ends at t=25.
const timestamps = [
  ts(1, 0),
  ts(2, 5),
  ts(3, 10),
  ts(4, 15),
  ts(5, 20),
];

// FakeHowl is born 'loading' — load() flips it to 'loaded'
// and emits 'load'. getPlayPosition only reports a position
// once loaded.
const loadedHowl = (): FakeHowl => {
  const howl = new FakeHowl({
    src: ['http://x/a.mp3'],
    html5: true,
  });
  howl.load();
  return howl;
};

const node = (howl: FakeHowl): HTMLAudioElement => {
  const n = howl._sounds?.[0]?._node;
  if (!n) throw new Error('FakeHowl has no <audio> node');
  return n;
};

const attach = (
  howl: FakeHowl,
  opts: Partial<Parameters<typeof attachVerseBounds>[1]> = {},
): { onAdvance: ReturnType<typeof vi.fn> } => {
  const onAdvance = vi.fn();
  attachVerseBounds(howl as unknown as Howl, {
    endTs: 25,
    verseNumbers: undefined,
    timestamps,
    loopStartTs: 0,
    onAdvance,
    isStopped: () => false,
    ...opts,
  });
  return { onAdvance };
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeHowl.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('attachVerseBounds', () => {
  it('advances once the position crosses endTs - EPSILON',
    () => {
      const howl = loadedHowl();
      const { onAdvance } = attach(howl);
      // EPSILON is 0.2 → the bound trips at 24.8.
      howl.seek(24.79);
      vi.advanceTimersByTime(300);
      expect(onAdvance).not.toHaveBeenCalled();
      howl.seek(24.81);
      vi.advanceTimersByTime(100);
      expect(onAdvance).toHaveBeenCalledTimes(1);
      // The poll stopped after the advance — no repeat calls.
      vi.advanceTimersByTime(500);
      expect(onAdvance).toHaveBeenCalledTimes(1);
    },
  );

  it('advances via the <audio> node timeupdate event',
    () => {
      const howl = loadedHowl();
      const { onAdvance } = attach(howl);
      howl.seek(24.9);
      // Synchronous dispatch — this assertion cannot have come
      // from the 100 ms poll.
      node(howl).dispatchEvent(new Event('timeupdate'));
      expect(onAdvance).toHaveBeenCalledTimes(1);
    },
  );

  it('attaches the node listener once across play/load',
    () => {
      const howl = loadedHowl();
      const { onAdvance } = attach(howl);
      // Re-fire the events that (re)attach the listener — the
      // guard must keep it a single subscription.
      howl.emit('play', 0);
      howl.emit('load', 0);
      howl.seek(24.9);
      node(howl).dispatchEvent(new Event('timeupdate'));
      expect(onAdvance).toHaveBeenCalledTimes(1);
    },
  );

  it('attaches via the load event when the node is not ready ' +
    'at attach time', () => {
      // Production: _sounds[0]._node is null until the Howl
      // loads — the 'load' wiring is the real attach path, not
      // the eager call. Withhold the node through attach, then
      // restore it before 'load' fires.
      const howl = new FakeHowl({
        src: ['http://x/a.mp3'],
        html5: true,
      });
      const sounds = howl._sounds;
      howl._sounds = [];
      const { onAdvance } = attach(howl);
      howl._sounds = sounds;
      howl.emit('load');
      howl.seek(24.9);
      node(howl).dispatchEvent(new Event('timeupdate'));
      expect(onAdvance).toHaveBeenCalledTimes(1);
    },
  );

  it('attaches via the play event when the node arrives after ' +
    'load', () => {
      const howl = new FakeHowl({
        src: ['http://x/a.mp3'],
        html5: true,
      });
      const sounds = howl._sounds;
      // A sound entry whose node is still null: 'load' fires
      // while getHtml5AudioNode finds nothing; 'play' (e.g. a
      // pooled-node swap) must re-attach.
      howl._sounds = [{ _node: null }];
      const { onAdvance } = attach(howl);
      howl.emit('load');
      howl._sounds = sounds;
      howl.emit('play', 0);
      howl.seek(24.9);
      node(howl).dispatchEvent(new Event('timeupdate'));
      expect(onAdvance).toHaveBeenCalledTimes(1);
    },
  );

  it('seeks past a non-included verse to the next included ' +
    'one', () => {
      const howl = loadedHowl();
      const { onAdvance } = attach(howl, {
        verseNumbers: [1, 3, 5],
      });
      // t=6 sits inside verse 2's window [5,10) — not included.
      howl.seek(6);
      vi.advanceTimersByTime(100);
      // Skipped forward to verse 3's timestamp.
      expect(howl._pos).toBe(10);
      expect(onAdvance).not.toHaveBeenCalled();
    },
  );

  it('advances when no included verse remains', () => {
    const howl = loadedHowl();
    const { onAdvance } = attach(howl, {
      verseNumbers: [1, 3],
    });
    // t=16 sits inside verse 4 — no later included verse.
    howl.seek(16);
    vi.advanceTimersByTime(100);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the Howl is still loading', () => {
    // load() is never called — the Howl stays 'loading'.
    const howl = new FakeHowl({
      src: ['http://x/a.mp3'],
      html5: true,
    });
    const { onAdvance } = attach(howl);
    vi.advanceTimersByTime(500);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('stops checking after stop — the disposeHowl teardown ' +
    'path', () => {
      const howl = loadedHowl();
      const { onAdvance } = attach(howl);
      // disposeHowl emits 'stop' before off()/unload() so this
      // cleanup fires — after it, neither the poll nor the node
      // listener may advance.
      howl.emit('stop', 0);
      howl.seek(24.9);
      vi.advanceTimersByTime(500);
      node(howl).dispatchEvent(new Event('timeupdate'));
      expect(onAdvance).not.toHaveBeenCalled();
    },
  );

  it('seeks back to loopStartTs instead of advancing when ' +
    'the Howl loops', () => {
      const howl = loadedHowl();
      const { onAdvance } = attach(howl, { loopStartTs: 3 });
      howl.loop(true);
      howl.seek(24.9);
      vi.advanceTimersByTime(100);
      // A looping item replays its verses — no advance.
      expect(onAdvance).not.toHaveBeenCalled();
      expect(howl._pos).toBe(3);
    },
  );

  it('stops checking after end as well', () => {
    const howl = loadedHowl();
    const { onAdvance } = attach(howl);
    howl.emit('end', 0);
    howl.seek(24.9);
    vi.advanceTimersByTime(500);
    node(howl).dispatchEvent(new Event('timeupdate'));
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('honors isStopped — the poll self-clears', () => {
    const howl = loadedHowl();
    let stopped = false;
    const { onAdvance } = attach(howl, {
      isStopped: () => stopped,
    });
    stopped = true;
    howl.seek(24.9);
    vi.advanceTimersByTime(500);
    expect(onAdvance).not.toHaveBeenCalled();
  });
});
