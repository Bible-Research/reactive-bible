/**
 * Regression test for the sidebar book-switch race: the old
 * `setActiveBookWithPosition` wrote activeBookId/activeChapter
 * BEFORE navigate() ran, so a commit could render BibleRoute's
 * URL->store sync with the stale URL + new book and revert the
 * store. The follow-up navigate then used the reverted chapter —
 * landing on the wrong chapter (JHN.3 -> EXO.3) or, when the
 * reverted chapter exceeds the target book's length
 * (PSA.119 -> EXO), getting rejected by parseBibleRef and
 * bouncing back to the OLD book: the previous book stayed
 * highlighted, the clicked book kept :focus styling, and the
 * chapters column still listed the previous book's chapters.
 *
 * The fix: `prepareBookSwitch` only resolves the saved position
 * (no activeBookId write); navigate() then lets the URL->store
 * sync write the book — the same URL-first rule
 * `useChapterAudio.goToChapter` already follows.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { Routes, Route, MemoryRouter, useLocation } from 'react-router-dom';
import { render } from '@testing-library/react';
import BibleSelector from '../components/BibleSelector';
import BibleRoute from '../routes/BibleRoute';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
import { mockDomApis } from './helpers';

const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
};

const renderApp = (initialPath: string) => {
  mockDomApis();
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationProbe />
      <BibleSelector
        opened={true}
        setOpened={() => undefined}
      />
      <Routes>
        <Route path="/bible/:ref?" element={<BibleRoute />} />
      </Routes>
    </MemoryRouter>
  );
};

const activeBookTitles = () =>
  [
    ...document.querySelectorAll(
      '[title^="nav-book-"][data-active="true"]'
    ),
  ].map((b) => b.getAttribute('title'));

describe('sidebar book switch', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: false });
    useBibleStore.setState({
      verseSelection: null,
      readingPositions: {},
      pendingScrollVerse: null,
      audioActiveVerse: null,
    });
  });

  it('JHN.3 -> EXO lands on EXO.1 (position chapter, not the ' +
    'stale URL chapter)', async () => {
    useBibleStore.setState({
      activeBookId: 'JHN', activeChapter: 3,
    });
    renderApp('/bible/JHN.3');
    await waitFor(() =>
      expect(useBibleStore.getState().activeBookId).toBe('JHN')
    );

    await userEvent.click(screen.getByText('Exodus'));

    await waitFor(() => {
      expect(useBibleStore.getState().activeBookId).toBe('EXO');
      expect(useBibleStore.getState().activeChapter).toBe(1);
    });
    expect(screen.getByTestId('loc').textContent)
      .toBe('/bible/EXO.1');
    expect(activeBookTitles()).toEqual(['nav-book-EXO']);
    // Exodus has 40 chapters — the column must show ITS list.
    expect(
      screen.getByTitle('nav-chapter-40')
    ).toBeInTheDocument();
  });

  it('PSA.119 -> EXO lands on EXO.1 instead of bouncing back ' +
    'to PSA.119', async () => {
    useBibleStore.setState({
      activeBookId: 'PSA', activeChapter: 119,
    });
    renderApp('/bible/PSA.119');
    await waitFor(() =>
      expect(useBibleStore.getState().activeBookId).toBe('PSA')
    );

    await userEvent.click(screen.getByText('Exodus'));

    await waitFor(() => {
      expect(useBibleStore.getState().activeBookId).toBe('EXO');
      expect(useBibleStore.getState().activeChapter).toBe(1);
    });
    expect(screen.getByTestId('loc').textContent)
      .toBe('/bible/EXO.1');
    expect(activeBookTitles()).toEqual(['nav-book-EXO']);
    expect(
      screen.getByTitle('nav-chapter-40')
    ).toBeInTheDocument();
    expect(
      screen.queryByTitle('nav-chapter-150')
    ).not.toBeInTheDocument();
  });
});
