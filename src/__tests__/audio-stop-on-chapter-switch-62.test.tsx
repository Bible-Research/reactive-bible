/**
 * Regression coverage for issue #62: while audio is playing, the
 * chapter switch must happen instantly — the previous audio must
 * not keep running until the current verse/segment ends.
 *
 * Three paths are covered:
 * 1. Chapter playback: clicking next/prev chapter disposes the
 *    playing Howl right away.
 * 2. Note playlist: when the source route clears
 *    `audioPlaylistItems` (e.g. the user navigated to /bible), the
 *    playlist is stopped. Previously the orphaned playlist kept
 *    playing invisibly, and on each item advance Audio.tsx
 *    navigated the user back to the playing item's chapter — so a
 *    manual chapter click appeared to take effect only after the
 *    current verse finished.
 * 3. Chapter → playlist: starting a playlist while a chapter Howl
 *    plays must dispose the chapter audio — the reset effect's
 *    playlist-mode early return previously skipped disposal, so
 *    chapter and playlist audio ran at once (double-stream).
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { server } from '../mocks/server';
import App from '../App';
import Audio from '../components/Audio';
import { useBibleStore } from '../store';
import { FakeHowl } from './mocks/FakeHowl';
import type { PlaylistItem } from '../types';



vi.mock('howler', async () => ({
  Howl: (await import('./mocks/FakeHowl')).FakeHowl,
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
    FakeHowl.reset();
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
      // Playing chapter 1 preloads chapter 2's bytes — keep that
      // fetch off the real network (KJV audio is served by
      // wordpocket.org, which has no default MSW handler).
      server.use(
        http.get(
          'https://wordpocket.org/*',
          () => new HttpResponse(null, { status: 404 })
        )
      );
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
      expect(first.playing()).toBe(true);

      // 'play' also preloads the next chapter — wait for its
      // Howl so the discard assertion below is meaningful.
      await waitFor(() => {
        expect(FakeHowl.instances.length).toBe(2);
      });
      const preloaded = FakeHowl.instances[1];

      await userEvent.click(
        screen.getByTitle('next-passage-button')
      );

      await waitFor(() => {
        expect(
          screen.getByTitle('passage-verse-2-1')
        ).toBeInTheDocument();
      });

      expect(first.state()).toBe('unloaded');
      expect(first.playing()).toBe(false);
      // Manual navigation must discard the preloaded Howl too —
      // an intermediate commit on this branch used a stale
      // `current` local here (caught in review), skipping
      // discardPreloaded() and leaving the Howl parked in
      // preloadedRef for the load effect to adopt.
      expect(preloaded.state()).toBe('unloaded');
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
        expect(FakeHowl.instances[0].state()).toBe('unloaded');
      });
      expect(
        useBibleStore.getState().showAudioPlayer
      ).toBe(false);
    }
  );

  it('disposes chapter audio when a playlist starts',
    async () => {
      render(
        <MemoryRouter initialEntries={['/notes/tag/abc']}>
          <Audio />
        </MemoryRouter>
      );

      // A chapter Howl is already playing when the route signals
      // playlist start.
      await userEvent.click(screen.getByTitle('Play audio'));
      await waitFor(() => {
        expect(FakeHowl.instances.length).toBeGreaterThan(0);
      });
      const chapterHowl = FakeHowl.instances[0];

      act(() => {
        useBibleStore.setState({
          audioPlaylistItems: [playlistItem()],
          audioPlaylistStartIndex: 0,
        });
      });

      // The chapter Howl must be torn down — before the fix the
      // reset effect returned early in playlist mode and left it
      // playing underneath the playlist.
      await waitFor(() => {
        expect(chapterHowl.state()).toBe('unloaded');
      });
      expect(chapterHowl.playing()).toBe(false);

      // The playlist produced its own Howl for the item.
      await waitFor(() => {
        expect(
          FakeHowl.instances.some(
            (h) => h !== chapterHowl && h.state() !== 'unloaded',
          )
        ).toBe(true);
      });
    }
  );
});
