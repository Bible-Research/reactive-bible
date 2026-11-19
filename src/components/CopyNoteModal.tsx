import { useEffect, useState } from 'react';
import {
  Button,
  Modal,
  Stack,
  Text,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { copyNote } from '../api';
import type { Note, Tag } from '../types';
import { TagCombobox } from './TagCombobox';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
import { captureHandledError } from '../utils/errorReporter';
import { textOrKey } from '../i18n/errorText';

// The copy endpoint's "no tag" sentinel.
const UNTAGGED_COPY_TARGET = 'untagged';

interface CopyNoteModalProps {
  opened: boolean;
  onClose: () => void;
  /** The note being copied — must be readable by the caller
   *  (public link, published, shared, or their own). */
  note: Note | null;
}

/**
 * Copy-to-my-account dialog: picks one of the caller's own
 * tags (or Untagged) and POSTs /notes/<id>/copy/. The copy is
 * always private — visibility is never inherited.
 */
export function CopyNoteModal({
  opened,
  onClose,
  note,
}: CopyNoteModalProps) {
  const { t } = useTranslation();
  const [targetTagId, setTargetTagId] =
    useState<string>(UNTAGGED_COPY_TARGET);
  const [copying, setCopying] = useState(false);

  const tags = useBibleStore((state) => state.tags);
  const getTagsAction = useBibleStore(
    (state) => state.getTags
  );
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  // The picker needs the caller's own tag list — fetch once
  // when the dialog opens without a cached list.
  useEffect(() => {
    if (opened && isAuthenticated && tags.length === 0) {
      void getTagsAction().catch(() => {
        /* getTags already notified */
      });
    }
    if (opened) setTargetTagId(UNTAGGED_COPY_TARGET);
  }, [opened, isAuthenticated, tags.length, getTagsAction]);

  const handleCopy = async () => {
    if (!note) return;
    setCopying(true);
    try {
      await copyNote(
        note.id,
        targetTagId === UNTAGGED_COPY_TARGET
          ? undefined
          : targetTagId
      );
      showNotification({
        title: t('common.success'),
        message: t('copyNote.copied'),
        color: 'green',
      });
      onClose();
    } catch (error) {
      captureHandledError(error, 'Note copy', {
        noteId: note.id,
      });
      showNotification({
        title: t('common.error'),
        message:
          error instanceof Error
            ? textOrKey(error.message)
            : t('copyNote.failed'),
        color: 'red',
      });
    } finally {
      setCopying(false);
    }
  };

  // Untagged is a virtual entry — TagCombobox only lists
  // real tags, so it is offered as a separate option.
  const tagOptions: Tag[] = tags;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('copyNote.title')}
    >
      <Stack spacing="md">
        <Text size="sm" color="dimmed">
          {t('copyNote.hint')}
        </Text>
        <TagCombobox
          label={t('copyNote.targetTag')}
          value={
            targetTagId === UNTAGGED_COPY_TARGET
              ? ''
              : targetTagId
          }
          onChange={setTargetTagId}
          tags={tagOptions}
        />
        <Button
          onClick={() => void handleCopy()}
          loading={copying}
        >
          {t('copyNote.copyAction')}
        </Button>
      </Stack>
    </Modal>
  );
}

export default CopyNoteModal;
