import { useState, useEffect } from 'react';
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { Tag } from '../types';
import { setTagPublic, updateTag } from '../api';
import {
  isTagDescendant,
  validateTagName,
} from '../utils/tagTree';

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
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (tag && opened) {
      setTagName(tag.name);
      setParentTagId(tag.parent_tag);
      // Pre-upgrade persisted payloads can hydrate a Tag
      // without `public` — `undefined` would make the Switch
      // uncontrolled until the first click.
      setIsPublic(tag.public ?? false);
      setNameError(null);
    }
  }, [tag, opened]);

  const canSetParent = (newParentId: string | null): boolean => {
    if (!tag || !newParentId) return true;
    if (tag.id === newParentId) return false;

    return !isTagDescendant(existingTags, tag.id, newParentId);
  };

  const checkTagName = (name: string): boolean => {
    const error = validateTagName(name, existingTags, tag?.id);
    setNameError(error);
    return error === null;
  };

  const handleSubmit = async () => {
    if (!tag) return;

    if (!checkTagName(tagName)) {
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
    // Set when the rename/reparent PATCH has already landed —
    // if the publicity cascade then fails, the applied half
    // still needs a list refresh.
    let updateApplied = false;
    try {
      // A publicity-only edit skips the PATCH entirely —
      // sending an unchanged name/parent is a no-op write.
      const detailsChanged =
        tagName.trim() !== tag.name ||
        parentTagId !== tag.parent_tag;
      if (detailsChanged) {
        await updateTag(tag.id, tagName.trim(), parentTagId);
        updateApplied = true;
      }
      // Publicity goes through the set-public cascade — never a
      // raw PATCH flag — so the tag's notes flip atomically
      // with it and the UI can't produce a "flag set, notes
      // stale" state.
      if (isPublic !== (tag.public ?? false)) {
        await setTagPublic(tag.id, isPublic);
      }
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
        message:
          error instanceof Error
            ? error.message
            : 'Failed to update tag. Please try again.',
        color: 'red',
      });
      // Partial success: the PATCH landed but the cascade
      // failed — refresh so the list shows what the server
      // actually stored.
      if (updateApplied) {
        onSuccess();
      }
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
                checkTagName(e.currentTarget.value);
              }
            }}
            onBlur={() => checkTagName(tagName)}
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
              ⚠️ This tag has child tags. Changing its parent
              will affect the hierarchy.
            </Text>
          )}

          <Switch
            label="Public tag"
            checked={isPublic}
            onChange={(e) =>
              setIsPublic(e.currentTarget.checked)
            }
            description={
              isPublic
                ? 'Existing notes under this tag become ' +
                  'public — anyone with the link can view ' +
                  'them.'
                : 'Existing notes under this tag become ' +
                  'private — anyone following a shared link ' +
                  'loses access.'
            }
          />

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
