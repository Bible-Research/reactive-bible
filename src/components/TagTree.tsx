import { useCallback, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconEdit,
  IconEye,
  IconFolder,
  IconFolderOpen,
  IconGripVertical,
  IconTag,
  IconTrash,
  IconWorld,
  IconWorldOff,
} from '@tabler/icons-react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Tag } from '../types';
import {
  buildTagTree,
  isTagDescendant,
  TagNode,
} from '../utils/tagTree';
import { useAuthStore } from '../stores/authStore';

/**
 * Id of the "Move to top level" droppable bar shown under the
 * tree while a reparent drag is active. Namespaced so it can
 * never collide with a real `TAG…` id.
 */
const ROOT_DROP_ID = 'tag-tree-root-drop';

interface TagTreeProps {
  tags: Tag[];
  onEdit: (tag: Tag) => void;
  onDelete: (tagId: string, tagName: string) => void;
  onViewNotes: (tagId: string) => void;
  noteCounts?: Record<string, number>;
  /**
   * Direct + descendant note totals per tag — the dimmed `+k`
   * badge renders the descendant share beside the direct
   * count when it adds anything.
   */
  subtreeCounts?: Record<string, number>;
  /** Cascade publicity toggle — the route confirms and POSTs
   *  set-public before this resolves. */
  onTogglePublic?: (tag: Tag) => void;
  /**
   * Drag-onto-node reparent — fires only after the drop
   * guards (self / same-parent / descendant) pass. The
   * EditTagModal parent Select stays the non-drag fallback
   * for reparenting, so the feature is never drag-only.
   */
  onReparent?: (tagId: string, parentId: string | null) => void;
  /** Shows the per-row grip handles that start a reparent
   *  drag. */
  reparentEnabled?: boolean;
  /** Expand every node (e.g. while a search filter is active so
   *  matched descendants stay visible under their ancestors). */
  forceExpand?: boolean;
}

interface TagTreeNodeProps {
  node: TagNode;
  level: number;
  tags: Tag[];
  noteCounts: Record<string, number>;
  subtreeCounts: Record<string, number>;
  forceExpand: boolean;
  expandedNodes: Set<string>;
  isAuthenticated: boolean;
  reparentEnabled: boolean;
  /** The tag currently mid-drag, or null between drags. */
  activeDragTag: Tag | null;
  onToggleNode: (nodeId: string) => void;
  onEdit: (tag: Tag) => void;
  onDelete: (tagId: string, tagName: string) => void;
  onViewNotes: (tagId: string) => void;
  onTogglePublic?: (tag: Tag) => void;
}

/**
 * One row of the tag tree plus its collapsed children. Split
 * out of the old renderNode loop so each node can own
 * `useDraggable`/`useDroppable` hooks — reparenting is
 * drag-onto-node, not sortable.
 */
const TagTreeNode = ({
  node,
  level,
  tags,
  noteCounts,
  subtreeCounts,
  forceExpand,
  expandedNodes,
  isAuthenticated,
  reparentEnabled,
  activeDragTag,
  onToggleNode,
  onEdit,
  onDelete,
  onViewNotes,
  onTogglePublic,
}: TagTreeNodeProps) => {
  const hasChildren = node.children.length > 0;
  const isExpanded =
    forceExpand || expandedNodes.has(node.tag.id);
  const noteCount = noteCounts[node.tag.id] || 0;
  const subtreeTotal = subtreeCounts[node.tag.id] ?? noteCount;
  const descendantCount = subtreeTotal - noteCount;
  const indent = level * 24;

  // Drop targets that would no-op or create a cycle are
  // disabled outright — `isOver` never lights them up, and
  // they dim so the user sees the rejection mid-drag. Mirrors
  // the backend `validate_parent_tag` rules.
  const dropDisabled =
    activeDragTag !== null &&
    (node.tag.id === activeDragTag.id ||
      node.tag.id === activeDragTag.parent_tag ||
      isTagDescendant(tags, activeDragTag.id, node.tag.id));
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: node.tag.id,
    disabled: !reparentEnabled || dropDisabled,
  });
  // The grip is the drag handle — the row tap keeps
  // expanding/collapsing, so there is no gesture conflict on
  // touch.
  const {
    setNodeRef: setGripRef,
    listeners,
    attributes,
  } = useDraggable({
    id: node.tag.id,
    disabled: !reparentEnabled,
  });

  return (
    <Box>
      <Paper
        ref={setDropRef}
        p="xs"
        withBorder
        style={{
          marginLeft: indent,
          cursor: hasChildren ? 'pointer' : 'default',
          opacity: activeDragTag && dropDisabled ? 0.5 : 1,
          outline: isOver
            ? '2px solid var(--mantine-color-blue-5)'
            : undefined,
        }}
        onClick={() => hasChildren && onToggleNode(node.tag.id)}
      >
        <Group position="apart" spacing="xs">
          <Group spacing="xs" style={{ flex: 1 }}>
            {reparentEnabled && isAuthenticated && (
              <Tooltip
                label="Drag to move under another tag"
                position="top"
              >
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  title="Drag to reparent tag"
                  ref={setGripRef}
                  {...listeners}
                  {...attributes}
                  onClick={(e) => e.stopPropagation()}
                  style={{ cursor: 'grab', touchAction: 'none' }}
                >
                  <IconGripVertical size={16} />
                </ActionIcon>
              </Tooltip>
            )}

            {hasChildren ? (
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleNode(node.tag.id);
                }}
              >
                {isExpanded ? (
                  <IconChevronDown size={16} />
                ) : (
                  <IconChevronRight size={16} />
                )}
              </ActionIcon>
            ) : (
              <Box style={{ width: 28 }} />
            )}

            {hasChildren ? (
              isExpanded ? (
                <IconFolderOpen
                  size={18}
                  color="var(--mantine-color-blue-6)"
                />
              ) : (
                <IconFolder size={18} color="var(--mantine-color-blue-6)" />
              )
            ) : (
              <IconTag size={18} color="var(--mantine-color-gray-6)" />
            )}

            <Text
              size="sm"
              weight={hasChildren ? 500 : 400}
              style={{ flex: 1 }}
            >
              {node.tag.name}
            </Text>

            {node.tag.public && (
              <Tooltip
                label="Public tag — notes are viewable by link"
                position="top"
              >
                <ThemeIcon size="sm" color="teal" variant="light">
                  <IconWorld size={12} />
                </ThemeIcon>
              </Tooltip>
            )}

            {noteCount > 0 && (
              <Badge size="sm" variant="light" color="blue">
                {noteCount}
              </Badge>
            )}

            {descendantCount > 0 && (
              <Tooltip
                label="includes notes in sub-tags"
                position="top"
              >
                <Badge size="sm" variant="light" color="gray">
                  +{descendantCount}
                </Badge>
              </Tooltip>
            )}
          </Group>

          <Group spacing={4}>
            {isAuthenticated && onTogglePublic && (
              <Tooltip
                label={
                  node.tag.public
                    ? 'Make tag private'
                    : 'Make tag public'
                }
                position="top"
              >
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color={node.tag.public ? 'teal' : 'gray'}
                  title={
                    node.tag.public
                      ? 'Make tag private'
                      : 'Make tag public'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePublic(node.tag);
                  }}
                >
                  {node.tag.public ? (
                    <IconWorld size={16} />
                  ) : (
                    <IconWorldOff size={16} />
                  )}
                </ActionIcon>
              </Tooltip>
            )}

            <Tooltip label="View notes" position="top">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="blue"
                title="View notes"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewNotes(node.tag.id);
                }}
              >
                <IconEye size={16} />
              </ActionIcon>
            </Tooltip>

            {isAuthenticated && (
              <>
                <Tooltip label="Edit tag" position="top">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    title="Edit tag"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(node.tag);
                    }}
                  >
                    <IconEdit size={16} />
                  </ActionIcon>
                </Tooltip>

                <Tooltip label="Delete tag" position="top">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    title="Delete tag"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(node.tag.id, node.tag.name);
                    }}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </>
            )}
          </Group>
        </Group>
      </Paper>

      {hasChildren && (
        <Collapse in={isExpanded}>
          <Stack spacing="xs" mt="xs">
            {node.children.map((child) => (
              <TagTreeNode
                key={child.tag.id}
                node={child}
                level={level + 1}
                tags={tags}
                noteCounts={noteCounts}
                subtreeCounts={subtreeCounts}
                forceExpand={forceExpand}
                expandedNodes={expandedNodes}
                isAuthenticated={isAuthenticated}
                reparentEnabled={reparentEnabled}
                activeDragTag={activeDragTag}
                onToggleNode={onToggleNode}
                onEdit={onEdit}
                onDelete={onDelete}
                onViewNotes={onViewNotes}
                onTogglePublic={onTogglePublic}
              />
            ))}
          </Stack>
        </Collapse>
      )}
    </Box>
  );
};

/** "Move to top level" bar shown under the tree mid-drag —
 *  dropping here reparents the dragged tag to root. */
const RootDropZone = ({ disabled }: { disabled: boolean }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: ROOT_DROP_ID,
    disabled,
  });
  return (
    <Paper
      ref={setNodeRef}
      p="xs"
      mt="xs"
      withBorder
      style={{
        borderStyle: 'dashed',
        opacity: disabled ? 0.5 : 1,
        backgroundColor: isOver
          ? 'var(--mantine-color-blue-0)'
          : undefined,
      }}
    >
      <Text size="sm" color="dimmed" align="center">
        Move to top level
      </Text>
    </Paper>
  );
};

export function TagTree({
  tags,
  onEdit,
  onDelete,
  onViewNotes,
  noteCounts = {},
  subtreeCounts = {},
  onTogglePublic,
  onReparent,
  reparentEnabled = false,
  forceExpand = false,
}: TagTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set()
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(
    null
  );
  // Defense in depth: /tags is a protected route, but the
  // edit/delete affordances stay auth-gated in case this tree
  // is ever rendered on a public surface.
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  const activeDragTag = activeDragId
    ? tags.find((t) => t.id === activeDragId) ?? null
    : null;

  // Same sensor setup as the note reorder in TagSection so
  // desktop and Capacitor Android behave identically.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragCancel = () => {
    setActiveDragId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || !reparentEnabled) return;

    const draggedId = String(active.id);
    const dragged = tags.find((t) => t.id === draggedId);
    if (!dragged) return;

    if (over.id === ROOT_DROP_ID) {
      // Already a root-level tag — a no-op drop.
      if (dragged.parent_tag === null) return;
      onReparent?.(draggedId, null);
      return;
    }

    const overId = String(over.id);
    // Silently ignored drops: the tag itself, its current
    // parent (no-op), or one of its own descendants — the last
    // mirrors the backend's circular-parent rejection.
    if (overId === draggedId) return;
    if (overId === dragged.parent_tag) return;
    if (isTagDescendant(tags, draggedId, overId)) return;
    onReparent?.(draggedId, overId);
  };

  const tree = buildTagTree(tags);

  if (tree.length === 0) {
    return null;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <Stack spacing="xs">
        {tree.map((node) => (
          <TagTreeNode
            key={node.tag.id}
            node={node}
            level={0}
            tags={tags}
            noteCounts={noteCounts}
            subtreeCounts={subtreeCounts}
            forceExpand={forceExpand}
            expandedNodes={expandedNodes}
            isAuthenticated={isAuthenticated}
            reparentEnabled={reparentEnabled}
            activeDragTag={activeDragTag}
            onToggleNode={toggleNode}
            onEdit={onEdit}
            onDelete={onDelete}
            onViewNotes={onViewNotes}
            onTogglePublic={onTogglePublic}
          />
        ))}
      </Stack>
      {activeDragTag !== null && (
        <RootDropZone
          disabled={
            !reparentEnabled || activeDragTag.parent_tag === null
          }
        />
      )}
      <DragOverlay>
        {activeDragTag ? (
          <Paper withBorder p="xs" shadow="sm">
            <Text size="sm">{activeDragTag.name}</Text>
          </Paper>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
