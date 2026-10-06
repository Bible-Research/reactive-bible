import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../App';
import { useBibleStore } from '../store';

/**
 * Regression coverage for issue #63: changing the chapter must
 * reset the passage scroll position so the first verse is shown,
 * instead of keeping the scroll offset of the previous chapter.
 *
 * KJV (and cache-hit) chapters resolve without a visible loading
 * phase, so the ScrollArea used to stay mounted and retain its
 * scrollTop. The ScrollArea is now keyed by book+chapter, forcing
 * a fresh viewport (scrollTop 0) on every chapter change. In
 * happy-dom there is no layout, so the observable signal is that
 * the viewport DOM node is replaced.
 */
const viewportFor = (verseTitle: string) =>
  screen
    .getByTitle(verseTitle)
    .closest('.mantine-ScrollArea-viewport');

const renderApp = (initialEntry: string) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>
  );

describe('Passage scroll resets on chapter change (#63)', () => {
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

  it('remounts the scroll viewport on next-chapter click', async () => {
    renderApp('/bible/JHN.1');

    await waitFor(
      () => {
        expect(
          screen.getByTitle('passage-verse-1-1')
        ).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
    const before = viewportFor('passage-verse-1-1');
    expect(before).not.toBeNull();

    await userEvent.click(screen.getByTitle('next-passage-button'));

    await waitFor(
      () => {
        expect(
          screen.getByTitle('passage-verse-2-1')
        ).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
    const after = viewportFor('passage-verse-2-1');
    expect(after).not.toBeNull();
    // A fresh viewport starts at scrollTop 0 (first verse),
    // not at the previous chapter's scroll offset.
    expect(after).not.toBe(before);
    expect((after as HTMLElement).scrollTop).toBe(0);
  });

  it('remounts the scroll viewport on prev-chapter click', async () => {
    renderApp('/bible/JHN.2');

    await waitFor(
      () => {
        expect(
          screen.getByTitle('passage-verse-2-1')
        ).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
    const before = viewportFor('passage-verse-2-1');
    expect(before).not.toBeNull();

    await userEvent.click(screen.getByTitle('prev-passage-button'));

    await waitFor(
      () => {
        expect(
          screen.getByTitle('passage-verse-1-1')
        ).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
    const after = viewportFor('passage-verse-1-1');
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
    expect((after as HTMLElement).scrollTop).toBe(0);
  });
});
