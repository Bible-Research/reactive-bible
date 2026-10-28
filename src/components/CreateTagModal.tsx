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
import { useMediaQuery } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { Tag } from '../types';
import { createTag } from '../api';
import { validateTagName } from '../utils/tagTree';

interface CreateTagModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingTags: Tag[];
}

export function CreateTagModal({
  opened,
  onClose,
  onSuccess,
  existingTags,
}: CreateTagModalProps) {
  // Full-screen below `sm` — the parent Select's dropdown
  // gets the whole viewport to work with on a phone.
  const fullScreen = useMediaQuery('(max-width: 768px)');
  const [tagName, setTagName] = useState('');
  const [parentTagId, setParentTagId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      setTagName('');
      setParentTagId(null);
      setNameError(null);
    }
  }, [opened]);

  const checkTagName = (name: string): boolean => {
    const error = validateTagName(name, existingTags);
    setNameError(error);
    return error === null;
  };

  const handleSubmit = async () => {
    if (!checkTagName(tagName)) {
      return;
    }

    setLoading(true);
    try {
      await createTag(tagName.trim(), parentTagId);
      showNotification({
        title: 'Success',
        message: 'Tag created successfully',
        color: 'green',
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error creating tag:', error);
      showNotification({
        title: 'Error',
        message: 'Failed to create tag. Please try again.',
        color: 'red',
      });
    }
    setLoading(false);
  };

  const sortedTags = [...existingTags].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const parentTagOptions = sortedTags.map((tag) => ({
    value: tag.id,
    label: tag.name,
  }));

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSubmit();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create New Tag"
      size="md"
      fullScreen={fullScreen}
    >
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
            // Bottom-anchored so the list can never flip up
            // over the Tag Name field on short viewports;
            // portal keeps it clear of the ScrollArea.
            withinPortal
            dropdownPosition="bottom"
            maxDropdownHeight={280}
            description="Leave empty to create a root-level tag"
          />

          {parentTagId && (
            <Text size="xs" color="dimmed">
              This tag will be nested under "
              {existingTags.find((t) => t.id === parentTagId)?.name}"
            </Text>
          )}

          <Group position="right" mt="md">
            <Button variant="subtle" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Create Tag
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
