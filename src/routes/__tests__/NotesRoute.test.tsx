import { StrictMode } from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotesRoute from '../NotesRoute';
import { useBibleStore, initialState } from '../../store';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../../stores/authStore';
import { Tag } from '../../types';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<
    typeof import('react-router-dom')
  >('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const tagA: Tag = {
  id: 'tag-a',
  name: 'Alpha',
  parent_tag: null,
  created_at: '',
  updated_at: '',
};
const tagB: Tag = {
  id: 'tag-b',
  name: 'Beta',
  parent_tag: null,
  created_at: '',
  updated_at: '',
};

const renderRoute = ({
  token = 'test-token',
  tags = [tagB, tagA],
  lastSelectedTagId = null,
  strict = false,
}: {
  token?: string | null;
  tags?: Tag[];
  lastSelectedTagId?: string | null;
  strict?: boolean;
} = {}) => {
  // getTags is the store action NotesRoute calls; the mock
  // resolves and leaves `tags` as the store already holds.
  const getTags = vi.fn().mockResolvedValue(undefined);
  useBibleStore.setState({
    ...initialState,
    tags,
    lastSelectedTagId,
    getTags,
  });
  useAuthStore.setState({
    ...authInitialState,
    token,
    // Deliberately left false even when a token exists:
    // the token hydrates synchronously from localStorage
    // while isAuthenticated only flips after checkAuth.
    isAuthenticated: false,
  });
  const ui = (
    <MemoryRouter>
      <NotesRoute />
    </MemoryRouter>
  );
  return {
    getTags,
    ...render(strict ? <StrictMode>{ui}</StrictMode> : ui),
  };
};

describe('NotesRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loader while it decides where to go', () => {
    renderRoute({ token: null });
    expect(
      screen.getByLabelText('Loading notes')
    ).toBeInTheDocument();
  });

  it('redirects anonymous visitors to /bible', async () => {
    renderRoute({ token: null });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/bible', {
        replace: true,
      });
    });
  });

  it('navigates on token alone — the hydration race where ' +
    'isAuthenticated is still false', async () => {
    renderRoute({ token: 'hydrated', lastSelectedTagId: 'tag-b' });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/notes/tag/tag-b',
        { replace: true }
      );
    });
  });

  it('falls back to the alphabetically first tag when the ' +
    'stored tag no longer exists', async () => {
    renderRoute({ lastSelectedTagId: 'tag-gone' });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/notes/tag/tag-a',
        { replace: true }
      );
    });
  });

  it('shows an empty state when the user has no tags',
    async () => {
      // Zero tags used to leave the loader spinning forever —
      // new accounts now get a real empty state with a CTA.
      const { getTags } = renderRoute({ tags: [] });

      await waitFor(() => {
        expect(getTags).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(
          screen.getByText(/No tags yet/)
        ).toBeInTheDocument();
      });
      expect(
        screen.getByRole('button', {
          name: /create your first tag/i,
        })
      ).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

  it('navigates only once under StrictMode double-mount ' +
    'for the anonymous redirect', async () => {
      // The hasNavigatedRef guard runs synchronously on this
      // path, so the second mount's effect returns early.
      renderRoute({ token: null, strict: true });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/bible', {
          replace: true,
        });
      });
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

  it('StrictMode may double-navigate the tag path — the ' +
    'guard is set only after getTags resolves — but every ' +
    'call targets the same tag with replace', async () => {
      renderRoute({ strict: true });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/notes/tag/tag-a',
          { replace: true }
        );
      });
      // Pin the idempotent outcome; the duplicate dispatch is
      // a known gap (hasNavigatedRef is assigned after the
      // await, so both mount effects start navigateToTag).
      expect(
        mockNavigate.mock.calls.every(
          (call) =>
            call[0] === '/notes/tag/tag-a' &&
            (call[1] as { replace?: boolean })?.replace === true
        )
      ).toBe(true);
    });

  it('shows an error with retry when getTags rejects',
    async () => {
      vi.spyOn(console, 'error').mockImplementation(
        () => undefined
      );
      // First load fails; the retry succeeds so the route
      // recovers to the tag navigation instead of sticking on
      // the error state.
      const getTags = vi
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue(undefined);
      useBibleStore.setState({
        ...initialState,
        tags: [tagB, tagA],
        getTags,
      });
      useAuthStore.setState({
        ...authInitialState,
        token: 'test-token',
        isAuthenticated: false,
      });

      render(
        <MemoryRouter>
          <NotesRoute />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('Failed to load your tags.')
        ).toBeInTheDocument();
      });
      expect(mockNavigate).not.toHaveBeenCalled();

      fireEvent.click(
        screen.getByRole('button', { name: /try again/i })
      );

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/notes/tag/tag-a',
          { replace: true }
        );
      });
    });

  it('never fetches tags for anonymous visitors', async () => {
    // Anonymous sessions redirect to /bible — getTags must not
    // run at all (it would hit an authed endpoint and trip the
    // "session expired" flow).
    const { getTags } = renderRoute({ token: null });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/bible', {
        replace: true,
      });
    });
    expect(getTags).not.toHaveBeenCalled();
  });
});
