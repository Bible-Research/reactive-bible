import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../../App';
import { useBibleStore } from '../../store';

/**
 * Regression coverage for issue #95: the book/chapter title in the
 * bottom nav must stay in sync with the visited passage — both when
 * landing on a /bible/:ref URL directly and when navigating via the
 * chapter buttons.
 */
const bottomNavTitle = () =>
  screen
    .getAllByRole('heading', { level: 4 })
    .find((t) => /^[A-Z0-9]{3} \d+$/.test(t.textContent ?? ''));

const renderApp = (initialEntry: string) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>
  );

describe('BottomNav book/chapter title stays in sync (#95)', () => {
  beforeEach(() => {
    useBibleStore.setState({
      activeBookId: 'JHN',
      activeChapter: 1,
      verseSelection: null,
      bibleVersion: 'KJV',
      activeTextFilesetId: 'ENGKJV',
      activeAudioFilesetId: null,
    });
  });

  it('updates when visiting a URL for another chapter', async () => {
    renderApp('/bible/MAT.5');

    await waitFor(
      () => {
        expect(bottomNavTitle()?.textContent).toBe('MAT 5');
      },
      { timeout: 5000 }
    );
  });

  it('updates when visiting a URL with a verse ref', async () => {
    renderApp('/bible/ROM.8.28');

    await waitFor(
      () => {
        expect(bottomNavTitle()?.textContent).toBe('ROM 8');
      },
      { timeout: 5000 }
    );
  });

  it('updates when clicking the next-chapter button', async () => {
    renderApp('/bible/JHN.1');

    await waitFor(
      () => {
        expect(bottomNavTitle()?.textContent).toBe('JHN 1');
      },
      { timeout: 5000 }
    );

    await userEvent.click(screen.getByTitle('next-passage-button'));

    await waitFor(
      () => {
        expect(bottomNavTitle()?.textContent).toBe('JHN 2');
      },
      { timeout: 5000 }
    );
  });
});
