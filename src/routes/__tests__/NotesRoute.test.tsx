import React from 'react';
import {
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import {
  MemoryRouter,
  Route,
  Routes,
} from 'react-router-dom';
import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from 'vitest';
import NotesRoute from '../NotesRoute';
import TagNotesRoute from '../TagNotesRoute';
import { useBibleStore } from '../../store';
import { useAuthStore } from '../../stores/authStore';

// Mock TagSection (heavy child component)
vi.mock('../../components/TagSection', () => ({
  default: () => (
    <div data-testid="tag-section">TagSection</div>
  ),
}));

// Mock EditNoteModal
vi.mock('../../components/EditNoteModal', () => ({
  default: () => (
    <div data-testid="edit-note-modal">
      EditNoteModal
    </div>
  ),
}));

// Mock API
vi.mock('../../api', () => ({
  getTags: vi.fn().mockResolvedValue([
    {
      id: 'tag-1',
      name: 'Faith',
      parent_tag: null,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'tag-2',
      name: 'Hope',
      parent_tag: null,
      created_at: '',
      updated_at: '',
    },
  ]),
  getNotes: vi.fn().mockResolvedValue([]),
  getTag: vi.fn().mockResolvedValue({
    id: 'tag-1',
    name: 'Faith',
    parent_tag: null,
    created_at: '',
    updated_at: '',
  }),
  deleteNote: vi.fn(),
  getBooks: vi.fn().mockResolvedValue([
    { book_name: 'John', book_id: 'Joh' },
  ]),
  getChapters: vi.fn().mockResolvedValue([1]),
  getVerses: vi.fn().mockResolvedValue([1]),
  getPassage: vi.fn().mockResolvedValue([
    {
      book_name: 'John',
      book_id: 'Joh',
      chapter: 1,
    },
  ]),
}));

// Mock notifications
vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
  notifications: {
    show: vi.fn(),
    update: vi.fn(),
    hide: vi.fn(),
  },
}));

// Mock cacheManager
vi.mock('../../utils/cacheManager', () => ({
  getCachedNotes: vi.fn().mockReturnValue(null),
  cacheNotes: vi.fn(),
  clearNotesCache: vi.fn(),
  clearExpiredAudioUrls: vi.fn(),
}));

describe('NotesRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset stores
    useBibleStore.setState({
      tags: [],
      notes: [],
      lastSelectedTagId: null,
      showNotes: false,
    });

    useAuthStore.setState({
      isAuthenticated: true,
      token: 'test-token',
      user: {
        username: 'testuser',
      },
    });
  });

  it('redirects to /login when not authenticated', async () => {
    useAuthStore.setState({
      isAuthenticated: false,
      token: null,
      user: null,
    });

    render(
      <MemoryRouter initialEntries={['/notes']}>
        <Routes>
          <Route
            path="/notes"
            element={<NotesRoute />}
          />
          <Route
            path="/login"
            element={
              <div data-testid="login-page">
                Login Page
              </div>
            }
          />
          <Route
            path="/bible"
            element={
              <div data-testid="bible-page">
                Bible Page
              </div>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('login-page')
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId('bible-page')
    ).not.toBeInTheDocument();
  });

  it('navigates to /notes/tag/:tagId when authenticated and tags exist', async () => {
    render(
      <MemoryRouter initialEntries={['/notes']}>
        <Routes>
          <Route
            path="/notes"
            element={<NotesRoute />}
          />
          <Route
            path="/notes/tag/:tagId"
            element={
              <div data-testid="tag-notes-page">
                Tag Notes Page
              </div>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Should show loader briefly, then navigate
    await waitFor(
      () => {
        expect(
          screen.getByTestId('tag-notes-page')
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('sets showNotes to true when navigating to notes route', async () => {
    render(
      <MemoryRouter initialEntries={['/notes']}>
        <Routes>
          <Route
            path="/notes"
            element={<NotesRoute />}
          />
          <Route
            path="/notes/tag/:tagId"
            element={<TagNotesRoute />}
          />
        </Routes>
      </MemoryRouter>
    );

    // TagNotesRoute sets showNotes=true on mount
    await waitFor(() => {
      expect(
        useBibleStore.getState().showNotes
      ).toBe(true);
    }, { timeout: 3000 });
  });
});

describe('Notes navigation from MainMenu', () => {
  it('navigating to /notes renders notes UI (not bible)', async () => {
    render(
      <MemoryRouter initialEntries={['/notes']}>
        <Routes>
          <Route
            path="/notes"
            element={<NotesRoute />}
          />
          <Route
            path="/notes/tag/:tagId"
            element={<TagNotesRoute />}
          />
          <Route
            path="/bible/:book/:chapter"
            element={
              <div data-testid="bible-page">
                Bible Page
              </div>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Should NOT show bible page
    await waitFor(
      () => {
        expect(
          screen.queryByTestId('bible-page')
        ).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Should show notes content
    await waitFor(
      () => {
        // TagNotesRoute shows "X notes" text
        // or "No notes found" when empty
        // Mantine splits text across nodes,
        // so check textContent of the body
        const allText =
          document.body.textContent || '';
        expect(
          allText.includes('notes') ||
          allText.includes('No notes')
        ).toBe(true);
      },
      { timeout: 3000 }
    );
  });

  it('shows error message when getTags fails (API error)', async () => {
    const { getTags } = await import('../../api');
    vi.mocked(getTags).mockRejectedValueOnce(
      new Error('Network error')
    );

    render(
      <MemoryRouter initialEntries={['/notes']}>
        <Routes>
          <Route
            path="/notes"
            element={<NotesRoute />}
          />
          <Route
            path="/notes/tag/:tagId"
            element={
              <div data-testid="tag-notes">
                Tag Notes
              </div>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // When getTags fails, NotesRoute should NOT
    // stay stuck on loader forever. It should
    // either show an error or navigate back.
    await waitFor(
      () => {
        const loader =
          screen.queryByLabelText('Loading notes');
        // Loader should disappear after error
        expect(loader).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('shows error UI when getTags fails and user is authenticated', async () => {
    // Mock the store's getTags to reject
    useBibleStore.setState({
      getTags: vi.fn().mockRejectedValue(
        new Error('Network error')
      ),
    });

    render(
      <MemoryRouter initialEntries={['/notes']}>
        <Routes>
          <Route
            path="/notes"
            element={<NotesRoute />}
          />
          <Route
            path="/notes/tag/:tagId"
            element={<TagNotesRoute />}
          />
        </Routes>
      </MemoryRouter>
    );

    // After getTags fails, should show an error
    // message, NOT stay stuck on loader
    await waitFor(
      () => {
        const allText =
          document.body.textContent || '';
        // Should show some error feedback
        const hasError =
          allText.includes('Failed') ||
          allText.includes('Error') ||
          allText.includes('error') ||
          allText.includes('retry');
        expect(hasError).toBe(true);
      },
      { timeout: 3000 }
    );
  });
});
