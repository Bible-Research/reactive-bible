import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
} from '@testing-library/react';
import { TagTree } from './TagTree';
import { mockDomApis } from '../__tests__/helpers';
import { Tag } from '../types';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../stores/authStore';

const makeTag = (
  id: string,
  name: string,
  parentTag: string | null = null
): Tag => ({
  id,
  name,
  parent_tag: parentTag,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
});

const renderTree = ({
  tags = [
    makeTag('tag-a', 'Alpha'),
    makeTag('tag-b', 'Beta', 'tag-a'),
    makeTag('tag-c', 'Gamma'),
  ],
  onEdit = vi.fn(),
  onDelete = vi.fn(),
  onViewNotes = vi.fn(),
  noteCounts = {},
}: {
  tags?: Tag[];
  onEdit?: (tag: Tag) => void;
  onDelete?: (id: string, name: string) => void;
  onViewNotes?: (id: string) => void;
  noteCounts?: Record<string, number>;
} = {}) => {
  mockDomApis();
  render(
    <TagTree
      tags={tags}
      onEdit={onEdit}
      onDelete={onDelete}
      onViewNotes={onViewNotes}
      noteCounts={noteCounts}
    />
  );
  return { onEdit, onDelete, onViewNotes };
};

describe('TagTree', () => {
  beforeEach(() => {
    // TagTree gates edit/delete affordances on isAuthenticated
    // (issue #68) — these tests exercise those actions.
    useAuthStore.setState({
      ...authInitialState,
      token: 'test-token',
      user: { username: 'testuser' },
      isAuthenticated: true,
    });
  });

  it('renders nothing for an empty tag list', () => {
    mockDomApis();
    const { container } = render(
      <TagTree
        tags={[]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onViewNotes={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders root tags but keeps children collapsed ' +
    'by default', () => {
      renderTree();

      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Gamma')).toBeInTheDocument();
      // Beta is nested under Alpha; Mantine Collapse keeps it
      // mounted but aria-hidden while collapsed.
      const beta = screen.getByText('Beta');
      const collapse = beta.closest('[aria-hidden]');
      expect(collapse).toHaveAttribute('aria-hidden', 'true');
    });

  it('expands a parent to reveal children, then collapses',
    () => {
      renderTree();

      fireEvent.click(screen.getByText('Alpha'));
      const beta = screen.getByText('Beta');
      expect(beta.closest('[aria-hidden]'))
        .toHaveAttribute('aria-hidden', 'false');

      fireEvent.click(screen.getByText('Alpha'));
      expect(beta.closest('[aria-hidden]'))
        .toHaveAttribute('aria-hidden', 'true');
    });

  it('sorts siblings alphabetically', () => {
    renderTree({
      tags: [
        makeTag('tag-z', 'Zulu'),
        makeTag('tag-a', 'Alpha'),
        makeTag('tag-m', 'Mike'),
      ],
    });

    const names = screen
      .getAllByText(/Alpha|Mike|Zulu/)
      .map((el) => el.textContent);
    expect(names).toEqual(['Alpha', 'Mike', 'Zulu']);
  });

  it('shows the note-count badge only when non-zero', () => {
    renderTree({
      tags: [makeTag('tag-a', 'Alpha')],
      noteCounts: { 'tag-a': 7 },
    });

    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('invokes onViewNotes/onEdit/onDelete with the tag',
    () => {
      const { onEdit, onDelete, onViewNotes } = renderTree({
        tags: [makeTag('tag-a', 'Alpha')],
      });

      const [viewBtn, editBtn, deleteBtn] = [
        ...document.querySelectorAll(
          '.mantine-Paper-root button'
        ),
      ] as HTMLElement[];

      fireEvent.click(viewBtn);
      expect(onViewNotes).toHaveBeenCalledWith('tag-a');

      fireEvent.click(editBtn);
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tag-a' })
      );

      fireEvent.click(deleteBtn);
      expect(onDelete).toHaveBeenCalledWith('tag-a', 'Alpha');
    });

  it('treats a tag whose parent is missing as a root', () => {
    renderTree({
      tags: [makeTag('tag-o', 'Orphan', 'tag-missing')],
    });

    expect(screen.getByText('Orphan')).toBeInTheDocument();
  });
});

/**
 * TagTree auth gating (issue #68): defense in depth — even if
 * the tree is ever rendered on a public surface, the edit and
 * delete affordances must stay hidden from anonymous visitors.
 */
describe('TagTree auth gating (issue #68)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState(authInitialState);
  });

  it('hides edit/delete actions for anonymous visitors', () => {
    renderTree({ tags: [makeTag('tag-1', 'Bible Study')] });

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

    renderTree({ tags: [makeTag('tag-1', 'Bible Study')] });

    expect(screen.getByTitle('Edit tag')).toBeInTheDocument();
    expect(screen.getByTitle('Delete tag')).toBeInTheDocument();
  });
});
