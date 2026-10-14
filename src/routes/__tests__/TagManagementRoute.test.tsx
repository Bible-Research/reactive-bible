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
import TagManagementRoute from '../TagManagementRoute';
import { Tag } from '../../types';
import { useBibleStore } from '../../store';
import { useAuthStore } from '../../stores/authStore';
import * as api from '../../api';

vi.mock('../../api');
const mockApi = vi.mocked(api);

// Lightweight TagTree that still exercises onDelete.
vi.mock('../../components/TagTree', () => ({
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

vi.mock('../../components/CreateTagModal', () => ({
  CreateTagModal: () => null,
}));

vi.mock('../../components/EditTagModal', () => ({
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
    mockApi.getTags.mockResolvedValue(mockTags);
    mockApi.deleteTag.mockResolvedValue(undefined);
  });

  it('shows the full-screen loader only on first load', async () => {
    useBibleStore.setState({ tags: [] });
    let resolveLoad: (tags: Tag[]) => void = () => undefined;
    mockApi.getTags.mockImplementation(
      () =>
        new Promise<Tag[]>((res) => {
          resolveLoad = res;
        })
    );

    renderRoute();

    expect(
      screen.getByLabelText('Loading tags')
    ).toBeInTheDocument();

    resolveLoad(mockTags);
    await waitFor(() => {
      expect(
        screen.queryByLabelText('Loading tags')
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('tag-tree')).toBeInTheDocument();
  });

  it('keeps the tag list rendered during post-delete refresh',
    async () => {
      let resolveRefresh: (tags: Tag[]) => void =
        () => undefined;
      mockApi.getTags
        .mockResolvedValueOnce(mockTags)
        .mockImplementationOnce(
          () =>
            new Promise<Tag[]>((res) => {
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
        expect(mockApi.getTags).toHaveBeenCalledTimes(2);
      });

      // While the refresh is still in flight the page must not
      // be replaced by the full-screen loader.
      expect(screen.getByTestId('tag-tree')).toBeInTheDocument();
      expect(
        screen.queryByLabelText('Loading tags')
      ).not.toBeInTheDocument();

      resolveRefresh(mockTags);
      await waitFor(() => {
        expect(
          screen.getByText('Bible Study')
        ).toBeInTheDocument();
      });
    }
  );
});
