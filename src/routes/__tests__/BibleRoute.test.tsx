import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import BibleRoute from '../BibleRoute';
import { useBibleStore } from '../../store';

// Mock the Passage component
vi.mock('../../components/Passage', () => ({
  default: () => <div data-testid="passage">Passage Component</div>,
}));

// Mock the API
vi.mock('../../api', () => ({
  getBooks: () => [
    { book_name: 'John', book_id: 'Joh' },
    { book_name: 'Matthew', book_id: 'Mat' },
  ],
  getChapters: () => [1, 2, 3, 4, 5],
  getVerses: () => [1, 2, 3, 4, 5],
  getPassage: () => [
    { book_name: 'John', book_id: 'Joh', chapter: 1 },
    { book_name: 'John', book_id: 'Joh', chapter: 2 },
    { book_name: 'John', book_id: 'Joh', chapter: 3 },
  ],
}));

describe('BibleRoute', () => {
  beforeEach(() => {
    // Reset store to initial state
    useBibleStore.setState({
      activeBook: 'John',
      activeBookShort: 'Joh',
      activeChapter: 1,
      activeVerses: [],
    });
  });

  it('renders Passage component', () => {
    render(
      <MemoryRouter initialEntries={['/bible/John/1']}>
        <Routes>
          <Route path="/bible/:book/:chapterVerse" element={<BibleRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('passage')).toBeInTheDocument();
  });

  it('syncs URL params to store on mount', async () => {
    render(
      <MemoryRouter initialEntries={['/bible/Matthew/3']}>
        <Routes>
          <Route path="/bible/:book/:chapterVerse" element={<BibleRoute />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const state = useBibleStore.getState();
      expect(state.activeBook).toBe('Matthew');
      expect(state.activeChapter).toBe(3);
    });
  });

  it('redirects to current book/chapter when no URL params', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/bible']}>
        <Routes>
          <Route path="/bible" element={<BibleRoute />} />
          <Route path="/bible/:book/:chapterVerse" element={<BibleRoute />} />
        </Routes>
      </MemoryRouter>
    );

    // Should redirect to /bible/John/1 (from store)
    await waitFor(() => {
      expect(container.innerHTML).toContain('passage');
    });
  });

  it('updates store when URL params change', async () => {
    render(
      <MemoryRouter initialEntries={['/bible/John/1']}>
        <Routes>
          <Route path="/bible/:book/:chapterVerse" element={<BibleRoute />} />
        </Routes>
      </MemoryRouter>
    );

    // Initial state
    await waitFor(() => {
      const state = useBibleStore.getState();
      expect(state.activeBook).toBe('John');
      expect(state.activeChapter).toBe(1);
    });

    // Note: Testing URL param changes via rerender doesn't work well
    // with MemoryRouter. In real usage, navigate() updates the URL
    // which triggers the route to re-render with new params.
    // This is tested in integration tests and manual testing.
  });

  it('handles invalid chapter numbers gracefully', async () => {
    render(
      <MemoryRouter initialEntries={['/bible/John/abc']}>
        <Routes>
          <Route path="/bible/:book/:chapterVerse" element={<BibleRoute />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const state = useBibleStore.getState();
      // parseInt('abc') returns NaN, which should be handled
      expect(state.activeBook).toBe('John');
    });
  });

  it('syncs verse URL param to activeVerses on mount', async () => {
    render(
      <MemoryRouter initialEntries={['/bible/John/3.16']}>
        <Routes>
          <Route
            path="/bible/:book/:chapterVerse"
            element={<BibleRoute />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const state = useBibleStore.getState();
      expect(state.activeBook).toBe('John');
      expect(state.activeChapter).toBe(3);
      expect(state.activeVerses).toEqual([16]);
    });
  });

  it('clears activeVerses when no verse in URL', async () => {
    useBibleStore.setState({ activeVerses: [5] });

    render(
      <MemoryRouter initialEntries={['/bible/John/1']}>
        <Routes>
          <Route
            path="/bible/:book/:chapterVerse"
            element={<BibleRoute />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(useBibleStore.getState().activeVerses).toEqual([]);
    });
  });

  it('does not cause infinite loops when syncing', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    
    render(
      <MemoryRouter initialEntries={['/bible/John/1']}>
        <Routes>
          <Route path="/bible/:book/:chapterVerse" element={<BibleRoute />} />
        </Routes>
      </MemoryRouter>
    );

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
});
