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
      activeBook: 'John',
      activeBookShort: 'Joh',
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
        <MemoryRouter initialEntries={['/bible/John/1']}>
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
      console.log('SEL', JSON.stringify(sel()));
      expect(sel()?.refs).toHaveLength(2);
    });
    const v3 = screen.getByTitle('passage-verse-1-3')
      .parentElement as HTMLElement;
    const v5 = screen.getByTitle('passage-verse-1-5')
      .parentElement as HTMLElement;
    console.log(
      'v3 active=',
      v3.dataset.active,
      'v5 active=',
      v5.dataset.active
    );
  });
});
