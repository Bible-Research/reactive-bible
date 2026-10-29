/**
 * TagManagementRoute regression tests for issue #29.
 *
 * Post-mutation refreshes (create / edit / delete) must not
 * unmount the page behind a full-screen loader — the existing
 * tag list stays rendered while fresh data is fetched in the
 * background. The full-screen loader is reserved for the first
 * visit with an empty tag store.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { showNotification } from '@mantine/notifications';
import TagManagementRoute from './TagManagementRoute';
import { Tag } from '../types';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
import { clearNotesCache } from '../utils/cacheManager';
import * as api from '../api';

// Selective automock — keep real error classes so `instanceof`
// checks in store actions still work.
vi.mock('../api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../api')>();
  const mocked: Record<string, unknown> = { ...actual };
  for (const [key, value] of Object.entries(actual)) {
    if (
      typeof value === 'function' &&
      key !== 'ConflictError'
    ) {
      mocked[key] = vi.fn();
    }
  }
  return mocked;
});
const mockApi = vi.mocked(api);

// The route reads {tags, getTags} off the bible store — stub it
// directly instead of relying on the './api' automock: that
// factory's importOriginal evaluates the real api module, which
// transitively evaluates a duplicate real store bound to the
// real api (api.tsx imports Translation from './store'), so
// api-level mocks never see the store's calls.
const storeStub = vi.hoisted(() => {
  const state = {
    tags: [] as Tag[],

    // Signature mirrors the store action; the stub ignores it.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getTags: vi.fn((_forceRefresh?: boolean) =>
      Promise.resolve(),
    ),
  };
  const useBibleStore = Object.assign(
    (selector: (s: typeof state) => unknown) => selector(state),
    {
      setState: (partial: Partial<typeof state>) =>
        Object.assign(state, partial),
      getState: () => state,
    },
  );
  return { state, useBibleStore };
});

vi.mock('../store', () => ({
  useBibleStore: storeStub.useBibleStore,
}));

const mockGetTags = storeStub.state.getTags;

// Lightweight TagTree that still exercises onDelete — and
// captures the full prop set so tests can drive the new
// publicity/reparent/counts contract.
const capturedTreeProps = vi.hoisted(() => ({
  current: undefined as
    | {
        noteCounts?: Record<string, number>;
        subtreeCounts?: Record<string, number>;
        onTogglePublic?: (tag: Tag) => void;
        onReparent?: (id: string, parentId: string | null) => void;
        reparentEnabled?: boolean;
      }
    | undefined,
}));

vi.mock('../components/TagTree', () => ({
  TagTree: (props: {
    tags: Tag[];
    onDelete: (id: string, name: string) => void;
    noteCounts?: Record<string, number>;
    subtreeCounts?: Record<string, number>;
    onTogglePublic?: (tag: Tag) => void;
    onReparent?: (id: string, parentId: string | null) => void;
    reparentEnabled?: boolean;
  }) => {
    capturedTreeProps.current = props;
    return (
      <div data-testid="tag-tree">
        {props.tags.map((t) => (
          <button
            key={t.id}
            data-testid={`delete-${t.id}`}
            onClick={() => props.onDelete(t.id, t.name)}
          >
            {t.name}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock('../components/CreateTagModal', () => ({
  CreateTagModal: () => null,
}));

vi.mock('../components/EditTagModal', () => ({
  EditTagModal: () => null,
}));

// Automock so tests can assert the route's cache-clearing
// contract — the route itself never inspects cached pages.
vi.mock('../utils/cacheManager');
const mockClearNotesCache = vi.mocked(clearNotesCache);

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

const mockTags: Tag[] = [
  {
    id: 'tag-1',
    name: 'Bible Study',
    parent_tag: null,
    public: false,
    note_count: 3,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'tag-2',
    name: 'Prayer',
    parent_tag: 'tag-1',
    public: false,
    note_count: 2,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

const renderRoute = () =>
  render(
    <MemoryRouter initialEntries={['/tags']}>
      <Routes>
        <Route path="/tags" element={<TagManagementRoute />} />
      </Routes>
    </MemoryRouter>
  );

describe('TagManagementRoute refresh behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBibleStore.setState({ tags: mockTags });
    useAuthStore.setState({
      token: 'test-token',
      user: { username: 'testuser' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    mockGetTags.mockReset().mockResolvedValue(undefined);
    mockApi.deleteTag.mockResolvedValue(undefined);
    mockApi.getNotes.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
  });

  it('shows the full-screen loader only on first load', async () => {
    useBibleStore.setState({ tags: [] });
    let resolveLoad: () => void = () => undefined;
    mockGetTags.mockImplementation(
      () =>
        new Promise<void>((res) => {
          resolveLoad = () => {
            // Mirror the real action: the fetch result lands
            // in the store, and the route's own loading flag
            // flip re-renders with the new list.
            storeStub.state.tags = mockTags;
            res();
          };
        })
    );

    renderRoute();

    expect(
      screen.getByLabelText('Loading tags')
    ).toBeInTheDocument();

    resolveLoad();
    await waitFor(() => {
      expect(
        screen.queryByLabelText('Loading tags')
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('tag-tree')).toBeInTheDocument();
  });

  it('keeps the tag list rendered during post-delete refresh',
    async () => {
      let resolveRefresh: () => void = () => undefined;
      mockGetTags
        .mockResolvedValueOnce(undefined)
        .mockImplementationOnce(
          () =>
            new Promise<void>((res) => {
              resolveRefresh = res;
            })
        );
      window.confirm = vi.fn(() => true);

      renderRoute();
      await waitFor(() => {
        expect(
          screen.getByTestId('tag-tree')
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('delete-tag-1'));

      await waitFor(() => {
        expect(mockApi.deleteTag).toHaveBeenCalledWith('tag-1');
        expect(mockGetTags).toHaveBeenCalledTimes(2);
      });

      // While the refresh is still in flight the page must not
      // be replaced by the full-screen loader.
      expect(screen.getByTestId('tag-tree')).toBeInTheDocument();
      expect(
        screen.queryByLabelText('Loading tags')
      ).not.toBeInTheDocument();

      resolveRefresh();
      await waitFor(() => {
        expect(
          screen.getByText('Bible Study')
        ).toBeInTheDocument();
      });
    }
  );
});

describe('TagManagementRoute tag UX wiring', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedTreeProps.current = undefined;
    useBibleStore.setState({ tags: mockTags });
    useAuthStore.setState({
      token: 'test-token',
      user: { username: 'testuser' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    mockGetTags.mockReset().mockResolvedValue(undefined);
    mockApi.setTagPublic.mockResolvedValue({
      tag: { ...mockTags[0], public: true },
      notes_updated: 3,
    });
    mockApi.reparentTag.mockResolvedValue(mockTags[0]);
    mockApi.getNotes.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    renderRoute();
    await waitFor(() => {
      expect(
        screen.getByTestId('tag-tree')
      ).toBeInTheDocument();
    });
  });

  it('passes direct and subtree note counts to the tree',
    () => {
      const props = capturedTreeProps.current;
      expect(props?.noteCounts).toEqual({
        'tag-1': 3,
        'tag-2': 2,
      });
      // tag-1's subtree total folds in its child tag-2.
      expect(props?.subtreeCounts).toEqual({
        'tag-1': 5,
        'tag-2': 2,
      });
      expect(props?.reparentEnabled).toBe(true);
    });

  it('confirms then POSTs set-public and refreshes tags',
    async () => {
      window.confirm = vi.fn(() => true);

      await act(async () => {
        await capturedTreeProps.current?.onTogglePublic?.(
          mockTags[0]
        );
      });

      expect(mockApi.setTagPublic).toHaveBeenCalledWith(
        'tag-1',
        true
      );
      expect(mockApi.reparentTag).not.toHaveBeenCalled();
      // Ancestor `sub:true` merged pages also carry this
      // tag's notes with the old `public` flag — the cache
      // clear must be broad, not just the tag's own pages.
      expect(mockClearNotesCache).toHaveBeenCalledWith();
      // The mount load plus the post-toggle silent refresh.
      expect(mockGetTags).toHaveBeenCalledTimes(2);
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'green',
          message: expect.stringContaining('3 note(s)'),
        })
      );
    });

  it('skips the set-public POST when the confirm is declined',
    async () => {
      window.confirm = vi.fn(() => false);

      await act(async () => {
        await capturedTreeProps.current?.onTogglePublic?.(
          mockTags[0]
        );
      });

      expect(mockApi.setTagPublic).not.toHaveBeenCalled();
    });

  it('calls reparentTag on a valid drop and toasts the ' +
    'server message on failure', async () => {
      await act(async () => {
        await capturedTreeProps.current?.onReparent?.(
          'tag-1',
          null
        );
      });

      expect(mockApi.reparentTag).toHaveBeenCalledWith(
        'tag-1',
        null
      );

      mockApi.reparentTag.mockRejectedValue(
        new Error('A tag with this name already exists')
      );
      await act(async () => {
        await capturedTreeProps.current?.onReparent?.(
          'tag-2',
          'tag-1'
        );
      });

      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'red',
          message: 'A tag with this name already exists',
        })
      );
    });

  it('clears the whole notes cache on reparent — merged ' +
    'pages under old and new ancestors go stale', async () => {
      await act(async () => {
        await capturedTreeProps.current?.onReparent?.(
          'tag-2',
          null
        );
      });

      expect(mockApi.reparentTag).toHaveBeenCalledWith(
        'tag-2',
        null
      );
      // A tag-only clear would leave every ancestor's
      // `sub:true` merged page serving the moved tag's notes
      // under the wrong subtree.
      expect(mockClearNotesCache).toHaveBeenCalledWith();
      expect(mockClearNotesCache).not.toHaveBeenCalledWith(
        'tag-2'
      );
    });

  it('clears the whole notes cache on delete — the ' +
    'deleted tag\'s pages and ancestors\' merged pages ' +
    'go stale', async () => {
      window.confirm = vi.fn(() => true);
      mockApi.deleteTag.mockResolvedValue(undefined);

      fireEvent.click(screen.getByTestId('delete-tag-1'));

      await waitFor(() => {
        expect(mockApi.deleteTag).toHaveBeenCalledWith(
          'tag-1'
        );
      });

      // A tag-only clear would leave the deleted tag's own
      // cached pages serving a ghost `/notes/tag/<id>` view
      // and every ancestor's `sub:true` merged page listing
      // its notes.
      expect(mockClearNotesCache).toHaveBeenCalledWith();
      expect(mockClearNotesCache).not.toHaveBeenCalledWith(
        'tag-1'
      );
    });

  it('disables drag reparent while a search filter is ' +
    'active', async () => {
      expect(capturedTreeProps.current?.reparentEnabled).toBe(
        true
      );

      fireEvent.change(
        screen.getByPlaceholderText('Search tags...'),
        { target: { value: 'pray' } }
      );

      // The drop guards walk the FILTERED list — reparenting
      // stays off until the full tree is back.
      await waitFor(() => {
        expect(
          capturedTreeProps.current?.reparentEnabled
        ).toBe(false);
      });
    });
});

describe('TagManagementRoute notes count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBibleStore.setState({ tags: mockTags });
    useAuthStore.setState({
      token: 'test-token',
      user: { username: 'testuser' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    mockGetTags.mockReset().mockResolvedValue(undefined);
    mockApi.getNotes.mockResolvedValue({
      count: 7,
      next: null,
      previous: null,
      results: [],
    });
  });

  it('shows the total notes count next to the tag count',
    async () => {
      renderRoute();

      await waitFor(() => {
        expect(
          screen.getByText('2 tags · 7 notes')
        ).toBeInTheDocument();
      });
      // One minimal page is enough — `count` is the total.
      expect(mockApi.getNotes).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ pageSize: 1 })
      );
    }
  );

  it('omits the notes count when the fetch fails — no ' +
    'error toast, tags line still renders', async () => {
      mockApi.getNotes.mockRejectedValue(new Error('boom'));

      renderRoute();

      await waitFor(() => {
        expect(
          screen.getByTestId('tag-tree')
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText('2 tags')
      ).toBeInTheDocument();
      expect(showNotification).not.toHaveBeenCalledWith(
        expect.objectContaining({ color: 'red' })
      );
    }
  );
});
