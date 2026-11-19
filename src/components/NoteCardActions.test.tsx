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
