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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  // Full-screen at `sm` and narrower (768px is Mantine's
  // `sm` — the query includes it) — the parent Select's
  // dropdown gets the whole viewport to work with on a
  // phone. `undefined` initialValue lets matchMedia resolve
  // during the first render — a boolean would flash the
  // windowed layout for one frame.
  const fullScreen = useMediaQuery('(max-width: 768px)', undefined, {
    getInitialValueInEffect: false,
  });
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
        title: t('common.success'),
        message: t('tags.created'),
        color: 'green',
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error creating tag:', error);
      showNotification({
        title: t('common.error'),
        message: t('tags.createFailed'),
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
      title={t('tags.createNew')}
      size="md"
      fullScreen={fullScreen}
    >
      <form onSubmit={handleFormSubmit}>
        <Stack spacing="md">
          <TextInput
            label={t('tags.name')}
            placeholder={t('tags.enterName')}
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
            label={t('tags.parentOptional')}
            placeholder={t('tags.selectParent')}
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
            description={t('tags.rootHintCreate')}
          />

          {parentTagId && (
            <Text size="xs" color="dimmed">
              {t('tags.nestedUnder', {
                name: existingTags.find(
                  (tag) => tag.id === parentTagId,
                )?.name,
              })}
            </Text>
          )}

          <Group position="right" mt="md">
            <Button variant="subtle" onClick={onClose} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={loading}>
              {t('tags.createTag')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
