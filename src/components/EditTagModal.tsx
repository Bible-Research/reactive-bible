import { useState, useEffect } from 'react';
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { Tag } from '../types';
import { updateTag } from '../api';

interface EditTagModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tag: Tag | null;
  existingTags: Tag[];
}

export function EditTagModal({
  opened,
  onClose,
  onSuccess,
  tag,
  existingTags,
}: EditTagModalProps) {
  const [tagName, setTagName] = useState('');
  const [parentTagId, setParentTagId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (tag && opened) {
      setTagName(tag.name);
      setParentTagId(tag.parent_tag);
      setNameError(null);
    }
  }, [tag, opened]);

  const canSetParent = (newParentId: string | null): boolean => {
    if (!tag || !newParentId) return true;
    if (tag.id === newParentId) return false;

    const isDescendant = (ancestorId: string, descendantId: string): boolean => {
      const descendant = existingTags.find((t) => t.id === descendantId);
      if (!descendant || !descendant.parent_tag) return false;
      if (descendant.parent_tag === ancestorId) return true;
      return isDescendant(ancestorId, descendant.parent_tag);
    };

    return !isDescendant(tag.id, newParentId);
  };

  const validateTagName = (name: string): boolean => {
    if (!name.trim()) {
      setNameError('Tag name is required');
      return false;
    }

    if (name.length > 100) {
      setNameError('Tag name must be 100 characters or less');
      return false;
    }

    const isDuplicate = existingTags.some(
      (t) =>
        t.id !== tag?.id &&
        t.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (isDuplicate) {
      setNameError('A tag with this name already exists');
      return false;
    }

    setNameError(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!tag) return;

    if (!validateTagName(tagName)) {
      return;
    }

    if (parentTagId && !canSetParent(parentTagId)) {
      showNotification({
        title: 'Invalid Parent',
        message: 'Cannot create circular parent relationship',
        color: 'red',
      });
      return;
    }

    setLoading(true);
    try {
      await updateTag(tag.id, tagName.trim(), parentTagId);
      showNotification({
        title: 'Success',
        message: 'Tag updated successfully',
        color: 'green',
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating tag:', error);
      showNotification({
        title: 'Error',
        message: 'Failed to update tag. Please try again.',
        color: 'red',
      });
    }
    setLoading(false);
  };

  const sortedTags = [...existingTags]
    .filter((t) => t.id !== tag?.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  const parentTagOptions = sortedTags.map((t) => ({
    value: t.id,
    label: t.name,
  }));

  const hasChildren = existingTags.some((t) => t.parent_tag === tag?.id);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSubmit();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Edit Tag" size="md">
      <form onSubmit={handleFormSubmit}>
        <Stack spacing="md">
          <TextInput
            label="Tag Name"
            placeholder="Enter tag name"
            value={tagName}
            onChange={(e) => {
              setTagName(e.currentTarget.value);
              if (nameError) {
                validateTagName(e.currentTarget.value);
              }
            }}
            onBlur={() => validateTagName(tagName)}
            error={nameError}
            required
            maxLength={100}
            data-autofocus
          />

          <Select
            label="Parent Tag (Optional)"
            placeholder="Select a parent tag"
            value={parentTagId}
            onChange={setParentTagId}
            data={parentTagOptions}
            searchable
            clearable
            description="Leave empty to make this a root-level tag"
          />

          {hasChildren && (
            <Text size="xs" color="orange">
              ⚠️ This tag has child tags. Changing its parent will affect the
              hierarchy.
            </Text>
          )}

          {tag && (
            <Stack spacing={4}>
              <Text size="xs" color="dimmed">
                Created: {new Date(tag.created_at).toLocaleDateString()}
              </Text>
              <Text size="xs" color="dimmed">
                Updated: {new Date(tag.updated_at).toLocaleDateString()}
              </Text>
            </Stack>
          )}

          <Group position="right" mt="md">
            <Button variant="subtle" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Save Changes
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
