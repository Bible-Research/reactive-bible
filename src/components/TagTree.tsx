import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconEdit,
  IconEye,
  IconFolder,
  IconFolderOpen,
  IconTag,
  IconTrash,
} from '@tabler/icons-react';
import { Tag } from '../types';

interface TagNode {
  tag: Tag;
  children: TagNode[];
}

interface TagTreeProps {
  tags: Tag[];
  onEdit: (tag: Tag) => void;
  onDelete: (tagId: string, tagName: string) => void;
  onViewNotes: (tagId: string) => void;
  noteCounts?: Record<string, number>;
}

export function TagTree({
  tags,
  onEdit,
  onDelete,
  onViewNotes,
  noteCounts = {},
}: TagTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const buildTree = (tags: Tag[]): TagNode[] => {
    const map = new Map<string, TagNode>();
    const roots: TagNode[] = [];

    tags.forEach((tag) => {
      map.set(tag.id, { tag, children: [] });
    });

    tags.forEach((tag) => {
      const node = map.get(tag.id)!;
      if (tag.parent_tag) {
        const parent = map.get(tag.parent_tag);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    const sortNodes = (nodes: TagNode[]): TagNode[] => {
      return nodes
        .sort((a, b) => a.tag.name.localeCompare(b.tag.name))
        .map((node) => ({
          ...node,
          children: sortNodes(node.children),
        }));
    };

    return sortNodes(roots);
  };

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const renderNode = (node: TagNode, level: number): JSX.Element => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.tag.id);
    const noteCount = noteCounts[node.tag.id] || 0;
    const indent = level * 24;

    return (
      <Box key={node.tag.id}>
        <Paper
          p="xs"
          withBorder
          style={{
            marginLeft: indent,
            cursor: hasChildren ? 'pointer' : 'default',
          }}
          onClick={() => hasChildren && toggleNode(node.tag.id)}
        >
          <Group position="apart" spacing="xs">
            <Group spacing="xs" style={{ flex: 1 }}>
              {hasChildren ? (
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNode(node.tag.id);
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
                  <IconFolderOpen size={18} color="var(--mantine-color-blue-6)" />
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

              {noteCount > 0 && (
                <Badge size="sm" variant="light" color="blue">
                  {noteCount}
                </Badge>
              )}
            </Group>

            <Group spacing={4}>
              <Tooltip label="View notes" position="top">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="blue"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewNotes(node.tag.id);
                  }}
                >
                  <IconEye size={16} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Edit tag" position="top">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(node.tag.id, node.tag.name);
                  }}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Paper>

        {hasChildren && (
          <Collapse in={isExpanded}>
            <Stack spacing="xs" mt="xs">
              {node.children.map((child) => renderNode(child, level + 1))}
            </Stack>
          </Collapse>
        )}
      </Box>
    );
  };

  const tree = buildTree(tags);

  if (tree.length === 0) {
    return null;
  }

  return (
    <Stack spacing="xs">
      {tree.map((node) => renderNode(node, 0))}
    </Stack>
  );
}
