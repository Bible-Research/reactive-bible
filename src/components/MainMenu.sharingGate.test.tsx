/**
 * MainMenu sharing gate (Sentry REACTIVE-BIBLE-WEB-15): the
 * note-sharing backend endpoints (bible_research#163) are not
 * deployed anywhere, so production builds must hide the
 * surfaces that call them — the "Shared with me" and
 * "Bookmarks" links auto-fetch missing endpoints and would
 * otherwise render a guaranteed error state.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MainMenu from './MainMenu';
import { useBibleStore, initialState } from '../store';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../stores/authStore';
import { isNoteSharingEnabled } from '../utils/platform';

// isNoteSharingEnabled reads build-time env constants, so the
// env can't be flipped per-test — the function is the seam,
// same as isPreviewDeploy in MainMenu.preview.test.tsx.
vi.mock('../utils/platform', () => ({
  isNativeApp: () => false,
  isPreviewDeploy: () => false,
  isNoteSharingEnabled: vi.fn(() => false),
}));

vi.mock('./AddStandaloneNoteModal', () => ({
  default: () => null,
}));

const defaultProps = {
  opened: true,
  onClose: vi.fn(),
  colorScheme: 'light' as const,
  toggleColorScheme: vi.fn(),
};

const renderMenu = () =>
  render(
    <MemoryRouter>
      <MainMenu {...defaultProps} />
    </MemoryRouter>
  );

describe('MainMenu sharing gate (Sentry web-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBibleStore.setState(initialState);
    useAuthStore.setState(authInitialState);
    useAuthStore.setState({
      token: 'test-token',
      user: { username: 'testuser' },
      isAuthenticated: true,
    });
  });

  it('hides sharing links on production builds', () => {
    vi.mocked(isNoteSharingEnabled).mockReturnValue(false);
    renderMenu();

    // Every destination below auto-fetches endpoints that only
    // exist on the unshipped sharing backend — the links must
    // not be offered.
    expect(screen.queryByText('Shared with me'))
      .not.toBeInTheDocument();
    expect(screen.queryByText('Bookmarks'))
      .not.toBeInTheDocument();
    // Working navigation stays visible.
    expect(screen.getByText('View Notes')).toBeInTheDocument();
    expect(screen.getByText('Explore')).toBeInTheDocument();
  });

  it('shows sharing links where the feature is enabled', () => {
    vi.mocked(isNoteSharingEnabled).mockReturnValue(true);
    renderMenu();

    expect(screen.getByText('Shared with me'))
      .toBeInTheDocument();
    expect(screen.getByText('Bookmarks')).toBeInTheDocument();
  });
});
