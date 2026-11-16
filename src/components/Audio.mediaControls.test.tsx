import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import Audio from './Audio';
import BibleRoute from '../routes/BibleRoute';
import { useBibleStore, initialState } from '../store';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../stores/authStore';
import { getAudioTimestamps } from '../api';
import { mockDomApis } from '../__tests__/helpers';
import {
  GLU8_JHN3_TIMESTAMPS,
} from '../__tests__/fixtures/glu8Jhn3Timestamps';
import { FakeHowl } from '../__tests__/mocks/FakeHowl';
import {
  stubMediaSession,
  type MediaSessionStub,
} from '../__tests__/mocks/mediaSession';

// Shared faithful Howl fake with real position tracking:
// seek(v) stores the position and seek() returns it, so
// verse-jump assertions read the resulting _pos directly.
vi.mock('howler', async () => ({
  Howl: (await import('../__tests__/mocks/FakeHowl')).FakeHowl,
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

const TIMESTAMPS = [
  { verse_start: 1, timestamp: 0 },
  { verse_start: 2, timestamp: 10 },
  { verse_start: 3, timestamp: 20 },
  { verse_start: 4, timestamp: 30 },
];

let session: MediaSessionStub;

const renderAndStartPlayback = async () => {
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

  await waitFor(() =>
    expect(FakeHowl.instances.length).toBeGreaterThan(0),
  );
  const howl = FakeHowl.instances[0];
  // The file finishes loading — only then is seek() a position.
  act(() => {
    howl.emit('load');
  });
  await waitFor(() => expect(howl._playing).toBe(true));
  await waitFor(() =>
    expect(session.handlers.has('nexttrack')).toBe(true),
  );
  return howl;
};

// The verse highlighter only runs once `timestamps` is populated
// in the component — waiting on audioActiveVerse guarantees the
// media controls closure sees the fetched timestamps.
const waitForTimestamps = async () => {
  await waitFor(() =>
    expect(
      useBibleStore.getState().audioActiveVerse?.verse,
    ).toBe(1),
  );
};

const pressTrackButton = (
  action: 'nexttrack' | 'previoustrack',
) => {
  act(() => {
    session.handlers.get(action)?.({ action });
  });
};

describe('Audio media session track controls', () => {
  beforeEach(() => {
    FakeHowl.reset();
    vi.clearAllMocks();
    mockDomApis();
    session = stubMediaSession();
    vi.stubGlobal(
      'MediaMetadata',
      class {
        init: unknown;
        constructor(init: unknown) {
          this.init = init;
        }
      },
    );
    // No CORS on the audio host — the preload streams the URL.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('CORS')),
    );
    useBibleStore.setState({
      ...initialState,
      activeBookId: 'JHN',
      activeChapter: 3,
      activeAudioFilesetId: 'ENGESVN1DA',
      activeTextFilesetId: 'ENGKJV',
    });
    useAuthStore.setState(authInitialState);
    vi.mocked(getAudioTimestamps).mockResolvedValue(TIMESTAMPS);
  });

  afterEach(() => {
    session.restore();
    vi.unstubAllGlobals();
  });

  it('nexttrack seeks to the next verse start', async () => {
    const howl = await renderAndStartPlayback();
    await waitForTimestamps();

    act(() => {
      howl.seek(12);
    });
    pressTrackButton('nexttrack');

    expect(howl._pos).toBe(20);
  });

  it('nexttrack on a verse boundary still advances', async () => {
    const howl = await renderAndStartPlayback();
    await waitForTimestamps();

    act(() => {
      howl.seek(20);
    });
    pressTrackButton('nexttrack');

    expect(howl._pos).toBe(30);
  });

  it('nexttrack in the last verse advances the chapter', async () => {
    const howl = await renderAndStartPlayback();
    await waitForTimestamps();

    act(() => {
      howl.seek(45);
    });
    pressTrackButton('nexttrack');

    await waitFor(() =>
      expect(useBibleStore.getState().activeChapter).toBe(4),
    );
  });

  it('previoustrack restarts the verse when >2s in', async () => {
    const howl = await renderAndStartPlayback();
    await waitForTimestamps();

    act(() => {
      howl.seek(15);
    });
    pressTrackButton('previoustrack');

    expect(howl._pos).toBe(10);
  });

  it('previoustrack near a verse start goes back a verse', async () => {
    const howl = await renderAndStartPlayback();
    await waitForTimestamps();

    act(() => {
      howl.seek(11);
    });
    pressTrackButton('previoustrack');

    expect(howl._pos).toBe(0);
  });

  it('previoustrack at verse 1 goes to the previous chapter', async () => {
    const howl = await renderAndStartPlayback();
    await waitForTimestamps();

    act(() => {
      howl.seek(1);
    });
    pressTrackButton('previoustrack');

    await waitFor(() =>
      expect(useBibleStore.getState().activeChapter).toBe(2),
    );
  });

  it('a repeat previoustrack keeps stepping back verses', async () => {
    // Regression: after landing on a verse start, the next
    // press used to hit the ">2s into verse" restart rule and
    // re-seek the SAME verse — the headphone double-tap bug.
    const howl = await renderAndStartPlayback();
    await waitForTimestamps();

    act(() => {
      howl.seek(35);
    });
    pressTrackButton('previoustrack');
    expect(howl._pos).toBe(30); // restart verse 4

    // ~3s into the landed verse, press again — must step back
    // to verse 3, not restart verse 4.
    act(() => {
      howl.seek(33.5);
    });
    pressTrackButton('previoustrack');
    expect(howl._pos).toBe(20);

    act(() => {
      howl.seek(20.8);
    });
    pressTrackButton('previoustrack');
    expect(howl._pos).toBe(10);
  });

  it('previoustrack after the chain window still restarts', async () => {
    const howl = await renderAndStartPlayback();
    await waitForTimestamps();

    act(() => {
      howl.seek(35);
    });
    pressTrackButton('previoustrack');
    expect(howl._pos).toBe(30);

    // Press well outside the 4s chain window — a fresh press
    // falls back to the standard restart convention.
    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.now() + 5000);
    try {
      act(() => {
        howl.seek(33.5);
      });
      pressTrackButton('previoustrack');
      expect(howl._pos).toBe(30);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('a direction change breaks the chain', async () => {
    const howl = await renderAndStartPlayback();
    await waitForTimestamps();

    act(() => {
      howl.seek(35);
    });
    pressTrackButton('previoustrack');
    expect(howl._pos).toBe(30);

    // Next-track right after a back-press must compute from
    // the live position (verse 4), not the backward chain —
    // so it lands on... the position-based next verse.
    act(() => {
      howl.seek(30.4);
    });
    pressTrackButton('nexttrack');
    // Past the last timestamp — advances the chapter.
    await waitFor(() =>
      expect(useBibleStore.getState().activeChapter).toBe(4),
    );
  });

  // Same flows against vendored production timestamps for the
  // self-hosted GLU8 recording (LVSGLU8C1DA, John 3) — guards
  // the nav math against real data shape: fractional seconds,
  // irregular verse lengths, no announcement row.
  describe('with real GLU8 timestamps (LVSGLU8C1DA)', () => {
    const renderGlu8 = async () => {
      useBibleStore.setState({
        activeAudioFilesetId: 'LVSGLU8C1DA',
      });
      vi.mocked(getAudioTimestamps).mockResolvedValue(
        GLU8_JHN3_TIMESTAMPS,
      );
      const howl = await renderAndStartPlayback();
      await waitFor(() =>
        expect(getAudioTimestamps).toHaveBeenCalledWith(
          'JHN',
          3,
          'LVSGLU8C1DA',
        ),
      );
      await waitForTimestamps();
      return howl;
    };

    it('previoustrack restarts a real verse mid-verse', async () => {
      const howl = await renderGlu8();
      // 3.5s into verse 25 (starts at 170.472).
      act(() => {
        howl.seek(174);
      });
      pressTrackButton('previoustrack');
      expect(howl._pos).toBe(170.472);
    });

    it('chained presses step through real verse boundaries', async () => {
      const howl = await renderGlu8();
      // Just into verse 25 — a single press lands on verse 24.
      act(() => {
        howl.seek(171);
      });
      pressTrackButton('previoustrack');
      expect(howl._pos).toBe(168.048);

      // Position readback still stale at 171 (the first seek
      // has not applied yet — the real-world failure mode).
      // Without chaining this would land back on verse 24.
      act(() => {
        howl.seek(171);
      });
      pressTrackButton('previoustrack');
      expect(howl._pos).toBe(159.144);
    });

    it('nexttrack lands on the next real verse start', async () => {
      const howl = await renderGlu8();
      act(() => {
        howl.seek(171);
      });
      pressTrackButton('nexttrack');
      expect(howl._pos).toBe(175.68);
    });

    it('restarts the real last verse when >2s in', async () => {
      const howl = await renderGlu8();
      act(() => {
        howl.seek(245);
      });
      pressTrackButton('previoustrack');
      expect(howl._pos).toBe(242.592);
    });
  });

  it('falls back to ±10s seeks without timestamps', async () => {
    vi.mocked(getAudioTimestamps).mockResolvedValue([]);
    const howl = await renderAndStartPlayback();

    act(() => {
      howl.seek(5);
    });
    pressTrackButton('nexttrack');
    expect(howl._pos).toBe(15);

    act(() => {
      howl.seek(5);
    });
    pressTrackButton('previoustrack');
    expect(howl._pos).toBe(0);
  });
});
