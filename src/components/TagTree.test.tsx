/**
 * TagTree auth gating (issue #68): defense in depth — even if
 * the tree is ever rendered on a public surface, the edit and
 * delete affordances must stay hidden from anonymous visitors.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TagTree } from './TagTree';
import { Tag } from '../types';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../stores/authStore';

const tag: Tag = {
  id: 'tag-1',
  name: 'Bible Study',
  parent_tag: null,
  created_at: '',
  updated_at: '',
};

const noop = vi.fn();

const renderTree = () =>
  render(
    <TagTree
      tags={[tag]}
      onEdit={noop}
      onDelete={noop}
      onViewNotes={noop}
    />
  );

describe('TagTree auth gating (issue #68)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState(authInitialState);
  });

  it('hides edit/delete actions for anonymous visitors', () => {
    renderTree();

    expect(screen.queryByTitle('Edit tag'))
      .not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete tag'))
      .not.toBeInTheDocument();
    // Read-only navigation stays visible.
    expect(screen.getByTitle('View notes')).toBeInTheDocument();
  });

  it('shows edit/delete actions when authenticated', () => {
    useAuthStore.setState({
      token: 'test-token',
      user: { username: 'testuser' },
      isAuthenticated: true,
    });

    renderTree();

    expect(screen.getByTitle('Edit tag')).toBeInTheDocument();
    expect(screen.getByTitle('Delete tag')).toBeInTheDocument();
  });
});
