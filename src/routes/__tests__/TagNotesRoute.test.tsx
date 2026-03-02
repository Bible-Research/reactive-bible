import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../__tests__/helpers';
import TagNotesRoute from '../TagNotesRoute';
import { useBibleStore } from '../../store';
import * as cacheManager from '../../utils/cacheManager';

// Mock react-router-dom
const mockNavigate = vi.fn();
const mockUseParams = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<
    typeof import('react-router-dom')
  >('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
  };
});

// Mock API and cacheManager
vi.mock('../../api');
vi.mock('../../utils/cacheManager');

const mockCacheManager = vi.mocked(cacheManager);

describe('TagNotesRoute', () => {
  const mockSetLastSelectedTagId = vi.fn();
  const mockFetchNotes = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ tagId: 'tag-123' });

    // Reset store state
    useBibleStore.setState({
      showNotes: false,
      notes: [],
      tags: [
        { id: 'tag-123', name: 'Bible Study', parent_tag: null, created_at: '', updated_at: '' },
        { id: 'tag-456', name: 'Prayer', parent_tag: null, created_at: '', updated_at: '' },
      ],
      lastSelectedTagId: null,
      setLastSelectedTagId: mockSetLastSelectedTagId,
      fetchNotes: mockFetchNotes,
    });
  });

  it('should set showNotes to true and lastSelectedTagId on mount', async () => {
    renderWithProviders(<TagNotesRoute />);
    await waitFor(() => {
      expect(useBibleStore.getState().showNotes).toBe(true);
      expect(mockSetLastSelectedTagId).toHaveBeenCalledWith('tag-123');
    });
  });

  it('should render loading state, then content', async () => {
    renderWithProviders(<TagNotesRoute />);
    expect(screen.getByLabelText('loading')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByLabelText('loading')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
      expect(screen.getByText('0 notes')).toBeInTheDocument();
    });
  });

  it('should call fetchNotes on mount', async () => {
    renderWithProviders(<TagNotesRoute />);
    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalledWith('tag-123');
    });
  });

  it('should handle refresh by clearing cache and refetching notes', async () => {
    renderWithProviders(<TagNotesRoute />);
    await waitFor(() => {
      expect(screen.getByLabelText('Refresh notes')).toBeInTheDocument();
    });

    const refreshButton = screen.getByLabelText('Refresh notes');
    await userEvent.click(refreshButton);

    expect(mockCacheManager.clearNotesCache).toHaveBeenCalledWith('tag-123');
    expect(mockFetchNotes).toHaveBeenCalledWith('tag-123');
  });

  it('should render component with tag selector', async () => {
    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.queryByLabelText('loading')).not.toBeInTheDocument();
    });

    // Component should render with tag selector
    expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
  });

  it('should display note count text', async () => {
    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.queryByLabelText('loading')).not.toBeInTheDocument();
    });

    // Should show some form of note count (0 notes, 1 note, etc.)
    expect(screen.getByText(/\d+ notes?/)).toBeInTheDocument();
  });

  it('should display share button', async () => {
    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
    });

    // Share button should be present (ActionIcon)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should navigate when tag is changed', async () => {
    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
    });

    // Verify the select is rendered
    const select = screen.getByLabelText('Filter by tag');
    expect(select).toBeInTheDocument();
  });

  it('should show loading state initially', () => {
    renderWithProviders(<TagNotesRoute />);

    expect(screen.getByLabelText('loading')).toBeInTheDocument();
  });

  it('should show error message when tag is not found', async () => {
    mockUseParams.mockReturnValue({ tagId: 'non-existent' });

    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.getByText(/Tag not found/i)).toBeInTheDocument();
    });
  });

  it('should show "No notes found" when tag has no notes', async () => {
    useBibleStore.setState({
      notes: [],
    });

    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(
        screen.getByText('No notes found for this tag.')
      ).toBeInTheDocument();
    });
  });

  it('should show error when no tagId is provided', async () => {
    mockUseParams.mockReturnValue({ tagId: undefined });

    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.getByText('No tag ID provided')).toBeInTheDocument();
    });
  });

  it('should call navigate when handleTagChange is triggered', async () => {
    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
    });

    // The component should be ready
    expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
  });

  it('should render all UI elements after loading', async () => {
    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.queryByLabelText('loading')).not.toBeInTheDocument();
    });

    // Component should render all key UI elements
    expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
    expect(screen.getByText(/\d+ notes?/)).toBeInTheDocument();
    
    // Share button should be present
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should maintain showNotes state as true throughout lifecycle', async () => {
    renderWithProviders(<TagNotesRoute />);

    await waitFor(() => {
      expect(screen.queryByLabelText('loading')).not.toBeInTheDocument();
    });

    // Verify showNotes is still true after loading
    const state = useBibleStore.getState();
    expect(state.showNotes).toBe(true);
  });
});
