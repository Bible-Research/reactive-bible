import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import NotesView from '../NotesView';
import { useBibleStore } from '../../store';
import { Tag } from '../../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockTags: Tag[] = [
  { id: 'tag2', name: 'Prayer', parent_tag: null, created_at: '', updated_at: '' },
  { id: 'tag1', name: 'Bible Study', parent_tag: null, created_at: '', updated_at: '' },
];

describe('NotesView', () => {
  const mockGetTags = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useBibleStore.setState({ getTags: mockGetTags, tags: [] });
  });

  const renderComponent = (initialEntry: string) => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/notes" element={<NotesView />} />
          <Route path="/notes/tag/:tagId" element={<div>Tag Notes Page</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('should navigate to lastSelectedTagId if it exists in the store', async () => {
    useBibleStore.setState({ lastSelectedTagId: 'tag-last', tags: mockTags });
    renderComponent('/notes');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/notes/tag/tag-last', { replace: true });
    });
    expect(mockGetTags).not.toHaveBeenCalled();
  });

  it('should fetch tags and navigate to the first tag if lastSelectedTagId is not set', async () => {
    useBibleStore.setState({ lastSelectedTagId: null, tags: [] });
    mockGetTags.mockImplementation(() => {
      useBibleStore.setState({ tags: mockTags });
      return Promise.resolve();
    });

    renderComponent('/notes');

    await waitFor(() => {
      expect(mockGetTags).toHaveBeenCalled();
    });

    await waitFor(() => {
      // Navigates to the first tag alphabetically ('Bible Study')
      expect(mockNavigate).toHaveBeenCalledWith('/notes/tag/tag1', { replace: true });
    });
  });

  it('should show a loading state while fetching tags', () => {
    useBibleStore.setState({ lastSelectedTagId: null, tags: [] });
    const { getByPlaceholderText } = renderComponent('/notes');
    expect(getByPlaceholderText('Loading tags...')).toBeInTheDocument();
  });

  it('should not navigate if not on the /notes route', async () => {
    useBibleStore.setState({ lastSelectedTagId: 'tag-last', tags: mockTags });
    renderComponent('/notes/tag/some-other-tag');

    // Use a small timeout to ensure no navigation happens
    await new Promise(r => setTimeout(r, 100));

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
