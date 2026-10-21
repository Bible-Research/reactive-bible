import { useEffect, useMemo, useState } from 'react';
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
import { deleteTag as deleteTagApi } from '../api';
import { TagTree } from '../components/TagTree';
import { CreateTagModal } from '../components/CreateTagModal';
import { EditTagModal } from '../components/EditTagModal';
import { useBibleStore } from '../store';
import { shallow } from 'zustand/shallow';

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

  useEffect(() => {
    loadTags(true); // Force refresh on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTags = async (
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
  };

  const handleDeleteTag = async (tagId: string, tagName: string) => {
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
          message: 'Failed to delete tag. It may have associated notes.',
          color: 'red',
        });
      }
    }
  };

  const handleEditTag = (tag: Tag) => {
    setEditingTag(tag);
  };

  const handleCreateTag = () => {
    setCreateModalOpen(true);
  };

  const handleViewNotes = (tagId: string) => {
    navigate(`/notes/tag/${tagId}`);
  };

  // Matching a child must keep its ancestors in the list —
  // otherwise the tree renders the match as a root and the
  // hierarchy (and the path to it) is lost.
  const tagById = useMemo(
    () => new Map(tags.map((t) => [t.id, t])),
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
              forceExpand={searching}
            />
          </ScrollArea>
        </>
      )}

      <CreateTagModal
        opened={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => loadTags(true, { silent: true })}
        existingTags={tags}
      />

      <EditTagModal
        opened={!!editingTag}
        onClose={() => setEditingTag(null)}
        onSuccess={() => loadTags(true, { silent: true })}
        tag={editingTag}
        existingTags={tags}
      />
    </Box>
  );
}
