import type { HowlOptions } from 'howler';

/**
 * Shared FakeHowl — a test double for `Howl` from 'howler' that
 * models real Howler semantics closely enough to replace the
 * five divergent per-suite mock classes.
 *
 * Faithful bits:
 * - Lifecycle state machine: `preload !== false` starts in
 *   `'loading'`; `load()` or `emit('load')` transitions to
 *   `'loaded'`; `unload()` emits `'stop'`, then frees `_sounds`
 *   and lands in `'unloaded'`.
 * - `play()`/`pause()` on a still-'loading' Howl do not act
 *   immediately — real Howler pushes them onto its load queue
 *   and `playing()` stays false through the whole window. The
 *   queue drains right AFTER the 'load' handlers run: in real
 *   Howler 'load' listeners are scheduled on a macrotask and a
 *   not-ready <audio> node defers a queued play further, so an
 *   onload handler can observe `playing() === false` with a
 *   play still in flight.
 * - `play()` on a loaded Howl flips `playing()` synchronously
 *   but emits `'play'` on a microtask (the real engine waits
 *   for the element's play() promise); `unload()` while the
 *   play is still pending emits `'playerror'` (mirrors the
 *   browser's AbortError).
 * - `seek()` returns the Howl itself (not a number) while the
 *   sound is not `'loaded'` — the same quirk `audioUtils`
 *   `getPlayPosition` guards against.
 * - `_sounds = [{ _node }]` exposes an `HTMLAudioElement` stub so
 *   `getHtml5AudioNode` returns a node and the `timeupdate`
 *   fallback path is testable.
 * - `on`/`once`/`off` follow Howler's handler-registry semantics
 *   (`off()` clears all, `off(evt)` clears one event,
 *   `off(evt, fn)` filters a single handler). `once` handlers
 *   auto-remove after firing.
 * - `play()` on an already-playing Howl spawns a NEW sound
 *   instance (an extra `_sounds` entry with its own node) —
 *   real Howler's `play()` never resumes a playing sound; it
 *   recycles an `_ended` one or creates another, which is how
 *   an unguarded second `play()` layers the same file over
 *   itself (the overlap bug this suite guards).
 * - `emit(event, ...args)` is a TEST-ONLY helper (not part of
 *   the Howl API) that fires the registered handlers. It also
 *   applies the state transitions the real engine would perform
 *   alongside the event: `'load'` → `'loaded'`, `'end'` →
 *   `playing() === false` unless looping. `'loaderror'` fires
 *   the error handlers without changing state. `'end'` fires
 *   once per ending sound instance: real Howler schedules each
 *   listener call on a macrotask (setTimeout in `_emit`), so
 *   whether a doubled Howl's second `end` still reaches
 *   listeners the first emission detached (disposeHowl's
 *   `off()`) is timing-dependent — the fake fires the captured
 *   handlers once per sound, the hazardous ordering, so guards
 *   are exercised.
 * - `stop()` on a 'loading' Howl emits `'stop'` immediately
 *   (real Howler queues it) so teardown listeners — the verse
 *   bounds cleanup — still fire on disposeHowl.
 * - The `_sounds[i]._node` element mirrors play/pause state so
 *   `node.paused` reflects the fake sound — tests can simulate
 *   an OS-level pause (audio-focus loss) by pausing the node
 *   while `playing()` stays true.
 *
 * Usage:
 *
 *   import { FakeHowl } from '../__tests__/mocks/FakeHowl';
 *   // adjust the relative path to this file as needed
 *
 *   vi.mock('howler', async () => ({
 *     Howl: (await import('../__tests__/mocks/FakeHowl')).FakeHowl,
 *   }));
 *
 *   // or, if hoisting forbids an async factory:
 *   vi.mock('howler', () => ({ Howl: FakeHowl })); // only when
 *   // FakeHowl is itself imported via vi.hoisted
 *
 *   beforeEach(() => {
 *     FakeHowl.reset(); // clears FakeHowl.instances
 *   });
 *
 *   const howl = FakeHowl.instances[0];
 *   howl.emit('load');       // simulate the file finishing load
 *   howl.emit('end', 0);     // simulate natural playback end
 *   howl.emit('loaderror', 0, new Error('boom'));
 */

type Handler = (...args: unknown[]) => void;
type HowlState = 'unloaded' | 'loading' | 'loaded';

interface FakeSound {
  _node: HTMLAudioElement | null;
}

/**
 * Builds a real `HTMLAudioElement` when a DOM is available
 * (happy-dom provides one) so `node instanceof HTMLAudioElement`
 * checks in `audioUtils.getHtml5AudioNode` pass; falls back to a
 * bare stub otherwise.
 */
const createAudioNode = (): HTMLAudioElement | null => {
  if (
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function'
  ) {
    return document.createElement('audio');
  }
  return null;
};

const OPTION_EVENT_PREFIX = 'on';

export class FakeHowl {
  /** Every FakeHowl ever constructed, in order. */
  static instances: FakeHowl[] = [];

  /** Clears the instances registry — call in `beforeEach`. */
  static reset(): void {
    FakeHowl.instances = [];
  }

  readonly src: string[];
  readonly html5: boolean;
  readonly format?: string | string[];
  readonly pool: number;

  _state: HowlState;
  _playing = false;
  _pos = 0;
  _duration: number;
  _loop: boolean;
  _muted: boolean;
  _volume: number;
  _rate: number;
  _sounds: FakeSound[];
  _pendingPlay = false;
  /** Actions deferred while 'loading' — Howler's `_queue`. */
  private _queue: (() => void)[] = [];

  private _handlers: Record<string, Handler[]> = {};

  constructor(options: HowlOptions) {
    const src = options.src ?? [];
    this.src = (Array.isArray(src) ? src : [src]).map(String);
    this.html5 = options.html5 ?? false;
    this.format = options.format;
    this.pool = options.pool ?? 1;
    this._loop = options.loop ?? false;
    this._muted = options.mute ?? false;
    this._volume = options.volume ?? 1;
    this._rate = options.rate ?? 1;
    // `duration` is not a real Howl option (Howler reads it from
    // the decoded file) but tests may inject one.
    this._duration =
      (options as { duration?: number }).duration ?? 0;
    this._state = options.preload === false ? 'unloaded' : 'loading';
    this._sounds =
      this._state === 'unloaded'
        ? []
        : [{ _node: createAudioNode() }];

    // Howler registers `onload`, `onplay`, `onend`, `onloaderror`,
    // `onplayerror`, ... option callbacks as event handlers.
    for (const [key, value] of Object.entries(options)) {
      if (
        key.startsWith(OPTION_EVENT_PREFIX) &&
        key.length > OPTION_EVENT_PREFIX.length &&
        typeof value === 'function'
      ) {
        this.on(key.slice(OPTION_EVENT_PREFIX.length),
          value as Handler);
      }
    }

    FakeHowl.instances.push(this);
  }

  state(): HowlState {
    return this._state;
  }

  playing(): boolean {
    return this._playing;
  }

  /**
   * Starts playback — or queues it. While `'loading'`, real
   * Howler never starts a sound: play() pushes a queue entry
   * and `playing()` stays false until finishLoad() drains the
   * queue after the 'load' handlers.
   *
   * On a loaded Howl it returns a sound id synchronously (like
   * Howler), marks `playing()` immediately, and emits `'play'`
   * on a microtask — matching the real HTMLAudioElement
   * `play()` promise resolution.
   *
   * Howler parity: a `play()` while a sound is already playing
   * does NOT resume it — `_inactiveSound()` creates a new
   * sound instance (for `html5` a second <audio> node playing
   * the same file). The extra `_sounds` entry is how tests
   * observe the overlap.
   */
  play(): number {
    if (this._state === 'unloaded') return 0;
    if (this._state === 'loading') {
      this._queue.push(() => {
        this.play();
      });
      return 0;
    }
    const id = 1;
    if (this._playing) {
      this._sounds.push({ _node: createAudioNode() });
    }
    this._playing = true;
    this._pendingPlay = true;
    for (const sound of this._sounds) {
      void sound._node?.play();
    }
    void Promise.resolve().then(() => {
      if (!this._pendingPlay || this._state === 'unloaded') {
        return;
      }
      this._pendingPlay = false;
      this.emit('play', id);
    });
    return id;
  }

  pause(): this {
    if (this._state === 'loading') {
      // Real Howler queues the pause behind any queued play —
      // the sound starts, then pauses, on drain.
      this._queue.push(() => {
        this.pause();
      });
      return this;
    }
    this._playing = false;
    this._pendingPlay = false;
    for (const sound of this._sounds) {
      sound._node?.pause();
    }
    this.emit('pause', 0);
    return this;
  }

  stop(): this {
    this._playing = false;
    this._pendingPlay = false;
    this._pos = 0;
    for (const sound of this._sounds) {
      sound._node?.pause();
    }
    this.emit('stop', 0);
    return this;
  }

  /**
   * Faithful teardown: emits `'stop'` (Howler stops each sound
   * before releasing it), then frees `_sounds` and marks the
   * howl `'unloaded'`. A still-pending `play()` surfaces a
   * `'playerror'` first, mirroring the browser's AbortError.
   */
  unload(): this {
    this._queue = [];
    if (this._pendingPlay) {
      this._pendingPlay = false;
      this.emit('playerror', 0, new Error('play interrupted'));
    }
    this._playing = false;
    for (const sound of this._sounds) {
      sound._node?.pause();
    }
    this.emit('stop', 0);
    this._state = 'unloaded';
    this._sounds = [];
    return this;
  }

  /** Marks the sound loaded and emits `'load'`. */
  load(): this {
    this.finishLoad();
    return this;
  }

  mute(muted?: boolean): boolean | this {
    if (muted === undefined) return this._muted;
    this._muted = muted;
    this.emit('mute', 0);
    return this;
  }

  volume(volume?: number): number | this {
    if (volume === undefined) return this._volume;
    this._volume = volume;
    this.emit('volume', 0);
    return this;
  }

  rate(rate?: number): number | this {
    if (rate === undefined) return this._rate;
    this._rate = rate;
    this.emit('rate', 0);
    return this;
  }

  loop(loop?: boolean): boolean | this {
    if (loop === undefined) return this._loop;
    this._loop = loop;
    return this;
  }

  /**
   * Howler quirk: while the sound is not `'loaded'`, the getter
   * returns the Howl itself instead of a number.
   */
  seek(): number | this;
  seek(position: number): this;
  seek(position?: number): number | this {
    if (position === undefined) {
      return this._state === 'loaded' ? this._pos : this;
    }
    this._pos = position;
    return this;
  }

  duration(): number {
    return this._duration;
  }

  on(event: string, fn: Handler): this {
    (this._handlers[event] ??= []).push(fn);
    return this;
  }

  once(event: string, fn: Handler): this {
    const wrapped: Handler = (...args) => {
      this.off(event, wrapped);
      fn(...args);
    };
    return this.on(event, wrapped);
  }

  off(event?: string, fn?: Handler): this {
    if (!event) {
      this._handlers = {};
      return this;
    }
    if (!fn) {
      delete this._handlers[event];
      return this;
    }
    const list = this._handlers[event];
    if (list) {
      this._handlers[event] = list.filter((h) => h !== fn);
    }
    return this;
  }

  /**
   * TEST-ONLY helper (not part of the Howl API): fires every
   * handler registered for `event` with `...args`, applying the
   * state transitions the real engine performs alongside it.
   */
  emit(event: string, ...args: unknown[]): void {
    if (event === 'load') {
      // finishLoad() owns both the state transition and firing
      // the 'load' handlers — returning early avoids a double
      // dispatch through the generic path below.
      this.finishLoad();
      return;
    }
    const handlers = [...(this._handlers[event] ?? [])];
    if (event === 'end') {
      if (!this._loop) {
        this._playing = false;
      }
      // Howler emits 'end' once per ending sound instance and
      // schedules each listener call on a macrotask — whether
      // a doubled Howl's second 'end' reaches listeners the
      // first emission detached (disposeHowl's off()) is
      // timing-dependent. Firing the captured handlers once
      // per sound models the hazardous ordering, so guards
      // like `finished !== audioRef.current` get exercised.
      const ends = Math.max(1, this._sounds.length);
      for (let i = 0; i < ends; i++) {
        handlers.forEach((h) => h(...args));
      }
      return;
    }
    handlers.forEach((h) => h(...args));
  }

  private finishLoad(): void {
    if (this._state === 'loaded') return;
    this._state = 'loaded';
    if (this._sounds.length === 0) {
      this._sounds = [{ _node: createAudioNode() }];
    }
    // 'load' handlers run BEFORE the load queue drains —
    // matching the real ordering where a play queued during
    // 'loading' can still be in flight when onload runs (real
    // Howler schedules 'load' listeners on a macrotask and a
    // not-ready <audio> node defers a queued play further).
    [...(this._handlers.load ?? [])].forEach((h) => h(0));
    const queued = this._queue;
    this._queue = [];
    queued.forEach((action) => action());
  }
}

export default FakeHowl;
