/**
 * Regression coverage for the wedged audio player seen when the
 * user navigates to another chapter while chapter audio plays.
 *
 * Manual navigation disposes the current Howl (issue #62) but the
 * playing intent must survive — `isPlaying` stays true and the
 * load effect fetches and plays the new chapter, the same way
 * auto-advance does. The reset effect was clearing
 * `isPlayingRef`, which made the in-flight load bail out at its
 * "paused mid-fetch" check: no Howl ever materialized, the
 * bottom player vanished, `isPlaying` stayed stuck true, and
 * `showAudioPlayer` kept reserving ~120px of dead space at the
 * bottom of the screen.
 *
 * Covered paths:
 * 1. Playing + next chapter: a new Howl loads and plays, the
 *    player stays mounted.
 * 2. Paused + next chapter: nothing will load, so the player
 *    chrome closes instead of leaving a dead gap.
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { server } from '../mocks/server';
import App from '../App';
import { useBibleStore } from '../store';
import { FakeHowl } from './mocks/FakeHowl';

// Shared faithful Howl fake — instances reachable via
// FakeHowl.instances; state/playing mirror real Howler.
vi.mock('howler', async () => ({
  Howl: (await import('./mocks/FakeHowl')).FakeHowl,
}));

vi.mock('../hooks/useMediaSession', () => ({
  useMediaSession: vi.fn(),
}));

const renderReader = () =>
  render(
    <MemoryRouter initialEntries={['/bible/JHN.1']}>
      <App />
    </MemoryRouter>
  );

const startPlaying = async () => {
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
  return first;
};

const goToNextChapter = async () => {
  await userEvent.click(screen.getByTitle('next-passage-button'));
  await waitFor(() => {
    expect(
      screen.getByTitle('passage-verse-2-1')
    ).toBeInTheDocument();
  });
};

describe('Audio continues on manual chapter navigation', () => {
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
    // Playing chapter 1 preloads chapter 2's bytes — keep that
    // fetch off the real network (KJV audio is served by
    // wordpocket.org, which has no default MSW handler).
    server.use(
      http.get(
        'https://wordpocket.org/*',
        () => new HttpResponse(null, { status: 404 })
      )
    );
  });

  it('keeps playing on the new chapter', async () => {
    renderReader();
    const first = await startPlaying();

    // 'play' also preloads the next chapter — wait for its Howl.
    await waitFor(() => {
      expect(FakeHowl.instances.length).toBe(2);
    });

    await goToNextChapter();

    // The old chapter is torn down instantly (#62)…
    expect(first.state()).toBe('unloaded');
    // …and a new Howl materializes for chapter 2 and plays —
    // before the fix, the load bailed mid-flight and audio was
    // never created again.
    await waitFor(() => {
      expect(
        FakeHowl.instances.some(
          (h) => h !== first && h.state() !== 'unloaded'
        )
      ).toBe(true);
    });
    const next = FakeHowl.instances.find(
      (h) => h !== first && h.state() !== 'unloaded'
    );
    expect(next).toBeDefined();
    await waitFor(() => {
      expect(next?.playing()).toBe(true);
    });

    // The bottom player stays mounted — no dead space, no
    // stuck "pause" icon.
    expect(screen.getByTitle('Close player')).toBeInTheDocument();
    expect(screen.getByTitle('Pause audio')).toBeInTheDocument();
    expect(useBibleStore.getState().showAudioPlayer).toBe(true);
  });

  it('closes the player when navigating while paused', async () => {
    renderReader();
    const first = await startPlaying();
    act(() => {
      first.emit('load');
    });

    // Pause via the bottom player so its chrome is up.
    await waitFor(() => {
      expect(screen.getByTitle('Close player')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTitle('Pause'));
    expect(first.playing()).toBe(false);

    await goToNextChapter();

    // Nothing will load while paused — the player must close
    // rather than reserve ~120px of empty space at the bottom.
    await waitFor(() => {
      expect(useBibleStore.getState().showAudioPlayer).toBe(false);
    });
    expect(screen.queryByTitle('Close player')).toBeNull();
  });
});
