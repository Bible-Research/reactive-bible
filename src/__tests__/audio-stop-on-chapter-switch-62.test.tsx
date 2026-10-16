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

import { FakeHowl } from './mocks/FakeHowl';

// Shared faithful Howl fake — instances reachable via
// FakeHowl.instances; play/stop/unload are vi.fn()s.
vi.mock('howler', async () => {
  const { FakeHowl } = await import('./mocks/FakeHowl');
  return { Howl: FakeHowl };
});

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
      await act(async () => {
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

      expect(first.stop).toHaveBeenCalled();
      expect(first.unload).toHaveBeenCalled();
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
        expect(FakeHowl.instances[0].unload).toHaveBeenCalled();
      });
      expect(
        useBibleStore.getState().showAudioPlayer
      ).toBe(false);
    }
  );
});
