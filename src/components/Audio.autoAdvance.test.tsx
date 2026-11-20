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
import {
  stubMediaSession,
  type MediaSessionStub,
} from '../__tests__/mocks/mediaSession';

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
  const { mockStructure } = await import('../mocks/handlers');
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
    // The suite stubs global fetch (audio host has no CORS),
    // so the real client would reject every loadStructure
    // kick — resolve the shared fixture instead.
    fetchBibleStructure:
      vi.fn().mockResolvedValue(mockStructure),
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

    // The JHN 4 prefetch tried fetch() once; its CORS-style
    // rejection marked the origin, so the JHN 5 prefetch skipped
    // fetch() entirely — at most one console error per origin
    // per session, not one per chapter.
    const audioFetches = vi.mocked(fetch).mock.calls.filter(
      ([input]) => String(input).includes('kjv.test'),
    );
    expect(audioFetches).toHaveLength(1);

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

      // The replacement's bytes finish loading — the play()
      // safePlay queued while 'loading' drains on 'load'.
      act(() => {
        replacement.emit('load');
      });

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

      // The adopted Howl's bytes finish loading — the play()
      // the gap timer queues (or already queued) drains into a
      // real start.
      act(() => {
        preloaded.emit('load');
      });

      // The adopted Howl still plays after the inter-chapter
      // gap.
      await waitFor(
        () => expect(preloaded._playing).toBe(true),
        { timeout: 4000 },
      );
    },
  );

  it('a stray media-session play during the inter-chapter ' +
    'gap does not layer a second sound', async () => {
      // Howler's play() on an already-playing Howl spawns a NEW
      // sound instance with its own <audio> node — the same
      // file then plays twice, offset by the gap. Head units /
      // Bluetooth re-dispatch 'play' on metadata updates and
      // audio-focus regains, so the adopted chapter can already
      // be playing when the gap timer fires.
      const session: MediaSessionStub = stubMediaSession();
      vi.stubGlobal(
        'MediaMetadata',
        class {
          init: unknown;
          constructor(init: unknown) {
            this.init = init;
          }
        },
      );
      try {
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

        // Chapter 3 ends — the player adopts JHN 4 and arms
        // the inter-chapter gap timer.
        await act(async () => {
          first.emit('end', 0);
          await Promise.resolve();
        });
        await waitFor(() =>
          expect(
            useBibleStore.getState().activeChapter,
          ).toBe(4),
        );

        // A stray 'play' arrives mid-gap and starts the adopted
        // Howl early.
        act(() => {
          session.handlers.get('play')?.({ action: 'play' });
        });
        expect(preloaded._playing).toBe(true);

        // When the gap elapses the timer must see the Howl is
        // already playing — a second play() would stack another
        // sound instance on top.
        await act(async () => {
          await new Promise((r) => setTimeout(r, 2300));
        });
        expect(preloaded._playing).toBe(true);
        expect(preloaded._sounds.length).toBe(1);
      } finally {
        session.restore();
        vi.unstubAllGlobals();
      }
    },
  );

  it('a doubled end event on the finished Howl does not ' +
    're-advance and orphan the adopted chapter', async () => {
      // A Howl carrying two sounds (e.g. after an overlapping
      // second play()) emits 'end' once per sound, and Howler
      // schedules each listener call on a macrotask — when the
      // second emit precedes the detach, its 'end' still
      // reaches onChapterEnd after the first already disposed
      // the Howl (FakeHowl models that hazardous ordering).
      // Re-advancing would orphan the adopted Howl: it keeps
      // playing untracked while the next chapter loads on top
      // of it.
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

      // Simulate the overlap seed: a second sound instance on
      // the finished Howl.
      act(() => {
        first.play();
      });
      expect(first._sounds.length).toBe(2);

      await act(async () => {
        first.emit('end', 0);
        await Promise.resolve();
      });

      // Advance once, to JHN 4 — a second advance would land
      // on JHN 5 while the adopted Howl plays untracked.
      await waitFor(() =>
        expect(useBibleStore.getState().activeChapter).toBe(4),
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 2300));
      });
      expect(useBibleStore.getState().activeChapter).toBe(4);
      expect(preloaded._playing).toBe(true);
      expect(
        FakeHowl.instances.filter((h) => h._playing).length,
      ).toBe(1);
    },
  );

  it('a stray media-session play during the load window ' +
    'does not stack a second sound', async () => {
      // safePlay() while the chapter Howl is still 'loading'
      // only queues a play inside Howler — playing() stays
      // false the whole window and the queue can still be
      // undrained when 'load' lands. A head unit re-dispatching
      // 'play' in that window must join the pending request,
      // not queue a second sound that drains into overlap.
      const session: MediaSessionStub = stubMediaSession();
      vi.stubGlobal(
        'MediaMetadata',
        class {
          init: unknown;
          constructor(init: unknown) {
            this.init = init;
          }
        },
      );
      try {
        renderPlayer();
        await act(async () => {
          screen.getByTitle('Play audio').click();
        });
        await waitFor(() =>
          expect(FakeHowl.instances.length).toBe(1),
        );
        const first = FakeHowl.instances[0];
        expect(first.state()).toBe('loading');
        await waitFor(() =>
          expect(session.handlers.has('play')).toBe(true),
        );

        act(() => {
          session.handlers.get('play')?.({ action: 'play' });
        });

        act(() => {
          first.emit('load');
        });
        await waitFor(() => expect(first._playing).toBe(true));
        expect(first._sounds.length).toBe(1);
      } finally {
        session.restore();
        vi.unstubAllGlobals();
      }
    },
  );

  it('a media-session play after an OS-level pause revives ' +
    'the node instead of stacking a sound', async () => {
      // Android audio-focus loss pauses the <audio> node
      // behind Howler's back: playing() still reports true
      // while the node is silent. The recovery 'play' must
      // re-play the same node — howl.play() would stack a
      // second sound instance on a corpse.
      const session: MediaSessionStub = stubMediaSession();
      vi.stubGlobal(
        'MediaMetadata',
        class {
          init: unknown;
          constructor(init: unknown) {
            this.init = init;
          }
        },
      );
      try {
        renderPlayer();
        await act(async () => {
          screen.getByTitle('Play audio').click();
        });
        await waitFor(() =>
          expect(FakeHowl.instances.length).toBe(1),
        );
        const first = FakeHowl.instances[0];
        act(() => {
          first.emit('load');
        });
        await waitFor(() => expect(first._playing).toBe(true));
        const node = first._sounds[0]._node;
        expect(node?.paused).toBe(false);

        // The OS pauses the node — Howler bookkeeping is now
        // desynced: playing() true, node silent.
        act(() => {
          node?.pause();
        });
        expect(first.playing()).toBe(true);
        expect(node?.paused).toBe(true);

        act(() => {
          session.handlers.get('play')?.({ action: 'play' });
        });
        expect(first._sounds.length).toBe(1);
        expect(node?.paused).toBe(false);
      } finally {
        session.restore();
        vi.unstubAllGlobals();
      }
    },
  );
});
