import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  act,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { mockDomApis } from '../__tests__/helpers';
import TagNotesRoute from './TagNotesRoute';
import { useBibleStore, initialState } from '../store';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../stores/authStore';
import * as api from '../api';
import { Note, Tag } from '../types';

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
vi.mock('../utils/cacheManager');

const mockApi = vi.mocked(api);
const mockFetchNotes = vi.fn();
const mockGetTags = vi.fn();

const tag: Tag = {
  id: 'tag-123',
  name: 'Bible Study',
  parent_tag: null,
  public: false,
  created_at: '',
  updated_at: '',
};

const note: Note = {
  id: 'note-1',
  note_text: 'A note',
  public: true,
  is_owner: true,
  created_at: '',
  updated_at: '',
  tag,
  verses: [],
  tag_position: 1,
};

const storeOverrides = {
  notes: [note],
  notesCount: 1,
  notesPage: 1,
  notesPageSize: 25,
  lastSelectedTagId: 'tag-123',
  tags: [tag],
  fetchNotes: mockFetchNotes,
  getTags: mockGetTags,
};

const renderRoute = () => {
  useBibleStore.setState({ ...initialState, ...storeOverrides });
  useAuthStore.setState({
    ...authInitialState,
    token: 'token',
    isAuthenticated: true,
  });
  mockDomApis();
  return render(
    <MemoryRouter initialEntries={['/notes/tag/tag-123']}>
      <TagNotesRoute />
    </MemoryRouter>
  );
};

describe('TagNotesRoute toolbar scroll-hide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ tagId: 'tag-123' });
    mockFetchNotes.mockResolvedValue(undefined);
    mockGetTags.mockResolvedValue(undefined);
    mockApi.getTag.mockResolvedValue(tag);
    mockApi.fetchCommentCounts.mockResolvedValue({});
  });

  it('collapses the filter/sort toolbar when headerVisible ' +
    'goes false and re-expands when it returns', async () => {
      renderRoute();
      const toolbar = await screen.findByTestId(
        'tag-notes-toolbar'
      );
      // headerVisible defaults to true — the Collapse is open.
      expect(toolbar).toHaveAttribute('aria-hidden', 'false');

      // Simulates MyHeader hiding itself on a deliberate
      // downward scroll.
      act(() => {
        useBibleStore.getState().setHeaderVisible(false);
      });

      expect(toolbar).toHaveAttribute('aria-hidden', 'true');
      // The collapse animation drives height to 0 via rAF.
      await waitFor(() => {
        expect(toolbar.style.height).toBe('0px');
      });
      // The root container grows to the full viewport so the
      // notes list reclaims the space the chrome freed.
      expect(toolbar.parentElement?.style.height).toBe('100vh');

      // Scrolling back up re-shows the header and the toolbar.
      act(() => {
        useBibleStore.getState().setHeaderVisible(true);
      });
      expect(toolbar).toHaveAttribute('aria-hidden', 'false');
      expect(toolbar.parentElement?.style.height).toBe(
        'calc(100vh - var(--mantine-header-height, 0px))'
      );
    });
});

describe('TagNotesRoute merged-page tag resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ tagId: 'tag-123' });
    mockFetchNotes.mockResolvedValue(undefined);
    mockGetTags.mockResolvedValue(undefined);
    mockApi.getTag.mockResolvedValue(tag);
    mockApi.fetchCommentCounts.mockResolvedValue({});
  });

  it('shows the viewed tag in the toolbar even when a ' +
    'descendant note leads the merged page', async () => {
      const childTag: Tag = {
        id: 'tag-child',
        name: 'Child Tag',
        parent_tag: 'tag-123',
        public: true,
        created_at: '',
        updated_at: '',
      };
      const ownTag: Tag = { ...tag, public: true };

      // Anonymous viewer on a shared `?descendants=1` page:
      // no own tags are loaded, so resolution falls through
      // to the fetched notes — the first row's tag is a
      // descendant, not the viewed tag.
      useBibleStore.setState({
        ...initialState,
        notes: [
          { ...note, id: 'n-child', tag: childTag },
          { ...note, id: 'n-own', tag: ownTag },
        ],
        notesCount: 2,
        notesPage: 1,
        notesPageSize: 25,
        lastSelectedTagId: 'tag-123',
        tags: [],
        fetchNotes: mockFetchNotes,
        getTags: mockGetTags,
      });
      useAuthStore.setState({
        ...authInitialState,
        isAuthenticated: false,
      });
      mockDomApis();
      render(
        <MemoryRouter
          initialEntries={['/notes/tag/tag-123?descendants=1']}
        >
          <TagNotesRoute />
        </MemoryRouter>
      );

      const toolbar = await screen.findByTestId(
        'tag-notes-toolbar'
      );
      await waitFor(() => {
        expect(
          within(toolbar).getByText('Bible Study')
        ).toBeInTheDocument();
      });
      expect(
        within(toolbar).queryByText('Child Tag')
      ).not.toBeInTheDocument();
    });
});
