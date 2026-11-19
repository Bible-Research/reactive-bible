import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Center,
  Loader,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { getSharedWithMe } from '../api';
import type { SharedWithMeResponse } from '../types';
import NoteCard from '../components/NoteCard';
import { buildBiblePath } from '../utils/bibleUtils';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
import { captureHandledError } from '../utils/errorReporter';

/**
 * `/shared` — everything other users granted the caller:
 * individual note grants (rendered read-only — no edit /
 * delete affordances) plus tag grants linking into the
 * shared tag's note page.
 */
export default function SharedWithMeRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setShowNotes = useBibleStore(
    (state) => state.setShowNotes
  );
  const ownUserId = useAuthStore((state) => state.user?.id);

  const [data, setData] = useState<SharedWithMeResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getSharedWithMe()
      .then(setData)
      .catch((err) => {
        captureHandledError(err, 'Shared with me');
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleViewInBible = (
    book: string,
    chapter: number,
    verse: number
  ) => {
    void navigate(buildBiblePath(book, chapter, [verse]));
    setShowNotes(false);
  };

  if (loading) {
    return (
      <Center style={{ height: '100%' }}>
        <Loader aria-label={t('notes.loadingNotes')} />
      </Center>
    );
  }

  return (
    <ScrollArea style={{ height: '100%' }} type="auto">
      <Box p="md" maw={800} mx="auto">
        <Stack spacing="md">
          <Text fw={500} size="lg">
            {t('sharedWithMe.title')}
          </Text>
          {error && (
            <Text color="red" size="sm">
              {t('sharedWithMe.loadFailed')}
            </Text>
          )}
          {data && data.tag_shares.length > 0 && (
            <>
              <Text size="sm" weight={500}>
                {t('sharedWithMe.tagShares')}
              </Text>
              {data.tag_shares.map((grant) => (
                <UnstyledButton
                  key={grant.id}
                  onClick={() => {
                    void navigate(`/notes/tag/${grant.id}`);
                  }}
                >
                  <Box
                    p="sm"
                    sx={(theme) => ({
                      borderRadius: theme.radius.sm,
                      border: `1px solid ${
                        theme.colorScheme === 'dark'
                          ? theme.colors.dark[4]
                          : theme.colors.gray[3]
                      }`,
                    })}
                  >
                    <Text size="sm">
                      <IconFolder
                        size={14}
                        style={{ verticalAlign: '-2px' }}
                      />{' '}
                      {grant.name}
                      {' — '}
                      {grant.include_descendants
                        ? t('sharedWithMe.withDescendants')
                        : t('sharedWithMe.tagOnly')}
                    </Text>
                  </Box>
                </UnstyledButton>
              ))}
            </>
          )}
          {data && data.notes.length > 0 && (
            <Text size="sm" weight={500}>
              {t('sharedWithMe.noteShares')}
            </Text>
          )}
          {data?.notes.map((note) => (
            <Box key={note.id}>
              {note.author &&
                note.author.id !== ownUserId && (
                  <Text size="xs" color="dimmed" mb={4}>
                    {t('explore.byAuthor', {
                      name: note.author.username,
                    })}
                  </Text>
                )}
              <NoteCard
                note={note}
                onViewInBible={handleViewInBible}
              />
            </Box>
          ))}
          {!error &&
            data &&
            data.notes.length === 0 &&
            data.tag_shares.length === 0 && (
              <Text size="sm" color="dimmed">
                {t('sharedWithMe.empty')}
              </Text>
            )}
        </Stack>
      </Box>
    </ScrollArea>
  );
}
