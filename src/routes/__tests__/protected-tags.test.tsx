/**
 * /tags route protection (issue #68): the tag-management page
 * exists only to write user-owned tags, so anonymous visitors
 * must be redirected to /login — while the public share pages
 * (/notes/tag/:tagId, /notes/:noteId) stay reachable.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../index';
import { useBibleStore, initialState } from '../../store';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../../stores/authStore';

// Lightweight stand-ins for the routes under test.
vi.mock('../TagManagementRoute', () => ({
  default: () => (
    <div data-testid="tag-management-route">TagManagement</div>
  ),
}));

vi.mock('../TagNotesRoute', () => ({
  default: () => (
    <div data-testid="tag-notes-route">TagNotes</div>
  ),
}));

vi.mock('../../components/LoginPage', () => ({
  LoginPage: () => <div data-testid="login-page">Login</div>,
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );

describe('/tags route protection (issue #68)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBibleStore.setState(initialState);
    useAuthStore.setState(authInitialState);
  });

  it('redirects anonymous visitors from /tags to /login',
    async () => {
      renderAt('/tags');

      await waitFor(() => {
        expect(screen.getByTestId('login-page'))
          .toBeInTheDocument();
      });
      expect(screen.queryByTestId('tag-management-route'))
        .not.toBeInTheDocument();
    });

  it('renders /tags for authenticated users', async () => {
    useAuthStore.setState({
      token: 'test-token',
      user: { username: 'testuser' },
      isAuthenticated: true,
    });

    renderAt('/tags');

    await waitFor(() => {
      expect(screen.getByTestId('tag-management-route'))
        .toBeInTheDocument();
    });
  });

  it('admits a persisted session before checkAuth runs',
    async () => {
      // `token` rehydrates synchronously from localStorage while
      // `isAuthenticated` only flips after App's mount checkAuth
      // — a cold load of /tags must not bounce logged-in users.
      useAuthStore.setState({
        token: 'test-token',
        user: { username: 'testuser' },
        isAuthenticated: false,
      });

      renderAt('/tags');

      await waitFor(() => {
        expect(screen.getByTestId('tag-management-route'))
          .toBeInTheDocument();
      });
      expect(screen.queryByTestId('login-page'))
        .not.toBeInTheDocument();
    });

  it('keeps /notes/tag/:tagId public for sharing', async () => {
    renderAt('/notes/tag/tag-1');

    await waitFor(() => {
      expect(screen.getByTestId('tag-notes-route'))
        .toBeInTheDocument();
    });
    expect(screen.queryByTestId('login-page'))
      .not.toBeInTheDocument();
  });
});
