import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Center,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { Tag } from '../types';
import {
  deleteTag as deleteTagApi,
  reparentTag,
  setTagPublic,
} from '../api';
import { TagTree } from '../components/TagTree';
import { CreateTagModal } from '../components/CreateTagModal';
import { EditTagModal } from '../components/EditTagModal';
import { useBibleStore } from '../store';
import { clearNotesCache } from '../utils/cacheManager';
import { buildTagTree, TagNode } from '../utils/tagTree';
import { shallow } from 'zustand/shallow';

/**
 * Sums each node's own `note_count` with all of its
 * descendants' — the `+k` subtree badge in TagTree. Post-order
 * over `buildTagTree` output; missing counts treat as 0.
 */
const computeSubtreeCounts = (
  nodes: TagNode[]
): Record<string, number> => {
  const counts: Record<string, number> = {};
  const walk = (node: TagNode): number => {
    let total = node.tag.note_count ?? 0;
    for (const child of node.children) {
      total += walk(child);
    }
    counts[node.tag.id] = total;
    return total;
  };
  nodes.forEach(walk);
  return counts;
};

export default function TagManagementRoute() {
  const navigate = useNavigate();
  const { tags, getTags } = useBibleStore(
    (state) => ({
      tags: state.tags,
      getTags: state.getTags,
    }),
    shallow
  );
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  // Set while a reparent PATCH is in flight — further drops
  // are ignored and the refreshing Loader shows.
  const reparentingRef = useRef(false);

  // Handlers below are useCallback'd so memoized children
  // (TagTree, the tag modals) don't re-render on unrelated
  // state changes like search typing.
  const loadTags = useCallback(
    async (
      forceRefresh = false,
      { silent = false }: { silent?: boolean } = {}
    ) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }
      try {
        await getTags(forceRefresh);
        setInitialError(false);
      } catch (error) {
        console.error('Error loading tags:', error);
        // A failed first load must not fall through to the
        // "No tags yet" empty state — offer a retry instead.
        if (!silent) {
          setInitialError(true);
        }
        showNotification({
          title: 'Error',
          message: 'Failed to load tags',
          color: 'red',
        });
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setInitialLoading(false);
        }
      }
    },
    [getTags]
  );

  useEffect(() => {
    void loadTags(true); // Force refresh on mount
  }, [loadTags]);

  const handleDeleteTag = useCallback(
    async (tagId: string, tagName: string) => {
      const childCount = tags.filter(
        (t) => t.parent_tag === tagId
      ).length;
      if (
        window.confirm(
          `Are you sure you want to delete "${tagName}"? ` +
            'Notes assigned to it will lose this tag' +
            (childCount > 0
              ? `, and its ${childCount} child tag(s) may ` +
                'be affected'
              : '') +
            '. This action cannot be undone.'
        )
      ) {
        try {
          await deleteTagApi(tagId);
          showNotification({
            title: 'Success',
            message: 'Tag deleted successfully',
            color: 'green',
          });
          await loadTags(true, { silent: true }); // Force refresh
        } catch (error) {
          console.error('Error deleting tag:', error);
          showNotification({
            title: 'Error',
            message:
              'Failed to delete tag. It may have associated notes.',
            color: 'red',
          });
        }
      }
    },
    [loadTags, tags]
  );

  const handleEditTag = useCallback((tag: Tag) => {
    setEditingTag(tag);
  }, []);

  const handleCreateTag = useCallback(() => {
    setCreateModalOpen(true);
  }, []);

  const handleViewNotes = useCallback(
    (tagId: string) => {
      void navigate(`/notes/tag/${tagId}`);
    },
    [navigate]
  );

  const handleTogglePublic = useCallback(
    async (tag: Tag) => {
      const makingPublic = !tag.public;
      if (
        !window.confirm(
          makingPublic
            ? `Make "${tag.name}" and all notes directly ` +
                'under it public? Anyone with the link can ' +
                'view them.'
            : `Make "${tag.name}" private? ALL notes under ` +
                'it will also become private — anyone ' +
                'following a shared link loses access. ' +
                'This cannot be undone per-note.'
        )
      ) {
        return;
      }
      try {
        const result = await setTagPublic(tag.id, makingPublic);
        showNotification({
          title: 'Success',
          message:
            `Tag is now ${makingPublic ? 'public' : 'private'}` +
            ` — ${result.notes_updated} note(s) updated`,
          color: 'green',
        });
        // The tag's cached note pages reflect the old
        // publicity — drop them before the silent refetch.
        clearNotesCache(tag.id);
        await loadTags(true, { silent: true });
      } catch (error) {
        console.error('Error updating tag publicity:', error);
        showNotification({
          title: 'Error',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to update tag publicity',
          color: 'red',
        });
      }
    },
    [loadTags]
  );

  const handleReparent = useCallback(
    async (tagId: string, parentId: string | null) => {
      // One reparent write at a time — further drops are
      // ignored while the PATCH is in flight.
      if (reparentingRef.current) return;
      reparentingRef.current = true;
      setRefreshing(true);
      try {
        await reparentTag(tagId, parentId);
        showNotification({
          title: 'Success',
          message: 'Tag moved',
          color: 'green',
        });
        await loadTags(true, { silent: true });
      } catch (error) {
        console.error('Error reparenting tag:', error);
        // The API helper surfaces the server's message (e.g.
        // a same-named sibling already exists under the
        // target parent).
        showNotification({
          title: 'Error',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to move tag',
          color: 'red',
        });
      } finally {
        reparentingRef.current = false;
        setRefreshing(false);
      }
    },
    [loadTags]
  );

  const closeCreateModal = useCallback(() => {
    setCreateModalOpen(false);
  }, []);

  const closeEditModal = useCallback(() => {
    setEditingTag(null);
  }, []);

  const refreshTagsSilently = useCallback(() => {
    void loadTags(true, { silent: true });
  }, [loadTags]);

  // Matching a child must keep its ancestors in the list —
  // otherwise the tree renders the match as a root and the
  // hierarchy (and the path to it) is lost.
  const tagById = useMemo(
    () => new Map(tags.map((t) => [t.id, t])),
    [tags]
  );
  // Derived counts — memoized on `tags` so rows never redo the
  // subtree walk per render (perf: derived state, not
  // per-render work).
  const noteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tag of tags) {
      counts[tag.id] = tag.note_count ?? 0;
    }
    return counts;
  }, [tags]);
  const subtreeCounts = useMemo(
    () => computeSubtreeCounts(buildTagTree(tags)),
    [tags]
  );
  const filteredTags = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return tags;
    const keep = new Set<string>();
    for (const tag of tags) {
      if (!tag.name.toLowerCase().includes(query)) continue;
      let current: Tag | undefined = tag;
      while (current && !keep.has(current.id)) {
        keep.add(current.id);
        current = current.parent_tag
          ? tagById.get(current.parent_tag)
          : undefined;
      }
    }
    return tags.filter((t) => keep.has(t.id));
  }, [tags, searchQuery, tagById]);
  const searching = searchQuery.trim().length > 0;

  if (initialLoading && tags.length === 0) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader size="lg" aria-label="Loading tags" />
      </Center>
    );
  }

  if (initialError && tags.length === 0) {
    return (
      <Center style={{ height: '100vh' }}>
        <Stack align="center" spacing="sm">
          <Text color="red" size="lg">
            Failed to load your tags.
          </Text>
          <Button
            variant="light"
            onClick={() => void loadTags(true)}
          >
            Try again
          </Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Box
      p="md"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <Group position="apart" mb="lg">
        <Title order={2}>Tag Management</Title>
        <Button
          leftIcon={<IconPlus size={16} />}
          onClick={handleCreateTag}
        >
          New Tag
        </Button>
      </Group>

      <TextInput
        placeholder="Search tags..."
        icon={<IconSearch size={16} />}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.currentTarget.value)}
        mb="md"
        style={{ maxWidth: 400 }}
      />

      {filteredTags.length === 0 ? (
        <Center style={{ flex: 1, minHeight: 0 }}>
          <Stack align="center" spacing="xs">
            <Text color="dimmed">
              {searchQuery
                ? 'No tags found matching your search'
                : 'No tags yet'}
            </Text>
            {!searchQuery && (
              <Button
                variant="light"
                leftIcon={<IconPlus size={16} />}
                onClick={handleCreateTag}
              >
                Create your first tag
              </Button>
            )}
          </Stack>
        </Center>
      ) : (
        <>
          <Group spacing="xs" mb="md">
            <Text color="dimmed" size="sm">
              {filteredTags.length}{' '}
              {filteredTags.length === 1 ? 'tag' : 'tags'}
            </Text>
            {refreshing && <Loader size="xs" />}
          </Group>
          <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
            <TagTree
              tags={filteredTags}
              onEdit={handleEditTag}
              onDelete={handleDeleteTag}
              onViewNotes={handleViewNotes}
              noteCounts={noteCounts}
              subtreeCounts={subtreeCounts}
              onTogglePublic={handleTogglePublic}
              onReparent={handleReparent}
              reparentEnabled
              forceExpand={searching}
            />
          </ScrollArea>
        </>
      )}

      <CreateTagModal
        opened={createModalOpen}
        onClose={closeCreateModal}
        onSuccess={refreshTagsSilently}
        existingTags={tags}
      />

      <EditTagModal
        opened={!!editingTag}
        onClose={closeEditModal}
        onSuccess={refreshTagsSilently}
        tag={editingTag}
        existingTags={tags}
      />
    </Box>
  );
}
