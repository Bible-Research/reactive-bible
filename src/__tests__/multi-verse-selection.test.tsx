/**
 * Regression coverage for multi-verse selection bugs: clicking
 * verses in the bible view must accumulate into `verseSelection`
 * instead of replacing or dropping earlier picks. Added in
 * commit 80020a4 ("reproduction tests for multi-verse selection
 * bugs"); no issue number was recoverable from git history.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { useBibleStore } from '../store';

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const sel = () => useBibleStore.getState().verseSelection;

describe('multi verse selection in full App', () => {
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

  it('keeps both verses selected after two clicks', async () => {
    const user = userEvent.setup();
    render(
      <React.StrictMode>
        <MemoryRouter initialEntries={['/bible/JHN.1']}>
          <App />
        </MemoryRouter>
      </React.StrictMode>
    );
    await waitFor(
      () =>
        expect(
          screen.getByTitle('passage-verse-1-3')
        ).toBeInTheDocument(),
      { timeout: 5000 }
    );
    // Click the verse TEXT (h3), like a real user would
    await user.click(screen.getByTitle('passage-verse-1-3'));
    await waitFor(() => expect(sel()?.refs).toHaveLength(1));
    await user.click(screen.getByTitle('passage-verse-1-5'));
    await waitFor(() => {
      expect(sel()?.refs).toEqual([
        { bookId: 'JHN', chapter: 1, verse: 3 },
        { bookId: 'JHN', chapter: 1, verse: 5 },
      ]);
    });
    const v3 = screen.getByTitle('passage-verse-1-3')
      .parentElement as HTMLElement;
    const v5 = screen.getByTitle('passage-verse-1-5')
      .parentElement as HTMLElement;
    // Both clicked verses must carry the active marker.
    expect(v3.dataset.active).toBe('true');
    expect(v5.dataset.active).toBe('true');
  });
});
