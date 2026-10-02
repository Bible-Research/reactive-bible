import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Audio from './Audio';
import BibleRoute from '../routes/BibleRoute';
import { useBibleStore, initialState } from '../store';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../stores/authStore';
import { mockDomApis } from '../__tests__/helpers';

type Handler = (...args: unknown[]) => void;

// Fake Howl that models real Howler semantics closely enough for
// the chapter transition: play() resolves asynchronously, and a
// teardown (unload) while play is still pending surfaces a
// 'playerror' — matching the browser's AbortError behavior.
const FakeHowl = vi.hoisted(() => {
  class FakeHowlClass {
    static instances: FakeHowlClass[] = [];
    src: string;
    _state: 'loading' | 'loaded' | 'unloaded' = 'loaded';
    _playing = false;
    _pendingPlay = false;
    _loop = false;
    _handlers: Record<string, Handler[]> = {};

    constructor(opts: Record<string, unknown>) {
      this.src = (opts.src as string[])[0];
      const map: Record<string, string> = {
        onplay: 'play',
        onpause: 'pause',
        onend: 'end',
        onloaderror: 'loaderror',
        onplayerror: 'playerror',
        onload: 'load',
        onstop: 'stop',
      };
      Object.entries(map).forEach(([optKey, evt]) => {
        const fn = opts[optKey] as Handler | undefined;
        if (fn) this._handlers[evt] = [fn];
      });
      FakeHowlClass.instances.push(this);
    }

    on(evt: string, fn: Handler) {
      (this._handlers[evt] ??= []).push(fn);
      return this;
    }
    once(evt: string, fn: Handler) {
      const wrapped: Handler = (...a) => {
        this.off(evt, wrapped);
        fn(...a);
      };
      return this.on(evt, wrapped);
    }
    off(evt?: string, fn?: Handler) {
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
    }
    emit(evt: string, ...args: unknown[]) {
      [...(this._handlers[evt] ?? [])].forEach((h) => h(...args));
    }

    play() {
      if (this._state === 'unloaded') return 0;
      // playing() flips synchronously like Howler's setParams;
      // 'play' fires when the node's promise resolves.
      this._playing = true;
      this._pendingPlay = true;
      void Promise.resolve().then(() => {
        if (!this._pendingPlay || this._state === 'unloaded')
          return;
        this._pendingPlay = false;
        this.emit('play', 0);
      });
      return 0;
    }
    pause() {
      this._playing = false;
      this.emit('pause', 0);
      return this;
    }
    stop() {
      this._playing = false;
      this.emit('stop', 0);
      return this;
    }
    unload() {
      if (this._pendingPlay) {
        this._pendingPlay = false;
        this.emit('playerror', 0, new Error('play interrupted'));
      }
      this._state = 'unloaded';
      this._playing = false;
      return this;
    }
    state() {
      return this._state;
    }
    playing() {
      return this._playing;
    }
    loop(v?: boolean) {
      if (v === undefined) return this._loop;
      this._loop = v;
      return this;
    }
    seek(v?: number) {
      if (v === undefined) return 0;
      return this;
    }
    duration() {
      return 60;
    }
    volume(v?: number) {
      if (v === undefined) return 1;
      return this;
    }
  }
  return FakeHowlClass;
});

vi.mock('howler', () => ({ Howl: FakeHowl }));

vi.mock('./Passage', () => ({
  default: () => <div data-testid="passage" />,
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>(
    '../api',
  );
  return {
    ...actual,
    getKjvAudioUrl: vi.fn(
      (bookId: string, chapter: number) =>
        `http://kjv.test/${bookId}/${chapter}.mp3`,
    ),
    getBibleAudioUrl: vi
      .fn()
      .mockResolvedValue('http://audio.test/file.mp3'),
    getAudioTimestamps: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

describe('Audio chapter auto-advance', () => {
  beforeEach(() => {
    FakeHowl.instances = [];
    vi.clearAllMocks();
    mockDomApis();
    // No CORS on the audio host — the preload streams the URL.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('CORS')),
    );
    useBibleStore.setState({
      ...initialState,
      activeBookId: 'JHN',
      activeChapter: 3,
      activeAudioFilesetId: 'ENGKJV',
      activeTextFilesetId: 'ENGKJV',
    });
    useAuthStore.setState(authInitialState);
  });

  it('keeps the adopted next-chapter Howl playing on end', async () => {
    const transitions: number[] = [
      useBibleStore.getState().activeChapter,
    ];
    const unsubscribe = useBibleStore.subscribe((s) => {
      if (transitions[transitions.length - 1] !== s.activeChapter)
        transitions.push(s.activeChapter);
    });

    render(
      <MemoryRouter initialEntries={['/bible/JHN.3']}>
        <Audio />
        <Routes>
          <Route path="/bible/:ref" element={<BibleRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {
      screen.getByTitle('Play audio').click();
    });

    // Current chapter loads and plays.
    await waitFor(() =>
      expect(FakeHowl.instances.length).toBeGreaterThan(0),
    );
    const first = FakeHowl.instances[0];
    expect(first.src).toBe('http://kjv.test/JHN/3.mp3');
    await waitFor(() => expect(first._playing).toBe(true));

    // Next chapter is pre-created while chapter 3 plays.
    await waitFor(() =>
      expect(FakeHowl.instances.length).toBe(2),
    );
    const preloaded = FakeHowl.instances[1];
    expect(preloaded.src).toBe('http://kjv.test/JHN/4.mp3');

    // Chapter 3 finishes — the player adopts the preloaded Howl.
    await act(async () => {
      first.emit('end', 0);
      await Promise.resolve();
    });

    // The store advances straight 3 -> 4. The URL->store sync
    // must never see the old URL with the new chapter — a revert
    // is what tore down the adopted Howl mid-play (issue #116).
    expect(transitions).toEqual([3, 4]);
    expect(useBibleStore.getState().activeChapter).toBe(4);

    // The adopted Howl was not unloaded mid-play and is playing.
    expect(preloaded._state).toBe('loaded');
    await waitFor(() => expect(preloaded._playing).toBe(true));

    // The adopted Howl's play event preloads the chapter after
    // the one ACTUALLY playing (JHN 5) — not a duplicate of JHN 4
    // from a store still catching up to the navigation.
    await waitFor(() =>
      expect(FakeHowl.instances.length).toBe(3),
    );
    expect(FakeHowl.instances[2].src).toBe(
      'http://kjv.test/JHN/5.mp3',
    );

    // No error state on the play button.
    expect(
      screen.queryByTitle('Failed to play audio'),
    ).not.toBeInTheDocument();
    unsubscribe();
  });
});
