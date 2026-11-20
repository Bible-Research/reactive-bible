import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Box,
  Center,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { getBookmarks, unbookmarkNote } from '../api';
import type { BookmarkEntry } from '../types';
import NoteCard from '../components/NoteCard';
import { buildBiblePath } from '../utils/bibleUtils';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
import { captureHandledError } from '../utils/errorReporter';
import { textOrKey } from '../i18n/errorText';

/**
 * `/bookmarks` — the caller's saved notes. Entries whose
 * source went private/deleted render as unavailable rows;
 * unbookmarking still works (the DELETE only needs the id),
 * which is how stale pointers get cleaned up.
 */
export default function BookmarksRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setShowNotes = useBibleStore(
    (state) => state.setShowNotes
  );
  const ownUserId = useAuthStore((state) => state.user?.id);

  const [entries, setEntries] = useState<BookmarkEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getBookmarks()
      .then(setEntries)
      .catch((err) => {
        captureHandledError(err, 'Bookmarks');
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleRemove = async (entry: BookmarkEntry) => {
    try {
      await unbookmarkNote(entry.note_id);
      setEntries((current) =>
        current.filter((e) => e.note_id !== entry.note_id)
      );
    } catch (err) {
      captureHandledError(err, 'Unbookmark', {
        noteId: entry.note_id,
      });
      showNotification({
        title: t('common.error'),
        message:
          err instanceof Error
            ? textOrKey(err.message)
            : t('bookmarks.removeFailed'),
        color: 'red',
      });
    }
  };

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
            {t('bookmarks.title')}
          </Text>
          {error && (
            <Text color="red" size="sm">
              {t('bookmarks.loadFailed')}
            </Text>
          )}
          {!error && entries.length === 0 && (
            <Text size="sm" color="dimmed">
              {t('bookmarks.empty')}
            </Text>
          )}
          {entries.map((entry) =>
            entry.available && entry.note ? (
              <Box key={entry.note_id}>
                {entry.note.author &&
                  entry.note.is_owner !== true &&
                  entry.note.author.id !== ownUserId && (
                    <Text size="xs" color="dimmed" mb={4}>
                      {t('explore.byAuthor', {
                        name: entry.note.author.username,
                      })}
                    </Text>
                  )}
                <NoteCard
                  note={entry.note}
                  onViewInBible={handleViewInBible}
                />
              </Box>
            ) : (
              <Group
                key={entry.note_id}
                position="apart"
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
                <Text size="sm" color="dimmed" fs="italic">
                  {t('bookmarks.unavailable')}
                </Text>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={t('bookmarks.remove')}
                  onClick={() => void handleRemove(entry)}
                >
                  <IconX size={16} />
                </ActionIcon>
              </Group>
            )
          )}
        </Stack>
      </Box>
    </ScrollArea>
  );
}
