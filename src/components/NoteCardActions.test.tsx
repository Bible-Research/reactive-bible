import {
  screen,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { showNotification } from '@mantine/notifications';
import NoteCardActions from './NoteCardActions';
import { server } from '../mocks/server';
import { API_BASE_URL } from '../config';
import { useAuthStore } from '../stores/authStore';
import { isNoteSharingEnabled } from '../utils/platform';
import {
  renderWithProviders,
  mockDomApis,
  createMockNote,
  createMockVerse,
  createMockTag,
} from '../__tests__/helpers';

// showNotification is asserted on directly — the Mantine
// notifications portal is not mounted in tests.
vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

// The sharing gate reads build-time env — mock it per test so
// the empty-overflow-menu case can run with sharing off.
vi.mock('../utils/platform', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/platform')>();
  return {
    ...actual,
    isNoteSharingEnabled: vi.fn(() => true),
  };
});

const singleVerseNote = createMockNote({
  id: 'n1',
  note_text: 'This is a single verse note.',
  tag: createMockTag({ id: '1', name: 'Faith' }),
  verses: [
    createMockVerse({
      book: 'Genesis',
      chapter: 1,
      verse: 1,
      text: 'In the beginning...',
    }),
  ],
});

// Edit/delete affordances are auth-gated — render as a signed-
// in user unless a case overrides the auth state.
const renderActions = (
  props: Partial<
    React.ComponentProps<typeof NoteCardActions>
  > = {},
  options?: Parameters<typeof renderWithProviders>[1]
) =>
  renderWithProviders(
    <NoteCardActions
      note={singleVerseNote}
      onViewInBible={vi.fn()}
      threadOpen={false}
      onToggleThread={vi.fn()}
      {...props}
    />,
    {
      authStoreState: { isAuthenticated: true },
      ...options,
    }
  );

// Cases ported from the rotted (skipped) NoteCard suite.
describe('NoteCardActions', () => {
  it('calls onEdit with the note when edit is clicked', () => {
    const onEdit = vi.fn();
    renderActions({ onEdit });

    fireEvent.click(
      screen.getByRole('button', { name: 'edit-note' })
    );

    expect(onEdit).toHaveBeenCalledWith(singleVerseNote);
  });

  it('calls onViewInBible with the first verse coords', () => {
    const onViewInBible = vi.fn();
    renderActions({ onViewInBible });

    fireEvent.click(
      screen.getByRole('button', { name: 'view-in-bible' })
    );

    expect(onViewInBible).toHaveBeenCalledWith('Genesis', 1, 1);
  });

  it('calls onDelete with the event and note on remove', () => {
    const onDelete = vi.fn();
    renderActions({ onDelete });

    fireEvent.click(
      screen.getByRole('button', { name: 'remove-note' })
    );

    expect(onDelete).toHaveBeenCalledWith(
      expect.any(Object),
      singleVerseNote
    );
  });

  it('hides edit/delete for a non-owner note', () => {
    const note = createMockNote({
      is_owner: false,
      verses: singleVerseNote.verses,
    });
    renderActions({
      note,
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    });

    expect(
      screen.queryByRole('button', { name: 'edit-note' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'remove-note' })
    ).not.toBeInTheDocument();
  });

  it('hides edit/delete when is_owner is absent', () => {
    // Fail-open regression: `is_owner !== false` used to show
    // the buttons for payloads missing the field entirely.
    const note = {
      ...singleVerseNote,
      is_owner: undefined,
    } as unknown as typeof singleVerseNote;
    renderActions({
      note,
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    });

    expect(
      screen.queryByRole('button', { name: 'edit-note' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'remove-note' })
    ).not.toBeInTheDocument();
  });

  it('hides share for a private note', () => {
    renderActions();

    expect(
      screen.queryByRole('button', { name: 'share-note' })
    ).not.toBeInTheDocument();
  });

  it('shows share for a public note', () => {
    renderActions({
      note: createMockNote({
        public: true,
        verses: singleVerseNote.verses,
      }),
    });

    expect(
      screen.getByRole('button', { name: 'share-note' })
    ).toBeInTheDocument();
  });

  it('hides play-from-here for a verse-less note', () => {
    renderActions({
      note: createMockNote({ id: 'n-vl', verses: [] }),
      onPlayFromNote: vi.fn(),
    });

    expect(
      screen.queryByRole('button', { name: 'play-from-n-vl' })
    ).not.toBeInTheDocument();
  });

  it('shows the comment count and toggles the thread', () => {
    const onToggleThread = vi.fn();
    renderActions(
      { commentCount: 3, onToggleThread },
      { stores: { auth: { isAuthenticated: true } } }
    );

    const button = screen.getByRole('button', { name: '3' });
    fireEvent.click(button);

    expect(onToggleThread).toHaveBeenCalled();
  });

  it('hides the comment button when commentCount is undefined', () => {
    renderActions(
      {},
      { stores: { auth: { isAuthenticated: true } } }
    );

    expect(
      screen.queryByLabelText('Add a comment')
    ).not.toBeInTheDocument();
  });

  it('bookmarks a non-owned accessible note', async () => {
    const note = createMockNote({
      id: 'shared-n1',
      is_owner: false,
      public: true,
      verses: singleVerseNote.verses,
    });
    let bookmarkedId: string | null = null;
    server.use(
      http.post(
        `${API_BASE_URL}/api/v1/notes/:noteId/bookmark/`,
        ({ params }) => {
          bookmarkedId = String(params.noteId);
          return HttpResponse.json(
            { saved: true },
            { status: 201 }
          );
        }
      )
    );
    renderActions({ note });

    fireEvent.click(
      screen.getByRole('button', { name: 'bookmark-note' })
    );

    await waitFor(() => {
      expect(bookmarkedId).toBe('shared-n1');
    });
    await waitFor(() => {
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Note saved to bookmarks',
        })
      );
    });
  });

  it('hides bookmark/copy on the reader\'s own note', () => {
    renderActions();

    expect(
      screen.queryByRole('button', { name: 'bookmark-note' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'copy-note' })
    ).not.toBeInTheDocument();
  });

  it('offers anonymous readers a login CTA with a return ' +
    'path', () => {
    mockDomApis();
    useAuthStore.setState({ isAuthenticated: false });
    // Reports where the router actually landed plus the
    // `from` the CTA handed to /login.
    const LoginProbe = () => {
      const location = useLocation();
      const from = (
        location.state as { from?: { pathname?: string } } | null
      )?.from;
      return (
        <div data-testid="login-landing">
          {`${location.pathname}|${from?.pathname ?? ''}`}
        </div>
      );
    };
    const note = createMockNote({
      id: 'pub-n1',
      is_owner: false,
      public: true,
      verses: singleVerseNote.verses,
    });
    render(
      <MemoryRouter initialEntries={['/notes/pub-n1']}>
        <Routes>
          <Route
            path="/notes/:noteId"
            element={
              <NoteCardActions
                note={note}
                onViewInBible={vi.fn()}
                threadOpen={false}
                onToggleThread={vi.fn()}
              />
            }
          />
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </MemoryRouter>
    );

    // Save/copy stay hidden — the CTA is the only entry.
    expect(
      screen.queryByRole('button', { name: 'bookmark-note' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'copy-note' })
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'login-to-save' })
    );

    expect(screen.getByTestId('login-landing'))
      .toHaveTextContent('/login|/notes/pub-n1');
  });
});

// Tag-notes view (collapseActions): only "View in Bible" and
// "Play from here" stay on the card — every secondary action
// folds into the ⋮ overflow menu.
describe('NoteCardActions collapseActions', () => {
  const openMenu = async (noteId = 'n1') => {
    fireEvent.click(
      await screen.findByLabelText(`note-actions-${noteId}`)
    );
  };

  it('keeps only view/play buttons on the card', () => {
    renderActions({
      note: createMockNote({
        public: true,
        verses: singleVerseNote.verses,
      }),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onPlayFromNote: vi.fn(),
      commentCount: 2,
      collapseActions: true,
    });

    expect(
      screen.getByRole('button', { name: 'view-in-bible' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'play-from-n1' })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('note-actions-n1')
    ).toBeInTheDocument();
    // Everything else waits inside the closed menu.
    expect(screen.queryByLabelText('edit-note'))
      .not.toBeInTheDocument();
    expect(screen.queryByLabelText('remove-note'))
      .not.toBeInTheDocument();
    expect(screen.queryByLabelText('share-note'))
      .not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '2' })
    ).not.toBeInTheDocument();
  });

  it('runs edit and remove from the overflow menu', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderActions({
      onEdit,
      onDelete,
      collapseActions: true,
    });

    await openMenu();
    fireEvent.click(await screen.findByLabelText('edit-note'));
    expect(onEdit).toHaveBeenCalledWith(singleVerseNote);

    await openMenu();
    fireEvent.click(await screen.findByLabelText('remove-note'));
    expect(onDelete).toHaveBeenCalledWith(
      expect.any(Object),
      singleVerseNote
    );
  });

  it('toggles the comment thread from the menu', async () => {
    const onToggleThread = vi.fn();
    renderActions({
      commentCount: 3,
      onToggleThread,
      collapseActions: true,
    });

    await openMenu();
    fireEvent.click(
      await screen.findByRole('menuitem', { name: '3 comments' })
    );

    expect(onToggleThread).toHaveBeenCalled();
  });

  it('offers share and bookmark from the menu for ' +
    'a readable foreign note', async () => {
      const note = createMockNote({
        id: 'shared-n1',
        is_owner: false,
        public: true,
        verses: singleVerseNote.verses,
      });
      renderActions({ note, collapseActions: true });

      await openMenu('shared-n1');
      expect(
        await screen.findByLabelText('share-note')
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText('bookmark-note')
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText('copy-note')
      ).toBeInTheDocument();
    });

  it('renders no menu when no secondary action applies', () => {
    // Sharing off + owned private note + no edit/delete
    // handlers + no comment count — nothing is left for the
    // menu. `mockReturnValueOnce` keeps the override scoped
    // to this render instead of leaking to later tests.
    vi.mocked(isNoteSharingEnabled).mockReturnValueOnce(false);
    renderActions({ collapseActions: true });

    expect(
      screen.queryByLabelText('note-actions-n1')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'view-in-bible' })
    ).toBeInTheDocument();
  });
});
