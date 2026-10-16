import { vi } from 'vitest';

export type HowlHandler = (...args: unknown[]) => void;

/**
 * Shared fake `Howl` for tests — one faithful implementation
 * instead of five divergent per-file mocks (test audit §L).
 *
 * Faithful behaviors the suites rely on:
 * - `instances[]` registry — tests reach the created Howl via
 *   `FakeHowl.instances[n]` / `FakeHowl.latest()`.
 * - Born `'loading'`: construction schedules a microtask that
 *   flips `state()` to `'loaded'` and emits 'load' — like a real
 *   async load — so the "adopt a still-loading preloaded Howl"
 *   path is representable. All handlers register synchronously
 *   before the microtask runs, so nothing races.
 * - Constructor `on*` options (`onload`, `onplay`, `onend`,
 *   `onloaderror`, `onplayerror`, `onstop`, `onseek`) register
 *   as event handlers, alongside `on`/`once`/`off`/`emit`.
 * - `seek()` returns the Howl itself while `'loading'` (matching
 *   Howler — see `getPlayPosition`); once loaded, `seek(v)`
 *   stores the position and `seek()` reads it back, so
 *   verse-jump assertions can check `_pos` directly.
 * - `play()` flips `playing()` synchronously like Howler's
 *   setParams, but emits 'play' asynchronously; `unload()`
 *   while a play is still pending surfaces 'playerror' —
 *   matching the browser's AbortError teardown.
 * - `unload()` on a playing sound emits 'stop' first, like
 *   Howler's internal stop.
 * - `_sounds[0]._node` exposes a real <audio> element (when the
 *   DOM provides `HTMLAudioElement`), so `getHtml5AudioNode`
 *   works and the `timeupdate` advance path is testable.
 * - Every public method is also a `vi.fn()`, so tests may use
 *   `toHaveBeenCalledWith` without giving up real state.
 *
 * Usage in a test file:
 *   vi.mock('howler', () => ({ Howl: FakeHowl }));
 *   beforeEach(() => FakeHowl.reset());
 */
export class FakeHowl {
  static instances: FakeHowl[] = [];

  src: string;
  _state: 'unloaded' | 'loading' | 'loaded' = 'loading';
  _playing = false;
  _pendingPlay = false;
  _pos = 0;
  _loop = false;
  _volume = 1;
  _handlers: Record<string, HowlHandler[]> = {};
  _sounds?: { _node?: HTMLAudioElement }[];

  constructor(opts: Record<string, unknown> = {}) {
    const src = opts.src;
    this.src = Array.isArray(src)
      ? String(src[0])
      : String(src ?? '');
    const map: Record<string, string> = {
      onplay: 'play',
      onpause: 'pause',
      onend: 'end',
      onload: 'load',
      onloaderror: 'loaderror',
      onplayerror: 'playerror',
      onstop: 'stop',
      onseek: 'seek',
    };
    Object.entries(map).forEach(([optKey, evt]) => {
      const fn = opts[optKey] as HowlHandler | undefined;
      if (fn) this._handlers[evt] = [fn];
    });
    // html5-backed Howls expose the pooled <audio> node; a DOM
    // stub keeps `getHtml5AudioNode` on the same path as prod.
    if (typeof HTMLAudioElement !== 'undefined') {
      this._sounds = [{ _node: document.createElement('audio') }];
    }
    FakeHowl.instances.push(this);
    // Real Howls load asynchronously — flip to 'loaded' on a
    // microtask (after synchronous handler registration).
    void Promise.resolve().then(() => {
      if (this._state === 'loading') {
        this._state = 'loaded';
        this.emit('load', 0);
      }
    });
  }

  /** Clear the registry — call from beforeEach. */
  static reset(): void {
    FakeHowl.instances = [];
  }

  /** The most recently constructed instance, if any. */
  static latest(): FakeHowl | undefined {
    return FakeHowl.instances[FakeHowl.instances.length - 1];
  }

  on = vi.fn((evt: string, fn: HowlHandler): FakeHowl => {
    (this._handlers[evt] ??= []).push(fn);
    return this;
  });

  once = vi.fn((evt: string, fn: HowlHandler): FakeHowl => {
    const wrapped: HowlHandler = (...a) => {
      this.off(evt, wrapped);
      fn(...a);
    };
    return this.on(evt, wrapped);
  });

  off = vi.fn((evt?: string, fn?: HowlHandler): FakeHowl => {
    if (!evt) {
      this._handlers = {};
      return this;
    }
    if (!fn) {
      delete this._handlers[evt];
      return this;
    }
    this._handlers[evt] = (this._handlers[evt] ?? []).filter(
      (h) => h !== fn,
    );
    return this;
  });

  emit(evt: string, ...args: unknown[]): void {
    [...(this._handlers[evt] ?? [])].forEach((h) => h(...args));
  }

  play = vi.fn((): number => {
    if (this._state === 'unloaded') return 0;
    // playing() flips synchronously like Howler's setParams;
    // 'play' fires when the node's promise resolves.
    this._playing = true;
    this._pendingPlay = true;
    void Promise.resolve().then(() => {
      if (!this._pendingPlay || this._state === 'unloaded') {
        return;
      }
      this._pendingPlay = false;
      this.emit('play', 0);
    });
    return 0;
  });

  pause = vi.fn((): FakeHowl => {
    this._playing = false;
    this.emit('pause', 0);
    return this;
  });

  stop = vi.fn((): FakeHowl => {
    this._playing = false;
    this.emit('stop', 0);
    return this;
  });

  unload = vi.fn((): FakeHowl => {
    if (this._pendingPlay) {
      this._pendingPlay = false;
      // Teardown aborts the in-flight node play() — the browser
      // surfaces this as a playerror (AbortError).
      this.emit('playerror', 0, new Error('play interrupted'));
    }
    // Howler stops the sound on unload.
    if (this._playing) this.emit('stop', 0);
    this._state = 'unloaded';
    this._playing = false;
    return this;
  });

  state = vi.fn((): 'unloaded' | 'loading' | 'loaded' => {
    return this._state;
  });

  playing = vi.fn((): boolean => this._playing);

  loop = vi.fn((v?: boolean): boolean | FakeHowl => {
    if (v === undefined) return this._loop;
    this._loop = v;
    return this;
  });

  seek = vi.fn((v?: number): number | FakeHowl => {
    // While loading, Howler's seek() returns the Howl — not a
    // number — so position reads are untrustworthy.
    if (v === undefined) {
      return this._state === 'loading' ? this : this._pos;
    }
    if (this._state === 'loading') return this;
    this._pos = v;
    return this;
  });

  duration = vi.fn((): number => 300);

  volume = vi.fn((v?: number): number | FakeHowl => {
    if (v === undefined) return this._volume;
    this._volume = v;
    return this;
  });

  rate = vi.fn((v?: number): number | FakeHowl => {
    if (v === undefined) return 1;
    return this;
  });

  mute = vi.fn((): FakeHowl => this);
}
