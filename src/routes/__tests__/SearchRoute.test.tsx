import React from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SearchRoute from '../SearchRoute';
import { useBibleStore, initialState } from '../../store';
import * as api from '../../api';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<
    typeof import('../../api')
  >('../../api');
  return { ...actual, searchBible: vi.fn() };
});

const mockSearchBible = vi.mocked(api.searchBible);

const MOCK_VERSES = [
  {
    book_id: 'ROM',
    chapter: 3,
    verse_start: 23,
    verse_text: 'for all have sinned',
  },
  {
    book_id: 'JHN',
    chapter: 3,
    verse_start: 16,
    verse_text: 'For God so loved the world',
  },
  {
    book_id: 'JHN',
    chapter: 1,
    verse_start: 1,
    verse_text: 'In the beginning was the Word',
  },
];

function renderSearch(search = '?q=grace') {
  useBibleStore.setState({
    ...initialState,
    activeTextFilesetId: 'ENGESH',
    audioPlaylistItems: null,
  });
  return render(
    <MemoryRouter initialEntries={[`/search${search}`]}>
      <Routes>
        <Route path="/search" element={<SearchRoute />} />
        <Route
          path="/bible/:book/:chapterVerse"
          element={<div data-testid="bible-page" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function setupDomMocks() {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
}

describe('SearchRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDomMocks();
  });

  it('renders search input on empty route', () => {
    mockSearchBible.mockResolvedValue({ verses: [], meta: {} });
    renderSearch('');
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByText('Search Bible')).toBeInTheDocument();
  });

  it('calls searchBible when q param is present', async () => {
    mockSearchBible.mockResolvedValue({ verses: [], meta: {} });
    renderSearch('?q=grace');
    await waitFor(() => {
      expect(mockSearchBible).toHaveBeenCalledWith(
        'grace',
        'ENGESH',
        1,
        50,
        expect.any(AbortSignal),
      );
    });
  });

  it('groups results by book in canonical order', async () => {
    mockSearchBible.mockResolvedValue({
      verses: MOCK_VERSES,
      meta: {},
    });
    renderSearch();
    await waitFor(() => {
      expect(screen.getByText('John')).toBeInTheDocument();
      expect(screen.getByText('Romans')).toBeInTheDocument();
    });
    const allText = screen.getAllByRole('button').map(
      (b) => b.textContent ?? '',
    );
    const johnIdx = allText.findIndex((t) => t.includes('John'));
    const romIdx = allText.findIndex((t) => t.includes('Romans'));
    expect(johnIdx).toBeLessThan(romIdx);
  });

  it('populates audioPlaylistItems with all results in canonical order', async () => {
    mockSearchBible.mockResolvedValue({
      verses: MOCK_VERSES,
      meta: {},
    });
    renderSearch();
    await waitFor(() => {
      const items = useBibleStore.getState().audioPlaylistItems;
      expect(items?.length).toBe(3);
      expect(items?.[0].book).toBe('Romans');
      expect(items?.[1].book).toBe('John');
    });
  });

  it('shows "Show N more" button when book has > 5 results', async () => {
    const manyVerses = Array.from({ length: 7 }, (_, i) => ({
      book_id: 'JHN',
      chapter: 1,
      verse_start: i + 1,
      verse_text: `Verse ${i + 1}`,
    }));
    mockSearchBible.mockResolvedValue({
      verses: manyVerses,
      meta: {},
    });
    renderSearch();
    await waitFor(() =>
      expect(screen.getByText(/Show 2 more verses/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText(/Show 2 more verses/));
    await waitFor(() => {
      expect(
        screen.queryByText(/Show.*more verse/),
      ).not.toBeInTheDocument();
    });
  });

  it('clicking a verse play button sets single-item playlist', async () => {
    mockSearchBible.mockResolvedValue({
      verses: [MOCK_VERSES[1]],
      meta: {},
    });
    renderSearch();
    const playBtn = await screen.findByLabelText('play-JHN-3-16');
    await act(async () => {
      fireEvent.click(playBtn);
    });
    const items = useBibleStore.getState().audioPlaylistItems;
    expect(items).toHaveLength(1);
    expect(items?.[0]).toMatchObject({
      itemId: 'search-JHN-3-16',
      book: 'John',
      chapter: 3,
      startVerse: 16,
      endVerse: 16,
    });
  });

  it('clicking a verse navigates to chapter.verse URL', async () => {
    mockSearchBible.mockResolvedValue({
      verses: [MOCK_VERSES[1]],
      meta: {},
    });
    renderSearch();
    await waitFor(() =>
      expect(screen.getByText('For God so loved the world')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('For God so loved the world'));
    await waitFor(() =>
      expect(screen.getByTestId('bible-page')).toBeInTheDocument(),
    );
  });

  it('shows no-results message for empty response', async () => {
    mockSearchBible.mockResolvedValue({ verses: [], meta: {} });
    renderSearch('?q=xyzzy');
    await waitFor(() => {
      expect(
        screen.getByText(/No results found/),
      ).toBeInTheDocument();
    });
  });

  it('shows error message on fetch failure', async () => {
    mockSearchBible.mockRejectedValue(
      new Error('Network error'),
    );
    renderSearch();
    await waitFor(() => {
      expect(
        screen.getByText('Network error'),
      ).toBeInTheDocument();
    });
  });

  it('shows pagination when total_pages > 1', async () => {
    mockSearchBible.mockResolvedValue({
      verses: MOCK_VERSES,
      meta: {
        pagination: {
          total: 100,
          count: 3,
          per_page: 50,
          current_page: 1,
          total_pages: 3,
        },
      },
    });
    renderSearch();
    await waitFor(() => {
      expect(screen.getByText('John')).toBeInTheDocument();
    });
    const pageBtn = screen
      .getAllByRole('button')
      .find((b) => b.textContent?.trim() === '2');
    expect(pageBtn).toBeDefined();
  });
});
