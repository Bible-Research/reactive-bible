/**
 * MainMenu auth gating (issue #68): "New Note" and "Tag
 * Management" lead to write flows — they must not be offered
 * to anonymous visitors.
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

describe('MainMenu auth gating (issue #68)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBibleStore.setState(initialState);
    useAuthStore.setState(authInitialState);
  });

  it('hides write affordances for anonymous visitors', () => {
    renderMenu();

    expect(screen.queryByText('New Note'))
      .not.toBeInTheDocument();
    expect(screen.queryByText('Tag Management'))
      .not.toBeInTheDocument();
    // Read-only navigation stays visible.
    expect(screen.getByText('View Notes')).toBeInTheDocument();
    expect(screen.getByText('Read Bible')).toBeInTheDocument();
  });

  it('shows write affordances when authenticated', () => {
    useAuthStore.setState({
      token: 'test-token',
      user: { username: 'testuser' },
      isAuthenticated: true,
    });

    renderMenu();

    expect(screen.getByText('New Note')).toBeInTheDocument();
    expect(screen.getByText('Tag Management'))
      .toBeInTheDocument();
  });
});
