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
