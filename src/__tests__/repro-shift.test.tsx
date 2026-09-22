import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { useBibleStore } from '../store';

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const sel = () => useBibleStore.getState().verseSelection;

describe('shift+click range selection in full App', () => {
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

  it('selects range 3..6 after click 3 then shift+click 6',
    async () => {
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
      await user.click(screen.getByTitle('passage-verse-1-3'));
      await waitFor(() => expect(sel()?.refs).toHaveLength(1));

      await user.keyboard('{Shift>}');
      await user.click(screen.getByTitle('passage-verse-1-6'));
      await user.keyboard('{/Shift}');
      await waitFor(() => {
        // eslint-disable-next-line no-console
        console.log('SEL', JSON.stringify(sel()));
        expect(sel()?.refs).toHaveLength(4);
      });
    });
});
