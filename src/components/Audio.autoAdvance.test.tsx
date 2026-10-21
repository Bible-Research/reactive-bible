import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Audio from './Audio';
import BibleRoute from '../routes/BibleRoute';
import {
  useBibleStore,
  initialState,
  type Translation,
} from '../store';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../stores/authStore';
import { mockDomApis } from '../__tests__/helpers';
import { FakeHowl } from '../__tests__/mocks/FakeHowl';

vi.mock('howler', async () => ({
  Howl: (await import('../__tests__/mocks/FakeHowl')).FakeHowl,
}));

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

// Split-testament audio translation for the multi-candidate
// fallback test: {OT: ENGESHO1DA, NT: ENGESHN1DA} in both codecs.
const eshTranslation: Translation = {
  abbr: 'ENGESH',
  name: 'English Test Version',
  language: 'English',
  language_iso: 'eng',
  filesets: [
    { id: 'ENGESHO1DA', type: 'audio', size: 'OT',
      codec: 'mp3', bitrate: '64' },
    { id: 'ENGESHO1DA-opus16', type: 'audio', size: 'OT',
      codec: 'opus', bitrate: '16' },
    { id: 'ENGESHN1DA', type: 'audio', size: 'NT',
      codec: 'mp3', bitrate: '64' },
    { id: 'ENGESHN1DA-opus16', type: 'audio', size: 'NT',
      codec: 'opus', bitrate: '16' },
  ],
};

const renderPlayer = () =>
  render(
    <MemoryRouter initialEntries={['/bible/JHN.3']}>
      <Audio />
      <Routes>
        <Route path="/bible/:ref" element={<BibleRoute />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Audio chapter auto-advance', () => {
  beforeEach(() => {
    FakeHowl.reset();
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

    renderPlayer();

    await act(async () => {
      screen.getByTitle('Play audio').click();
    });

    // Current chapter loads and plays.
    await waitFor(() =>
      expect(FakeHowl.instances.length).toBeGreaterThan(0),
    );
    const first = FakeHowl.instances[0];
    expect(first.src).toEqual(['http://kjv.test/JHN/3.mp3']);
    act(() => {
      first.emit('load');
    });
    await waitFor(() => expect(first._playing).toBe(true));

    // Next chapter is pre-created while chapter 3 plays.
    await waitFor(() =>
      expect(FakeHowl.instances.length).toBe(2),
    );
    const preloaded = FakeHowl.instances[1];
    expect(preloaded.src).toEqual(['http://kjv.test/JHN/4.mp3']);
    act(() => {
      preloaded.emit('load');
    });

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

    // The adopted Howl was not unloaded mid-play. Its play() is
    // deferred by the inter-chapter gap — not yet playing.
    expect(preloaded._state).toBe('loaded');
    expect(preloaded._playing).toBe(false);
    await waitFor(
      () => expect(preloaded._playing).toBe(true),
      { timeout: 4000 },
    );

    // The adopted Howl's play event preloads the chapter after
    // the one ACTUALLY playing (JHN 5) — not a duplicate of JHN 4
    // from a store still catching up to the navigation.
    await waitFor(
      () => expect(FakeHowl.instances.length).toBe(3),
      { timeout: 4000 },
    );
    expect(FakeHowl.instances[2].src).toEqual([
      'http://kjv.test/JHN/5.mp3',
    ]);

    // No error state on the play button.
    expect(
      screen.queryByTitle('Failed to play audio'),
    ).not.toBeInTheDocument();
    unsubscribe();
  });

  it('plays the fallback replacement that arrives mid-gap',
    async () => {
      // Two candidates for JHN (opus16 + mp3 sibling) so a decode
      // failure has a fallback to walk to.
      useBibleStore.setState({
        activeAudioFilesetId: 'ENGESHN1DA-opus16',
        activeTextFilesetId: 'ENGESH',
        translations: [eshTranslation],
      });

      renderPlayer();

      await act(async () => {
        screen.getByTitle('Play audio').click();
      });
      await waitFor(() =>
        expect(FakeHowl.instances.length).toBeGreaterThan(0),
      );
      const first = FakeHowl.instances[0];
      act(() => {
        first.emit('load');
      });
      await waitFor(() => expect(first._playing).toBe(true));

      await waitFor(() =>
        expect(FakeHowl.instances.length).toBe(2),
      );
      const preloaded = FakeHowl.instances[1];
      act(() => {
        preloaded.emit('load');
      });

      // Chapter 3 ends -- the player adopts the preloaded JHN 4
      // Howl and schedules its play() after the inter-chapter gap.
      await act(async () => {
        first.emit('end', 0);
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(useBibleStore.getState().activeChapter).toBe(4),
      );
      expect(preloaded._playing).toBe(false);

      // The adopted Howl fails to decode BEFORE the gap elapses --
      // the fallback walk replaces it with the mp3 sibling while
      // the scheduled-play timer still points at the dead Howl.
      act(() => {
        preloaded.emit('loaderror', 0, new Error('decode'));
      });
      // >= 3, not === 3: once the replacement plays, its
      // onplay handler preloads JHN 5 and a fourth Howl can
      // land before this assertion samples the count.
      await waitFor(() =>
        expect(
          FakeHowl.instances.length,
        ).toBeGreaterThanOrEqual(3),
      );
      const replacement = FakeHowl.instances[2];

      // When the gap elapses the replacement must start playing.
      // Without the fix the timer checked `audioRef === howl`
      // (the dead Howl), returned early, and nothing ever called
      // play() on the replacement -- silent deadlock.
      await waitFor(
        () => expect(replacement._playing).toBe(true),
        { timeout: 4000 },
      );
      expect(preloaded.state()).toBe('unloaded');
      expect(
        screen.queryByTitle('Failed to load audio'),
      ).not.toBeInTheDocument();
    },
  );

  it('advances the store without navigating off /search',
    async () => {
      render(
        <MemoryRouter initialEntries={['/search']}>
          <Audio />
          <Routes>
            <Route
              path="/search"
              element={<div>search page</div>}
            />
            <Route path="/bible/:ref" element={<BibleRoute />} />
          </Routes>
        </MemoryRouter>,
      );

      await act(async () => {
        screen.getByTitle('Play audio').click();
      });
      await waitFor(() =>
        expect(FakeHowl.instances.length).toBeGreaterThan(0),
      );
      const first = FakeHowl.instances[0];
      act(() => {
        first.emit('load');
      });
      await waitFor(() => expect(first._playing).toBe(true));
      // Next chapter is pre-created while chapter 3 plays.
      await waitFor(() =>
        expect(FakeHowl.instances.length).toBe(2),
      );
      const preloaded = FakeHowl.instances[1];

      // Chapter 3 finishes while the user sits on /search --
      // the store must advance WITHOUT navigating back to
      // /bible.
      await act(async () => {
        first.emit('end', 0);
        await Promise.resolve();
      });

      expect(useBibleStore.getState().activeChapter).toBe(4);
      expect(screen.getByText('search page')).toBeInTheDocument();

      // The adopted Howl still plays after the inter-chapter
      // gap.
      await waitFor(
        () => expect(preloaded._playing).toBe(true),
        { timeout: 4000 },
      );
    },
  );
});
