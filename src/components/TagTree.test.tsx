import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ComponentProps } from 'react';
import {
  act,
  render,
  screen,
  fireEvent,
} from '@testing-library/react';
import type { DragEndEvent } from '@dnd-kit/core';
import { TagTree } from './TagTree';
import { mockDomApis } from '../__tests__/helpers';
import { Tag } from '../types';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../stores/authStore';

// dnd-kit pointer gestures can't be simulated reliably under
// happy-dom — wrap the real DndContext and invoke the captured
// onDragEnd with synthetic events (TagSection.test precedent).
let capturedDragEnd:
  | ((event: DragEndEvent) => void)
  | undefined;

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@dnd-kit/core')>();
  const RealDndContext = actual.DndContext;
  return {
    ...actual,
    DndContext: (
      props: ComponentProps<typeof RealDndContext>
    ) => {
      capturedDragEnd = props.onDragEnd;
      return <RealDndContext {...props} />;
    },
  };
});

const dragEnd = (activeId: string, overId: string | null) =>
  act(() => {
    capturedDragEnd?.({
      active: { id: activeId },
      over: overId === null ? null : { id: overId },
    } as unknown as DragEndEvent);
  });

const makeTag = (
  id: string,
  name: string,
  parentTag: string | null = null
): Tag => ({
  id,
  name,
  parent_tag: parentTag,
  public: false,
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
  subtreeCounts = {},
  onTogglePublic,
  onReparent,
  reparentEnabled = false,
}: {
  tags?: Tag[];
  onEdit?: (tag: Tag) => void;
  onDelete?: (id: string, name: string) => void;
  onViewNotes?: (id: string) => void;
  noteCounts?: Record<string, number>;
  subtreeCounts?: Record<string, number>;
  onTogglePublic?: (tag: Tag) => void;
  onReparent?: (id: string, parentId: string | null) => void;
  reparentEnabled?: boolean;
} = {}) => {
  mockDomApis();
  render(
    <TagTree
      tags={tags}
      onEdit={onEdit}
      onDelete={onDelete}
      onViewNotes={onViewNotes}
      noteCounts={noteCounts}
      subtreeCounts={subtreeCounts}
      onTogglePublic={onTogglePublic}
      onReparent={onReparent}
      reparentEnabled={reparentEnabled}
    />
  );
  return { onEdit, onDelete, onViewNotes, onTogglePublic, onReparent };
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

  it('renders the dimmed +k badge when the subtree adds ' +
    'notes beyond the direct count', () => {
      renderTree({
        tags: [
          makeTag('tag-a', 'Alpha'),
          makeTag('tag-b', 'Beta', 'tag-a'),
        ],
        noteCounts: { 'tag-a': 3, 'tag-b': 2 },
        subtreeCounts: { 'tag-a': 5, 'tag-b': 2 },
      });

      expect(screen.getByText('3')).toBeInTheDocument();
      // tag-a: 5 subtree - 3 direct = +2 descendant notes.
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

  it('omits the +k badge when the subtree adds nothing', () => {
    renderTree({
      tags: [makeTag('tag-a', 'Alpha')],
      noteCounts: { 'tag-a': 3 },
      subtreeCounts: { 'tag-a': 3 },
    });

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });
});

describe('TagTree publicity', () => {
  beforeEach(() => {
    useAuthStore.setState({
      ...authInitialState,
      token: 'test-token',
      user: { username: 'testuser' },
      isAuthenticated: true,
    });
  });

  it('fires onTogglePublic from the publicity icon', () => {
    const onTogglePublic = vi.fn();
    renderTree({
      tags: [makeTag('tag-a', 'Alpha')],
      onTogglePublic,
    });

    fireEvent.click(screen.getByTitle('Make tag public'));
    expect(onTogglePublic).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tag-a' })
    );
  });

  it('labels the icon by the current publicity', () => {
    renderTree({
      tags: [
        { ...makeTag('tag-a', 'Alpha'), public: true },
      ],
      onTogglePublic: vi.fn(),
    });

    expect(
      screen.getByTitle('Make tag private')
    ).toBeInTheDocument();
  });

  it('hides the toggle when no handler is provided', () => {
    renderTree({ tags: [makeTag('tag-a', 'Alpha')] });

    expect(
      screen.queryByTitle('Make tag public')
    ).not.toBeInTheDocument();
  });
});

describe('TagTree drag reparent', () => {
  const tags = [
    makeTag('tag-a', 'Alpha'),
    makeTag('tag-b', 'Beta', 'tag-a'),
    makeTag('tag-c', 'Gamma'),
  ];

  const renderReparent = () => {
    const onReparent = vi.fn();
    renderTree({ tags, onReparent, reparentEnabled: true });
    return onReparent;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedDragEnd = undefined;
    useAuthStore.setState({
      ...authInitialState,
      token: 'test-token',
      user: { username: 'testuser' },
      isAuthenticated: true,
    });
  });

  it('shows the grip handles when reparenting is enabled', () => {
    renderReparent();

    expect(
      screen.getAllByTitle('Drag to reparent tag')
    ).toHaveLength(3);
  });

  it('hides the grip handles when reparenting is disabled',
    () => {
      renderTree({ tags });

      expect(
        screen.queryByTitle('Drag to reparent tag')
      ).not.toBeInTheDocument();
    });

  it('calls onReparent for a valid drop', () => {
    const onReparent = renderReparent();

    dragEnd('tag-c', 'tag-a');
    expect(onReparent).toHaveBeenCalledWith('tag-c', 'tag-a');
  });

  it('calls onReparent with null on the root drop zone', () => {
    const onReparent = renderReparent();

    dragEnd('tag-b', 'tag-tree-root-drop');
    expect(onReparent).toHaveBeenCalledWith('tag-b', null);
  });

  it('ignores drops with no target, onto itself, onto its ' +
    'current parent, or onto its own descendant', () => {
      const onReparent = renderReparent();

      dragEnd('tag-a', null);
      dragEnd('tag-a', 'tag-a');
      // Beta's parent is already Alpha — a no-op move.
      dragEnd('tag-b', 'tag-a');
      // Beta lives under Alpha — a circular move.
      dragEnd('tag-a', 'tag-b');
      // Alpha is already top level — the root bar no-ops too.
      dragEnd('tag-a', 'tag-tree-root-drop');

      expect(onReparent).not.toHaveBeenCalled();
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
