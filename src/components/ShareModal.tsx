import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import {
  getNoteShares,
  getTagShares,
  shareNote,
  shareTag,
  unshareNote,
  unshareTag,
} from '../api';
import type { ShareGrant } from '../types';
import { captureHandledError } from '../utils/errorReporter';
import { textOrKey } from '../i18n/errorText';

interface ShareModalProps {
  opened: boolean;
  onClose: () => void;
  /** 'note' shares one note; 'tag' optionally covers its
   *  subtree — include_descendants upserts on re-share. */
  kind: 'note' | 'tag';
  resourceId: string;
  /** Display name of the shared tag (title context). */
  resourceName?: string;
}

/**
 * Targeted sharing dialog. Username resolution is silent
 * server-side — the same "saved" state shows whether the
 * name exists or not, so this UI never enumerates users.
 */
export function ShareModal({
  opened,
  onClose,
  kind,
  resourceId,
  resourceName,
}: ShareModalProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [includeDescendants, setIncludeDescendants] =
    useState(true);
  const [grants, setGrants] = useState<ShareGrant[]>([]);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    // Reopening for a different note/tag must not inherit the
    // previous draft — the username and descendants choice
    // are per-resource state.
    setUsername('');
    setIncludeDescendants(true);
    setGrants([]);
    setLoading(true);
    const list = kind === 'note'
      ? getNoteShares(resourceId)
      : getTagShares(resourceId);
    // A resource switch re-runs the effect while the previous
    // fetch is still in flight — `cancelled` keeps its stale
    // response from overwriting the new resource's grants.
    list
      .then((shareGrants) => {
        if (!cancelled) setGrants(shareGrants);
      })
      .catch((error) => {
        if (cancelled) return;
        captureHandledError(error, 'Shares fetch', {
          kind,
          resourceId,
        });
        setGrants([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [opened, kind, resourceId]);

  const handleShare = async () => {
    const name = username.trim();
    if (!name) return;
    setSharing(true);
    try {
      if (kind === 'note') {
        await shareNote(resourceId, name);
      } else {
        await shareTag(resourceId, name, includeDescendants);
      }
    } catch (error) {
      captureHandledError(error, 'Share', {
        kind,
        resourceId,
      });
      showNotification({
        title: t('common.error'),
        message:
          error instanceof Error
            ? textOrKey(error.message)
            : t('sharing.shareFailed'),
        color: 'red',
      });
      setSharing(false);
      return;
    }
    setSharing(false);
    setUsername('');
    // The endpoint is silent about username existence —
    // the honest copy describes the conditional grant.
    showNotification({
      title: t('common.success'),
      message: t('sharing.shareSaved'),
      color: 'green',
    });
    // The share persisted — a failed list refresh is a
    // display problem, not a share failure, so it reports
    // separately instead of toasting shareFailed.
    try {
      const list = kind === 'note'
        ? await getNoteShares(resourceId)
        : await getTagShares(resourceId);
      setGrants(list);
    } catch (error) {
      captureHandledError(error, 'Shares refresh', {
        kind,
        resourceId,
      });
    }
  };

  const handleRevoke = async (grant: ShareGrant) => {
    try {
      if (kind === 'note') {
        await unshareNote(resourceId, grant.shared_with);
      } else {
        await unshareTag(resourceId, grant.shared_with);
      }
      setGrants((current) =>
        current.filter((g) => g.shared_with !== grant.shared_with)
      );
    } catch (error) {
      captureHandledError(error, 'Unshare', {
        kind,
        resourceId,
      });
      showNotification({
        title: t('common.error'),
        message:
          error instanceof Error
            ? textOrKey(error.message)
            : t('sharing.revokeFailed'),
        color: 'red',
      });
    }
  };

  const title = kind === 'note'
    ? t('sharing.shareNote')
    : t('sharing.shareTag', {
        name: resourceName ?? '',
      });

  return (
    <Modal opened={opened} onClose={onClose} title={title}>
      <Stack spacing="md">
        <Text size="sm" color="dimmed">
          {t('sharing.silentHint')}
        </Text>
        <TextInput
          label={t('sharing.usernameLabel')}
          placeholder={t('sharing.usernamePlaceholder')}
          value={username}
          onChange={(e) => setUsername(e.currentTarget.value)}
        />
        {kind === 'tag' && (
          <Checkbox
            label={t('sharing.includeDescendants')}
            description={t('sharing.includeDescendantsHint')}
            checked={includeDescendants}
            onChange={(e) =>
              setIncludeDescendants(e.currentTarget.checked)
            }
          />
        )}
        <Button
          onClick={() => void handleShare()}
          loading={sharing}
          disabled={!username.trim()}
        >
          {t('sharing.shareAction')}
        </Button>

        <Divider />
        <Text weight={500} size="sm">
          {t('sharing.currentGrants')}
        </Text>
        {loading ? (
          <Text size="sm" color="dimmed">
            {t('notes.loadingNotes')}
          </Text>
        ) : grants.length === 0 ? (
          <Text size="sm" color="dimmed">
            {t('sharing.noGrants')}
          </Text>
        ) : (
          grants.map((grant) => (
            <Group key={grant.shared_with} position="apart">
              <Text size="sm">
                {grant.shared_with}
                {grant.include_descendants !== undefined && (
                  <Text span size="xs" color="dimmed">
                    {' — '}
                    {grant.include_descendants
                      ? t('sharing.withDescendants')
                      : t('sharing.tagOnly')}
                  </Text>
                )}
              </Text>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={t('sharing.revoke')}
                onClick={() => void handleRevoke(grant)}
              >
                <IconX size={16} />
              </ActionIcon>
            </Group>
          ))
        )}
      </Stack>
    </Modal>
  );
}

export default ShareModal;
