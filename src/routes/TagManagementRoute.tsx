import { useEffect, useState } from 'react';
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

export default function TagManagementRoute() {
  const navigate = useNavigate();
  const { tags, getTags } = useBibleStore((state) => ({
    tags: state.tags,
    getTags: state.getTags,
  }));
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);

  useEffect(() => {
    loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTags = async (forceRefresh = false) => {
    setLoading(true);
    try {
      await getTags(forceRefresh);
    } catch (error) {
      console.error('Error loading tags:', error);
      showNotification({
        title: 'Error',
        message: 'Failed to load tags',
        color: 'red',
      });
    }
    setLoading(false);
  };

  const handleDeleteTag = async (tagId: string, tagName: string) => {
    if (
      window.confirm(
        `Are you sure you want to delete "${tagName}"? This action cannot be undone.`
      )
    ) {
      try {
        await deleteTagApi(tagId);
        showNotification({
          title: 'Success',
          message: 'Tag deleted successfully',
          color: 'green',
        });
        await loadTags(true); // Force refresh
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

  const filteredTags = tags.filter((tag) =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader size="lg" aria-label="Loading tags" />
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
          <Text color="dimmed" size="sm" mb="md">
            {filteredTags.length} {filteredTags.length === 1 ? 'tag' : 'tags'}
          </Text>
          <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
            <TagTree
              tags={filteredTags}
              onEdit={handleEditTag}
              onDelete={handleDeleteTag}
              onViewNotes={handleViewNotes}
            />
          </ScrollArea>
        </>
      )}

      <CreateTagModal
        opened={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => loadTags(true)}
        existingTags={tags}
      />

      <EditTagModal
        opened={!!editingTag}
        onClose={() => setEditingTag(null)}
        onSuccess={() => loadTags(true)}
        tag={editingTag}
        existingTags={tags}
      />
    </Box>
  );
}
