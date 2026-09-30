import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import BibleRoute from '../BibleRoute';
import LegacyBibleRedirect from '../LegacyBibleRedirect';
import { useBibleStore } from '../../store';

// Mock the Passage component
vi.mock('../../components/Passage', () => ({
  default: () => <div data-testid="passage">Passage Component</div>,
}));

// Mock the API
vi.mock('../../api', () => ({
  getBooks: () => [
    { book_name: 'John', book_id: 'JHN' },
    { book_name: 'Matthew', book_id: 'MAT' },
  ],
  getChapters: () => [1, 2, 3, 4, 5],
  getVerses: () => [1, 2, 3, 4, 5],
  getPassage: () => [
    { book_name: 'John', book_id: 'JHN', chapter: 1 },
    { book_name: 'John', book_id: 'JHN', chapter: 2 },
    { book_name: 'John', book_id: 'JHN', chapter: 3 },
  ],
}));

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

const renderRoutes = (entries: string[]) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/bible" element={<BibleRoute />} />
        <Route path="/bible/:ref" element={<BibleRoute />} />
        <Route
          path="/bible/:book/:chapterVerse"
          element={<LegacyBibleRedirect />}
        />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

describe('BibleRoute', () => {
  beforeEach(() => {
    // Reset store to initial state
    useBibleStore.setState({
      activeBookId: 'JHN',
      activeChapter: 1,
      verseSelection: null,
    });
  });

  it('renders Passage component', () => {
    renderRoutes(['/bible/JHN.1']);
    expect(screen.getByTestId('passage')).toBeInTheDocument();
  });

  it('syncs URL params to store on mount', async () => {
    renderRoutes(['/bible/MAT.3']);

    await waitFor(() => {
      const state = useBibleStore.getState();
      expect(state.activeBookId).toBe('MAT');
      expect(state.activeChapter).toBe(3);
    });
  });

  it('redirects to current book/chapter when no URL params', async () => {
    renderRoutes(['/bible']);

    // Should redirect to /bible/JHN.1 (from store)
    await waitFor(() => {
      expect(screen.getByTestId('passage')).toBeInTheDocument();
    });
    const state = useBibleStore.getState();
    expect(state.activeBookId).toBe('JHN');
    expect(state.activeChapter).toBe(1);
  });

  it('handles invalid chapter numbers gracefully', async () => {
    renderRoutes(['/bible/JHN.abc']);

    // Unparseable ref falls back to /bible -> /bible/JHN.1
    await waitFor(() => {
      expect(screen.getByTestId('passage')).toBeInTheDocument();
      expect(useBibleStore.getState().activeBookId).toBe('JHN');
    });
  });

  it('syncs verse URL param to verseSelection on mount', async () => {
    renderRoutes(['/bible/JHN.3.16']);

    await waitFor(() => {
      const state = useBibleStore.getState();
      expect(state.activeBookId).toBe('JHN');
      expect(state.activeChapter).toBe(3);
      expect(state.verseSelection).toEqual({
        scope: 'bible',
        refs: [{ bookId: 'JHN', chapter: 3, verse: 16 }],
      });
    });
  });

  it('preserves multi-range verse selections from the URL', async () => {
    renderRoutes(['/bible/JHN.3.16-18,20']);

    await waitFor(() => {
      const state = useBibleStore.getState();
      expect(state.verseSelection).toEqual({
        scope: 'bible',
        refs: [16, 17, 18, 20].map((verse) => ({
          bookId: 'JHN',
          chapter: 3,
          verse,
        })),
      });
    });
  });

  it('clears verseSelection when no verse in URL', async () => {
    useBibleStore.setState({
      verseSelection: {
        scope: 'bible',
        refs: [{ bookId: 'JHN', chapter: 1, verse: 5 }],
      },
    });

    renderRoutes(['/bible/JHN.1']);

    await waitFor(() => {
      expect(useBibleStore.getState().verseSelection).toBeNull();
    });
  });

  it('does not cause infinite loops when syncing', async () => {
    const consoleSpy = vi.spyOn(console, 'log');

    renderRoutes(['/bible/JHN.1']);

    await waitFor(() => {
      expect(screen.getByTestId('passage')).toBeInTheDocument();
    });

    // Count how many times sync happened
    const syncLogs = consoleSpy.mock.calls.filter(
      (call) => call[0]?.includes('Syncing URL to store')
    );

    // Should only sync once or twice, not hundreds of times
    expect(syncLogs.length).toBeLessThan(5);

    consoleSpy.mockRestore();
  });

  it('redirects lowercase refs to canonical form', async () => {
    renderRoutes(['/bible/jhn.3']);

    await waitFor(() => {
      expect(screen.getByTestId('passage')).toBeInTheDocument();
      const state = useBibleStore.getState();
      expect(state.activeBookId).toBe('JHN');
      expect(state.activeChapter).toBe(3);
    });
  });

  it('redirects a bare book ref to chapter 1', async () => {
    renderRoutes(['/bible/JHN']);

    await waitFor(() => {
      expect(screen.getByTestId('passage')).toBeInTheDocument();
      const state = useBibleStore.getState();
      expect(state.activeBookId).toBe('JHN');
      expect(state.activeChapter).toBe(1);
    });
  });

  it('redirects invalid refs to /bible', async () => {
    renderRoutes(['/bible/FOO.1']);

    await waitFor(() => {
      expect(screen.getByTestId('passage')).toBeInTheDocument();
      const state = useBibleStore.getState();
      expect(state.activeBookId).toBe('JHN');
      expect(state.activeChapter).toBe(1);
    });
  });
});

describe('LegacyBibleRedirect', () => {
  beforeEach(() => {
    useBibleStore.setState({
      activeBookId: 'JHN',
      activeChapter: 1,
      verseSelection: null,
    });
  });

  it('redirects /bible/John/3 to /bible/JHN.3', async () => {
    renderRoutes(['/bible/John/3']);

    await waitFor(() => {
      expect(screen.getByTestId('passage')).toBeInTheDocument();
      const state = useBibleStore.getState();
      expect(state.activeBookId).toBe('JHN');
      expect(state.activeChapter).toBe(3);
    });
  });

  it('redirects /bible/1 Corinthians/1 to /bible/1CO.1', async () => {
    renderRoutes(['/bible/1%20Corinthians/1']);

    await waitFor(() => {
      expect(screen.getByTestId('passage')).toBeInTheDocument();
      const state = useBibleStore.getState();
      expect(state.activeBookId).toBe('1CO');
      expect(state.activeChapter).toBe(1);
    });
  });

  it('redirects legacy verse refs preserving verses', async () => {
    renderRoutes(['/bible/John/3.16-18']);

    await waitFor(() => {
      expect(screen.getByTestId('passage')).toBeInTheDocument();
      const state = useBibleStore.getState();
      expect(state.verseSelection?.refs).toHaveLength(3);
    });
  });

  it('redirects Song of Solomon names', async () => {
    renderRoutes(['/bible/Song%20of%20Solomon/1']);

    await waitFor(() => {
      expect(screen.getByTestId('passage')).toBeInTheDocument();
      expect(useBibleStore.getState().activeBookId).toBe('SNG');
    });
  });

  it('redirects unknown legacy names to /bible', async () => {
    renderRoutes(['/bible/NotABook/3']);

    await waitFor(() => {
      expect(screen.getByTestId('passage')).toBeInTheDocument();
      expect(useBibleStore.getState().activeBookId).toBe('JHN');
    });
  });
});
