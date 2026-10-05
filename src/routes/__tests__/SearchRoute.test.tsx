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
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import SearchRoute from '../SearchRoute';
import { useBibleStore, initialState } from '../../store';
import * as api from '../../api';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<
    typeof import('../../api')
  >('../../api');
  return { ...actual, searchBibleGrouped: vi.fn() };
});

const mockSearchBibleGrouped = vi.mocked(api.searchBibleGrouped);

const MOCK_GROUPS = [
  {
    book_id: 'JHN',
    count: 2,
    verses: [
      {
        book_id: 'JHN',
        chapter: 1,
        verse_start: 1,
        verse_text: 'In the beginning was the Word',
      },
      {
        book_id: 'JHN',
        chapter: 3,
        verse_start: 16,
        verse_text: 'For God so loved the world',
      },
    ],
  },
  {
    book_id: 'ROM',
    count: 1,
    verses: [
      {
        book_id: 'ROM',
        chapter: 3,
        verse_start: 23,
        verse_text: 'for all have sinned',
      },
    ],
  },
];

const EMPTY_RESULT = {
  groups: [],
  meta: { total: 0, truncated: false },
};

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

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
          path="/bible/:ref"
          element={<div data-testid="bible-page" />}
        />
      </Routes>
      <LocationDisplay />
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
  global.ResizeObserver = vi.fn().mockImplementation(function () {
    return {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    };
  });
}

describe('SearchRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDomMocks();
  });

  it('renders search input on empty route', () => {
    mockSearchBibleGrouped.mockResolvedValue(EMPTY_RESULT);
    renderSearch('');
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByText('Search Bible')).toBeInTheDocument();
  });

  it('calls searchBibleGrouped when q param is present', async () => {
    mockSearchBibleGrouped.mockResolvedValue(EMPTY_RESULT);
    renderSearch('?q=grace');
    await waitFor(() => {
      expect(mockSearchBibleGrouped).toHaveBeenCalledWith(
        'grace',
        'ENGESH',
        expect.any(AbortSignal),
      );
    });
  });

  it('does not search while typing; searches on click', async () => {
    mockSearchBibleGrouped.mockResolvedValue(EMPTY_RESULT);
    renderSearch('');
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'faith' } });
    expect(mockSearchBibleGrouped).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('search-button'));
    await waitFor(() => {
      expect(mockSearchBibleGrouped).toHaveBeenCalledWith(
        'faith',
        'ENGESH',
        expect.any(AbortSignal),
      );
    });
  });

  it('renders a group header per book with its count', async () => {
    mockSearchBibleGrouped.mockResolvedValue({
      groups: MOCK_GROUPS,
      meta: { total: 3, truncated: false },
    });
    renderSearch();
    await waitFor(() => {
      expect(screen.getByText('John')).toBeInTheDocument();
      expect(screen.getByText('Romans')).toBeInTheDocument();
    });
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(screen.getByText('(1)')).toBeInTheDocument();
    // Backend order is canonical: John group before Romans group
    const allText = screen.getAllByRole('button').map(
      (b) => b.textContent ?? '',
    );
    const johnIdx = allText.findIndex((t) => t.includes('John'));
    const romIdx = allText.findIndex((t) => t.includes('Romans'));
    expect(johnIdx).toBeLessThan(romIdx);
  });

  it(
    'populates audioPlaylistItems flattened across groups in ' +
      'canonical order',
    async () => {
      mockSearchBibleGrouped.mockResolvedValue({
        groups: MOCK_GROUPS,
        meta: { total: 3, truncated: false },
      });
      renderSearch();
      await waitFor(() => {
        const items = useBibleStore.getState().audioPlaylistItems;
        expect(items?.length).toBe(3);
        expect(items?.[0].bookId).toBe('JHN');
        expect(items?.[0].chapter).toBe(1);
        expect(items?.[1].bookId).toBe('JHN');
        expect(items?.[2].bookId).toBe('ROM');
      });
    },
  );

  it('previews 3 verses and expands via "Show N more"', async () => {
    const manyVerses = Array.from({ length: 5 }, (_, i) => ({
      book_id: 'JHN',
      chapter: 1,
      verse_start: i + 1,
      verse_text: `Verse ${i + 1}`,
    }));
    mockSearchBibleGrouped.mockResolvedValue({
      groups: [{ book_id: 'JHN', count: 5, verses: manyVerses }],
      meta: { total: 5, truncated: false },
    });
    renderSearch();
    await waitFor(() =>
      expect(screen.getByText('Verse 3')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Verse 4')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Show 2 more verses/));
    await waitFor(() => {
      expect(screen.getByText('Verse 4')).toBeInTheDocument();
      expect(screen.getByText('Verse 5')).toBeInTheDocument();
      expect(
        screen.queryByText(/Show.*more verse/),
      ).not.toBeInTheDocument();
    });
  });

  it('does not render pagination controls', async () => {
    mockSearchBibleGrouped.mockResolvedValue({
      groups: MOCK_GROUPS,
      meta: { total: 100, truncated: false },
    });
    renderSearch();
    await waitFor(() => {
      expect(screen.getByText('John')).toBeInTheDocument();
    });
    const pageBtn = screen
      .getAllByRole('button')
      .find((b) => b.textContent?.trim() === '2');
    expect(pageBtn).toBeUndefined();
  });

  it('shows a truncated notice when meta.truncated is true', async () => {
    mockSearchBibleGrouped.mockResolvedValue({
      groups: MOCK_GROUPS,
      meta: { total: 770, truncated: true },
    });
    renderSearch();
    await waitFor(() => {
      expect(
        screen.getByText('Showing first 3 of 770 results'),
      ).toBeInTheDocument();
    });
  });

  it('clicking a verse play button sets the playlist index', async () => {
    mockSearchBibleGrouped.mockResolvedValue({
      groups: [MOCK_GROUPS[0]],
      meta: { total: 2, truncated: false },
    });
    renderSearch();
    const playBtn = await screen.findByLabelText('play-JHN-3-16');
    await act(async () => {
      fireEvent.click(playBtn);
    });
    const state = useBibleStore.getState();
    expect(state.audioPlaylistItems).toHaveLength(2);
    expect(state.audioPlaylistItems?.[1]).toMatchObject({
      itemId: 'search-JHN-3-16',
      bookId: 'JHN',
      chapter: 3,
      startVerse: 16,
      endVerse: 16,
    });
    expect(state.audioPlaylistStartIndex).toBe(1);
  });

  it('clicking a verse navigates to chapter.verse URL', async () => {
    mockSearchBibleGrouped.mockResolvedValue({
      groups: [MOCK_GROUPS[0]],
      meta: { total: 2, truncated: false },
    });
    renderSearch();
    await waitFor(() =>
      expect(
        screen.getByText('For God so loved the world'),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('For God so loved the world'));
    await waitFor(() =>
      expect(screen.getByTestId('bible-page')).toBeInTheDocument(),
    );
  });

  it('shows no-results message for empty response', async () => {
    mockSearchBibleGrouped.mockResolvedValue(EMPTY_RESULT);
    renderSearch('?q=xyzzy');
    await waitFor(() => {
      expect(
        screen.getByText(/No results found/),
      ).toBeInTheDocument();
    });
  });

  it('shows error message on fetch failure', async () => {
    mockSearchBibleGrouped.mockRejectedValue(
      new Error('Network error'),
    );
    renderSearch();
    await waitFor(() => {
      expect(
        screen.getByText('Network error'),
      ).toBeInTheDocument();
    });
  });

  it('removes a stale page param from the URL on submit', () => {
    mockSearchBibleGrouped.mockResolvedValue(EMPTY_RESULT);
    renderSearch('?q=grace&page=3');
    expect(
      screen.getByTestId('location-search').textContent,
    ).toContain('page=3');
    fireEvent.click(screen.getByLabelText('search-button'));
    const search =
      screen.getByTestId('location-search').textContent ?? '';
    expect(search).toContain('q=grace');
    expect(search).not.toContain('page');
  });

  it('clears stale groups when a later search fails', async () => {
    mockSearchBibleGrouped.mockResolvedValue({
      groups: MOCK_GROUPS,
      meta: { total: 3, truncated: false },
    });
    renderSearch();
    await waitFor(() => {
      expect(screen.getByText('John')).toBeInTheDocument();
      expect(screen.getByText('Romans')).toBeInTheDocument();
    });
    mockSearchBibleGrouped.mockRejectedValue(
      new Error('Network error'),
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'hope' },
    });
    fireEvent.click(screen.getByLabelText('search-button'));
    await waitFor(() => {
      expect(
        screen.getByText('Network error'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('John')).not.toBeInTheDocument();
    expect(screen.queryByText('Romans')).not.toBeInTheDocument();
    expect(
      screen.queryByText('For God so loved the world'),
    ).not.toBeInTheDocument();
  });

  it('clears audioPlaylistItems on unmount', async () => {
    mockSearchBibleGrouped.mockResolvedValue({
      groups: MOCK_GROUPS,
      meta: { total: 3, truncated: false },
    });

    const { unmount } = renderSearch();

    await waitFor(() => {
      const items = useBibleStore.getState().audioPlaylistItems;
      expect(items).not.toBeNull();
      expect(items?.length).toBe(3);
    });

    unmount();

    const items = useBibleStore.getState().audioPlaylistItems;
    expect(items).toBeNull();
  });
});
