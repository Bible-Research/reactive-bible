import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Collapse,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { Tag } from '../types';
import { setTagPublic, updateTag } from '../api';
import {
  isTagDescendant,
  validateTagName,
} from '../utils/tagTree';
import { useTranslation } from 'react-i18next';
import { textOrKey } from '../i18n/errorText';

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
  const { t } = useTranslation();
  // Full-screen at `sm` and narrower (768px is Mantine's
  // `sm` — the query includes it), where the
  // Created/Updated dates also collapse behind a "Details"
  // toggle to keep the form above the fold. `undefined`
  // initialValue lets matchMedia resolve during the first
  // render — a boolean would flash the windowed layout for
  // one frame.
  const compact = useMediaQuery('(max-width: 768px)', undefined, {
    getInitialValueInEffect: false,
  });
  const [tagName, setTagName] = useState('');
  const [parentTagId, setParentTagId] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (tag && opened) {
      setTagName(tag.name);
      setParentTagId(tag.parent_tag);
      // Pre-upgrade persisted payloads can hydrate a Tag
      // without `public` — `undefined` would make the Switch
      // uncontrolled until the first click.
      setIsPublic(tag.public ?? false);
      setNameError(null);
      setDetailsOpen(false);
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
        title: t('tags.invalidParent'),
        message: t('tags.circularParent'),
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
        title: t('common.success'),
        message: t('tags.updated'),
        color: 'green',
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating tag:', error);
      // apiClient throws catalog keys — textOrKey translates
      // those and passes raw server text through.
      showNotification({
        title: t('common.error'),
        message:
          error instanceof Error
            ? textOrKey(error.message)
            : t('tags.updateFailed'),
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

  const datesBlock = tag && (
    <Stack spacing={4}>
      <Text size="xs" color="dimmed">
        {t('tags.createdAt', {
          date: new Date(tag.created_at).toLocaleDateString(),
        })}
      </Text>
      <Text size="xs" color="dimmed">
        {t('tags.updatedAt', {
          date: new Date(tag.updated_at).toLocaleDateString(),
        })}
      </Text>
    </Stack>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('tags.edit')}
      size="md"
      fullScreen={compact}
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
            description={t('tags.rootHintEdit')}
          />

          {hasChildren && (
            <Text size="xs" color="orange">
              {t('tags.hasChildrenWarning')}
            </Text>
          )}

          <Switch
            label={t('tags.publicTag')}
            checked={isPublic}
            onChange={(e) =>
              setIsPublic(e.currentTarget.checked)
            }
            description={
              isPublic
                ? t('tags.publicityPublicLong')
                : t('tags.publicityPrivateLong')
            }
          />

          {tag &&
            (compact ? (
              <Box>
                <UnstyledButton
                  onClick={() =>
                    setDetailsOpen((open) => !open)
                  }
                >
                  <Text size="xs" color="dimmed" underline>
                    {detailsOpen
                      ? t('tags.hideDetails')
                      : t('tags.showDetails')}
                  </Text>
                </UnstyledButton>
                <Collapse in={detailsOpen}>
                  <Box mt={4}>{datesBlock}</Box>
                </Collapse>
              </Box>
            ) : (
              datesBlock
            ))}

          <Group position="right" mt="md">
            <Button variant="subtle" onClick={onClose} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={loading}>
              {t('tags.saveChanges')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
