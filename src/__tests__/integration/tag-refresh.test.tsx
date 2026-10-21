/**
 * Tag Refresh Behavior Tests
 *
 * BibleRoute and TagManagementRoute force-refresh tags on
 * navigation (`getTags(true)`). TagNotesRoute deliberately
 * calls the cache-aware `getTags()` — it only needs the tags
 * for the authenticated switcher and tolerates staleness.
 *
 * Context: Tags are cached in Zustand store for performance
 * (95% faster). Force-refreshing on these routes ensures
 * users see the latest tags (e.g., after creating/editing/
 * deleting tags).
 *
 * Related commits:
 * - 5a6e14c: feat: Implement tag caching in store
 * - 2407a23: Feat: Force refresh tags on route navigation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  act,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TagNotesRoute from '../../routes/TagNotesRoute';
import BibleRoute from '../../routes/BibleRoute';
import TagManagementRoute from '../../routes/TagManagementRoute';
import { useBibleStore } from '../../store';
import { useAuthStore } from '../../stores/authStore';
import * as api from '../../api';

// Manual automock — no importOriginal: evaluating the real
// barrel pulls apiClient → authStore → store in a cycle, which
// binds the REAL api into the store slices (their calls then
// bypass every mock and hit MSW). The proxy mocks any function
// on first access, keeping the namespace complete without eager
// eval; error classes + constants stay real for instanceof.
vi.mock('../../api', async () => {
  const errors = await vi.importActual<
    typeof import('../../api/errors')
  >('../../api/errors');
  const constants: Record<PropertyKey, unknown> = {
    ...errors,
    UNTAGGED_TAG_ID: 'untagged',
  };
  const fns = new Map<PropertyKey, unknown>();
  return new Proxy(constants, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (
        prop === 'then' ||
        prop === 'default' ||
        prop === Symbol.toStringTag
      ) {
        return undefined;
      }
      if (!fns.has(prop)) fns.set(prop, vi.fn());
      return fns.get(prop);
    },
    // Vitest verifies `key in mockedModule` for every used
    // export — report everything except thenables.
    has(target, prop) {
      return (
        prop in target ||
        (prop !== 'then' && prop !== 'default')
      );
    },
  });
});
const mockApi = vi.mocked(api);

// Mock child components to isolate route behavior
vi.mock('../../components/Passage', () => ({
  default: () => <div data-testid="passage">Passage</div>,
}));

vi.mock('../../components/TagSection', () => ({
  default: () => <div data-testid="tag-section">TagSection</div>,
}));

vi.mock('../../components/TagTree', () => ({
  TagTree: () => <div data-testid="tag-tree">TagTree</div>,
}));

vi.mock('../../components/CreateTagModal', () => ({
  CreateTagModal: () => <div data-testid="create-tag-modal" />,
}));

vi.mock('../../components/EditTagModal', () => ({
  EditTagModal: () => <div data-testid="edit-tag-modal" />,
}));

vi.mock('../../components/EditNoteModal', () => ({
  default: () => <div data-testid="edit-note-modal" />,
}));

// Mock notifications
vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

// Mock cache manager
vi.mock('../../utils/cacheManager', () => ({
  clearNotesCache: vi.fn(),
  getCachedNotes: vi.fn(() => null),
  cacheNotes: vi.fn(),
}));

describe('Tag Refresh Behavior', () => {
  const mockTags = [
    {
      id: 'tag-1',
      name: 'Bible Study',
      parent_tag: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
    {
      id: 'tag-2',
      name: 'Prayer',
      parent_tag: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
  ];

  const mockNotes = [
    {
      id: 'note-1',
      note_text: 'Test note',
      public: false,
      is_owner: true,
      tag: mockTags[0],
      verses: [
        { book: 'John', chapter: 3, verse: 16, text: 'For God...' }
      ],
      tag_position: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset stores to initial state
    useBibleStore.setState({
      tags: [],
      notes: [],
      activeBookId: 'JHN',
      activeChapter: 1,
      verseSelection: null,
      bibleVersion: 'KJV',
      translations: [],
      activeTextFilesetId: null,
      activeAudioFilesetId: null,
      allNotesFetched: false,
      showNotes: false,
      lastSelectedTagId: null,
      showAudioPlayer: false,
      versesFolded: false,
      audioPlaylistItems: null,
    });

    useAuthStore.setState({
      token: 'test-token',
      user: { username: 'testuser' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });

    // Setup default API mocks
    mockApi.getTags.mockResolvedValue(mockTags);
    mockApi.getNotes.mockResolvedValue({
      count: mockNotes.length,
      next: null,
      previous: null,
      results: mockNotes,
    });
    mockApi.getTag.mockResolvedValue(mockTags[0]);
    mockApi.fetchCommentCounts.mockResolvedValue({});
  });

  // Never vi.spyOn the store's state object: setState spreads
  // the spy into every later state snapshot, where it survives
  // restore and swallows calls. Override via setState and put
  // the real action back in afterEach instead.
  const realGetTags = useBibleStore.getState().getTags;
  const spyOnGetTags = () => {
    const spy = vi.fn(realGetTags);
    useBibleStore.setState({ getTags: spy });
    return spy;
  };

  afterEach(() => {
    useBibleStore.setState({ getTags: realGetTags });
    vi.restoreAllMocks();
  });

  describe('TagNotesRoute', () => {
    it('should call getTags on mount when authenticated', async () => {
      const getTagsSpy = spyOnGetTags();

      render(
        <MemoryRouter initialEntries={['/notes/tag/tag-1']}>
          <Routes>
            <Route path="/notes/tag/:tagId" element={<TagNotesRoute />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(getTagsSpy).toHaveBeenCalled();
      });
    });

    it('should use cached tags when cache exists', async () => {
      // Pre-populate store with cached tags
      useBibleStore.setState({ tags: mockTags });

      // Clear the mock to ensure we're testing the mount behavior
      mockApi.getTags.mockClear();

      render(
        <MemoryRouter initialEntries={['/notes/tag/tag-1']}>
          <Routes>
            <Route path="/notes/tag/:tagId" element={<TagNotesRoute />} />
          </Routes>
        </MemoryRouter>
      );

      // Wait for the route to finish loading before the
      // negative assert — the store's cache-aware getTags
      // must have had its chance to call the API.
      await screen.findByTestId('tag-section');
      expect(mockApi.getTags).not.toHaveBeenCalled();
    });

    it('should only refresh tags when authenticated', async () => {
      // Set user as not authenticated
      useAuthStore.setState({ isAuthenticated: false, token: null });

      mockApi.getTags.mockClear();

      render(
        <MemoryRouter initialEntries={['/notes/tag/tag-1']}>
          <Routes>
            <Route path="/notes/tag/:tagId" element={<TagNotesRoute />} />
          </Routes>
        </MemoryRouter>
      );

      // Route render finished — the mount effect has run, so
      // getTags would already have been called if buggy.
      await screen.findByTestId('tag-section');
      expect(mockApi.getTags).not.toHaveBeenCalled();
    });
  });

  describe('BibleRoute', () => {
    it('should call getTags with forceRefresh=true on mount', async () => {
      const getTagsSpy = spyOnGetTags();

      render(
        <MemoryRouter initialEntries={['/bible/John/3']}>
          <Routes>
            <Route
              path="/bible/:book/:chapterVerse"
              element={<BibleRoute />}
            />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(getTagsSpy).toHaveBeenCalledWith(true);
      });
    });

    it('should fetch fresh tags even when cache exists', async () => {
      // Pre-populate store with cached tags
      useBibleStore.setState({ tags: mockTags });

      mockApi.getTags.mockClear();

      render(
        <MemoryRouter initialEntries={['/bible/John/3']}>
          <Routes>
            <Route
              path="/bible/:book/:chapterVerse"
              element={<BibleRoute />}
            />
          </Routes>
        </MemoryRouter>
      );

      // Should call API despite having cached tags
      await waitFor(() => {
        expect(mockApi.getTags).toHaveBeenCalled();
      });
    });

    it('should only refresh tags when authenticated', async () => {
      useAuthStore.setState({ isAuthenticated: false, token: null });

      mockApi.getTags.mockClear();

      render(
        <MemoryRouter initialEntries={['/bible/John/3']}>
          <Routes>
            <Route
              path="/bible/:book/:chapterVerse"
              element={<BibleRoute />}
            />
          </Routes>
        </MemoryRouter>
      );

      // Flush mount effects + the canonical-URL redirect; the
      // getTags effect would already have run if it were
      // incorrectly firing for anonymous visitors.
      await act(async () => Promise.resolve());
      expect(mockApi.getTags).not.toHaveBeenCalled();
    });

    it('should refresh tags on every navigation to BibleRoute', async () => {
      mockApi.getTags.mockClear();

      const { rerender } = render(
        <MemoryRouter initialEntries={['/bible/John/3']}>
          <Routes>
            <Route
              path="/bible/:book/:chapterVerse"
              element={<BibleRoute />}
            />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(mockApi.getTags).toHaveBeenCalledTimes(1);
      });

      // Navigate to a different chapter. The `key` forces a
      // remount (a bare initialEntries change is ignored after
      // mount), so the mount effect fires again and re-fetches
      // tags — mirroring a real navigation to a new route.
      mockApi.getTags.mockClear();

      rerender(
        <MemoryRouter
          key="matthew"
          initialEntries={['/bible/Matthew/5']}
        >
          <Routes>
            <Route
              path="/bible/:book/:chapterVerse"
              element={<BibleRoute />}
            />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(mockApi.getTags).toHaveBeenCalled();
      });
    });
  });

  describe('TagManagementRoute', () => {
    it('should call getTags with forceRefresh=true on mount', async () => {
      const getTagsSpy = spyOnGetTags();

      render(
        <MemoryRouter initialEntries={['/tags']}>
          <Routes>
            <Route path="/tags" element={<TagManagementRoute />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(getTagsSpy).toHaveBeenCalledWith(true);
      });
    });

    it('should fetch fresh tags even when cache exists', async () => {
      // Pre-populate store with cached tags
      useBibleStore.setState({ tags: mockTags });

      mockApi.getTags.mockClear();

      render(
        <MemoryRouter initialEntries={['/tags']}>
          <Routes>
            <Route path="/tags" element={<TagManagementRoute />} />
          </Routes>
        </MemoryRouter>
      );

      // Should call API despite having cached tags
      await waitFor(() => {
        expect(mockApi.getTags).toHaveBeenCalled();
      });
    });
  });

  describe('Cross-route tag caching', () => {
    it('should use cached tags when navigating between routes', async () => {
      const newTag = {
        id: 'tag-3',
        name: 'New Tag',
        parent_tag: null,
        created_at: '2026-01-02',
        updated_at: '2026-01-02',
      };

      // Start with 2 tags
      mockApi.getTags.mockResolvedValue(mockTags);

      const { unmount } = render(
        <MemoryRouter initialEntries={['/tags']}>
          <Routes>
            <Route path="/tags" element={<TagManagementRoute />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(useBibleStore.getState().tags).toHaveLength(2);
      });

      // Unmount the first route
      unmount();

      // Simulate tag creation - API now returns 3 tags
      mockApi.getTags.mockResolvedValue([...mockTags, newTag]);

      // Navigate to TagNotesRoute (fresh render)
      render(
        <MemoryRouter initialEntries={['/notes/tag/tag-1']}>
          <Routes>
            <Route path="/notes/tag/:tagId" element={<TagNotesRoute />} />
          </Routes>
        </MemoryRouter>
      );

      // Should still see cached tags (2) since getTags() uses cache
      await waitFor(() => {
        expect(useBibleStore.getState().tags).toHaveLength(2);
        expect(
          useBibleStore.getState().tags.find((t) => t.id === 'tag-3')
        ).toBeUndefined();
      });
    });
  });

  describe('Performance: cache is still used within same session', () => {
    it('should use cache without forceRefresh', async () => {
      // Pre-populate store
      useBibleStore.setState({ tags: mockTags });

      mockApi.getTags.mockClear();

      // Call getTags without force refresh
      await useBibleStore.getState().getTags(false);

      // Should NOT call API (uses cache)
      expect(mockApi.getTags).not.toHaveBeenCalled();
    });

    it('should bypass cache with forceRefresh', async () => {
      // Pre-populate store
      useBibleStore.setState({ tags: mockTags });

      mockApi.getTags.mockClear();

      // Call getTags with force refresh
      await useBibleStore.getState().getTags(true);

      // Should call API (bypasses cache)
      expect(mockApi.getTags).toHaveBeenCalled();
    });
  });
});
