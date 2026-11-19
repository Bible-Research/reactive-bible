import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import i18n from '../i18n';
import { useBibleStore } from '../store';
import GettingStartedRoute from './GettingStartedRoute';

// A mutable catalogue: `unrecorded` has no video id in any
// locale and must never render, while the other entries keep
// their catalogue order. Tests mutate `videos` in place
// (splice), so the array reference the mock exports stays the
// same object.
const catalogue = vi.hoisted(() => {
  const defaults = [
    {
      id: 'unrecorded',
      youtubeIds: {} as Record<string, string>,
    },
    {
      id: 'first-video',
      youtubeIds: {
        en: 'dQw4w9WgXcQ',
        lv: 'lvFirstVid1',
      } as Record<string, string>,
    },
    {
      id: 'second-video',
      youtubeIds: {
        en: '9bZkp7q19f0',
      } as Record<string, string>,
    },
  ];
  return { defaults, videos: [...defaults] };
});

vi.mock('../data/gettingStartedVideos', () => ({
  TUTORIAL_VIDEOS: catalogue.videos,
}));

function renderRoute(path = '/getting-started') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/getting-started"
          element={<GettingStartedRoute />}
        />
        <Route
          path="/login"
          element={<div data-testid="login-page" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GettingStartedRoute', () => {
  beforeAll(() => {
    // Mock-catalogue ids need test-only catalog entries so card
    // titles/descriptions render deterministically.
    i18n.addResourceBundle(
      'en',
      'common',
      {
        tutorials: {
          'first-video': {
            title: 'First published video',
            description: 'First.',
          },
          'second-video': {
            title: 'Second published video',
            description: 'Second.',
          },
          unrecorded: {
            title: 'Script not yet recorded',
            description: 'No video id yet.',
          },
        },
      },
      true,
      true,
    );
  });

  beforeEach(() => {
    catalogue.videos.splice(
      0,
      catalogue.videos.length,
      ...catalogue.defaults,
    );
    useBibleStore.setState({ uiLanguage: 'en' });
  });

  afterEach(() => {
    useBibleStore.setState({ uiLanguage: 'en' });
    void i18n.changeLanguage('en');
  });

  it('renders anonymously at /getting-started without redirect', () => {
    renderRoute();

    expect(
      screen.getByRole('heading', { name: 'Getting started' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('login-page'),
    ).not.toBeInTheDocument();
  });

  it('renders only id-bearing entries, in catalogue order', () => {
    renderRoute();

    expect(
      screen.queryByText('Script not yet recorded'),
    ).not.toBeInTheDocument();

    const cards = screen.getAllByRole('heading', { level: 3 });
    expect(cards.map((h) => h.textContent)).toEqual([
      'First published video',
      'Second published video',
    ]);
  });

  it('shows a facade per card, not eager iframes', () => {
    renderRoute();

    expect(
      document.querySelector('iframe'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Play video: First published video',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Play video: Second published video',
      }),
    ).toBeInTheDocument();
  });

  it('prefers the Latvian recording when the UI is Latvian', () => {
    useBibleStore.setState({ uiLanguage: 'lv' });
    renderRoute();

    const thumbs = Array.from(
      document.querySelectorAll('img'),
    ).map((img) => img.getAttribute('src'));
    expect(
      thumbs.some((s) => s?.includes('lvFirstVid1')),
    ).toBe(true);
    expect(
      thumbs.some((s) => s?.includes('dQw4w9WgXcQ')),
    ).toBe(false);
  });

  it('falls back to the English video when the active locale ' +
    'lacks its own', () => {
    useBibleStore.setState({ uiLanguage: 'ru' });
    renderRoute();

    const thumbs = Array.from(
      document.querySelectorAll('img'),
    ).map((img) => img.getAttribute('src'));
    // Neither entry has a ru recording — both English ids show.
    expect(
      thumbs.some((s) => s?.includes('dQw4w9WgXcQ')),
    ).toBe(true);
    expect(
      thumbs.some((s) => s?.includes('9bZkp7q19f0')),
    ).toBe(true);
  });

  it('shows an empty state while no entry has a video id', () => {
    catalogue.videos.splice(0, catalogue.videos.length);
    renderRoute();

    expect(
      screen.getByText(
        'Tutorials are being recorded — check back soon.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryAllByRole('heading', { level: 3 }),
    ).toHaveLength(0);
  });

  it('hides the empty state once any video is published', () => {
    renderRoute();

    expect(
      screen.queryByText(
        'Tutorials are being recorded — check back soon.',
      ),
    ).not.toBeInTheDocument();
  });
});
