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
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TagManagementRoute from './TagManagementRoute';
import { Tag } from '../types';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
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

// Lightweight TagTree that still exercises onDelete.
vi.mock('../components/TagTree', () => ({
  TagTree: ({
    tags,
    onDelete,
  }: {
    tags: Tag[];
    onDelete: (id: string, name: string) => void;
  }) => (
    <div data-testid="tag-tree">
      {tags.map((t) => (
        <button
          key={t.id}
          data-testid={`delete-${t.id}`}
          onClick={() => onDelete(t.id, t.name)}
        >
          {t.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../components/CreateTagModal', () => ({
  CreateTagModal: () => null,
}));

vi.mock('../components/EditTagModal', () => ({
  EditTagModal: () => null,
}));

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

const mockTags: Tag[] = [
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
