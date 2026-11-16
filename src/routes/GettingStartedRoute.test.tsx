import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import GettingStartedRoute from './GettingStartedRoute';

// A mixed catalogue exercises the filter: `unrecorded` has no
// video id and must never render, while the other two keep
// their catalogue order.
vi.mock('../data/gettingStartedVideos', () => ({
  TUTORIAL_VIDEOS: [
    {
      id: 'unrecorded',
      title: 'Script not yet recorded',
      description: 'No video id yet.',
      youtubeId: null,
    },
    {
      id: 'first-video',
      title: 'First published video',
      description: 'First.',
      youtubeId: 'dQw4w9WgXcQ',
    },
    {
      id: 'second-video',
      title: 'Second published video',
      description: 'Second.',
      youtubeId: '9bZkp7q19f0',
    },
  ],
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
});
