import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import App from '../App';
import Audio from '../components/Audio';
import { useBibleStore } from '../store';
import type { PlaylistItem } from '../types';

/**
 * Regression coverage for issue #62: while audio is playing, the
 * chapter switch must happen instantly — the previous audio must
 * not keep running until the current verse/segment ends.
 *
 * Two paths are covered:
 * 1. Chapter playback: clicking next/prev chapter disposes the
 *    playing Howl right away.
 * 2. Note playlist: when the source route clears
 *    `audioPlaylistItems` (e.g. the user navigated to /bible), the
 *    playlist is stopped. Previously the orphaned playlist kept
 *    playing invisibly, and on each item advance Audio.tsx
 *    navigated the user back to the playing item's chapter — so a
 *    manual chapter click appeared to take effect only after the
 *    current verse finished.
 */

type Handler = (id?: number, msg?: unknown) => void;

const FakeHowl = vi.hoisted(() => class FakeHowlImpl {
  static instances: FakeHowlImpl[] = [];
  _handlers: Record<string, Handler[]> = {};
  _onceHandlers: Record<string, Handler[]> = {};
  _opts: Record<string, unknown>;
  _state = 'loaded';
  _playing = false;
  stopped = false;
  unloaded = false;
  played = false;
  src: string;

  constructor(opts: Record<string, unknown>) {
    this._opts = opts;
    this.src = (opts.src as string[])[0];
    FakeHowl.instances.push(this);
  }
  emit(event: string, id = 0) {
    (this._handlers[event] ?? []).forEach((fn) => fn(id));
    (this._onceHandlers[event] ?? []).forEach((fn) => fn(id));
    this._onceHandlers[event] = [];
    const opt = this._opts[`on${event}`] as Handler | undefined;
    opt?.(id);
  }
  on(event: string, fn: Handler) {
    (this._handlers[event] ??= []).push(fn);
    return this;
  }
  once(event: string, fn: Handler) {
    (this._onceHandlers[event] ??= []).push(fn);
    return this;
  }
  off() {
    return this;
  }
  play() {
    this.played = true;
    this._playing = true;
    this.emit('play');
    return 1;
  }
  pause() {
    this._playing = false;
    this.emit('pause');
    return this;
  }
  stop() {
    this.stopped = true;
    this._playing = false;
    this.emit('stop');
    return this;
  }
  unload() {
    if (this._playing) this.stop();
    this.unloaded = true;
    this._state = 'unloaded';
    return null;
  }
  seek(v?: number) {
    return v === undefined ? 0 : this;
  }
  duration() {
    return 100;
  }
  loop() {
    return this;
  }
  playing() {
    return this._playing;
  }
  volume() {
    return this;
  }
  state() {
    return this._state;
  }
});

vi.mock('howler', () => ({
  Howl: FakeHowl,
}));

vi.mock('../hooks/useMediaSession', () => ({
  useMediaSession: vi.fn(),
}));

const playlistItem = (
  overrides: Partial<PlaylistItem> = {},
): PlaylistItem => ({
  itemId: 'note-1',
  bookId: 'JHN',
  chapter: 3,
  startVerse: 16,
  endVerse: 18,
  label: 'Note 1/1 – John 3:16-18',
  ...overrides,
});

describe('Audio stops instantly on chapter change (#62)', () => {
  beforeEach(() => {
    FakeHowl.instances = [];
    useBibleStore.setState({
      activeBookId: 'JHN',
      activeChapter: 1,
      verseSelection: null,
      bibleVersion: 'KJV',
      activeTextFilesetId: 'ENGKJV',
      activeAudioFilesetId: 'ENGKJV',
      audioPlaylistItems: null,
      audioPlaylistStartIndex: null,
      showAudioPlayer: false,
    });
  });

  it('stops playing chapter audio on next-chapter click',
    async () => {
      render(
        <MemoryRouter initialEntries={['/bible/JHN.1']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(
        () => {
          expect(
            screen.getByTitle('passage-verse-1-1')
          ).toBeInTheDocument();
        },
        { timeout: 5000 }
      );

      await userEvent.click(screen.getByTitle('Play audio'));

      await waitFor(() => {
        expect(FakeHowl.instances.length).toBeGreaterThan(0);
      });
      const first = FakeHowl.instances[0];
      act(() => {
        first.play();
      });
      expect(first._playing).toBe(true);

      await userEvent.click(
        screen.getByTitle('next-passage-button')
      );

      await waitFor(() => {
        expect(
          screen.getByTitle('passage-verse-2-1')
        ).toBeInTheDocument();
      });

      expect(first.stopped).toBe(true);
      expect(first.unloaded).toBe(true);
      expect(first._playing).toBe(false);
    }
  );

  it('stops an orphaned playlist when its items are cleared',
    async () => {
      render(
        <MemoryRouter initialEntries={['/notes/tag/abc']}>
          <Audio />
        </MemoryRouter>
      );

      // Route populated the playlist and requested playback —
      // Audio picks it up via audioPlaylistStartIndex.
      act(() => {
        useBibleStore.setState({
          audioPlaylistItems: [playlistItem()],
          audioPlaylistStartIndex: 0,
        });
      });

      await waitFor(() => {
        expect(FakeHowl.instances.length).toBeGreaterThan(0);
      });

      // The source route unmounted (user navigated away) and
      // cleared the store items — the playlist must stop instead
      // of playing on invisibly.
      act(() => {
        useBibleStore.setState({ audioPlaylistItems: null });
      });

      await waitFor(() => {
        expect(FakeHowl.instances[0].unloaded).toBe(true);
      });
      expect(
        useBibleStore.getState().showAudioPlayer
      ).toBe(false);
    }
  );
});
