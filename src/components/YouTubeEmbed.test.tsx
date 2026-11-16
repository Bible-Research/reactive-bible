import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import YouTubeEmbed from './YouTubeEmbed';
import { renderWithProviders } from '../__tests__/helpers';

const VIDEO_ID = 'dQw4w9WgXcQ';

function renderEmbed() {
  return renderWithProviders(
    <YouTubeEmbed videoId={VIDEO_ID} title="Tour of the app" />,
  );
}

describe('YouTubeEmbed', () => {
  it('renders a thumbnail facade, not a player iframe', () => {
    renderEmbed();

    expect(
      document.querySelector('iframe'),
    ).not.toBeInTheDocument();
    const img = document.querySelector('img');
    expect(img).toHaveAttribute(
      'src',
      `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
    );
    expect(
      screen.getByRole('button', {
        name: 'Play video: Tour of the app',
      }),
    ).toBeInTheDocument();
  });

  it('swaps in a nocookie autoplay iframe on activation', async () => {
    const user = userEvent.setup();
    renderEmbed();

    await user.click(
      screen.getByRole('button', {
        name: 'Play video: Tour of the app',
      }),
    );

    const iframe = document.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute(
      'src',
      `https://www.youtube-nocookie.com/embed/` +
        `${VIDEO_ID}?autoplay=1&rel=0`,
    );
    expect(iframe).toHaveAttribute('title', 'Tour of the app');
    // The facade must not come back once the player loaded.
    expect(
      screen.queryByRole('button', {
        name: 'Play video: Tour of the app',
      }),
    ).not.toBeInTheDocument();
  });

  it('links to the same video on youtube.com in a new tab', () => {
    renderEmbed();

    const link = screen.getByRole('link', {
      name: 'Watch on YouTube',
    });
    expect(link).toHaveAttribute(
      'href',
      `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute(
      'rel',
      expect.stringContaining('noopener'),
    );
  });
});
