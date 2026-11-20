import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Center,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { getPublishedNotes } from '../api';
import type { Note } from '../types';
import NoteCard from '../components/NoteCard';
import { buildBiblePath } from '../utils/bibleUtils';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
import { captureHandledError } from '../utils/errorReporter';

const SEARCH_DEBOUNCE_MS = 400;

/**
 * `/explore` — the published directory. Anonymous visitors
 * see the same feed (published notes are public); `?q`
 * searches text + linked passages server-side.
 */
export default function ExploreRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setShowNotes = useBibleStore(
    (state) => state.setShowNotes
  );
  const ownUserId = useAuthStore((state) => state.user?.id);

  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const activeQueryRef = useRef('');
  // Monotonic request token — only the latest issued query
  // may write state. A slower earlier request (search while
  // a load-more is in flight, or vice versa) resolving last
  // would otherwise overwrite the newer feed.
  const requestSeqRef = useRef(0);

  const load = useCallback(
    async (q: string, pageNum: number, append: boolean) => {
      const seq = ++requestSeqRef.current;
      setLoading(true);
      try {
        const result = await getPublishedNotes({
          q: q || undefined,
          page: pageNum,
        });
        // A newer query was issued while this one was in
        // flight — its response wins; drop this one whole
        // (appending stale rows would corrupt the list).
        if (seq !== requestSeqRef.current) return;
        setNotes((current) =>
          append ? [...current, ...result.results] : result.results
        );
        setHasMore(result.next !== null);
        setPage(pageNum);
        setError(false);
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        captureHandledError(err, 'Published feed', { q });
        setError(true);
      } finally {
        if (seq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void load('', 1, false);
  }, [load]);

  // Debounced directory search — q forces the published
  // scope server-side, so searching never widens the feed.
  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      activeQueryRef.current = value.trim();
      void load(activeQueryRef.current, 1, false);
    }, SEARCH_DEBOUNCE_MS);
  };

  useEffect(
    () => () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      // Invalidate any in-flight load so a late response
      // can't write state after unmount.
      requestSeqRef.current += 1;
    },
    []
  );

  const handleViewInBible = (
    book: string,
    chapter: number,
    verse: number
  ) => {
    void navigate(buildBiblePath(book, chapter, [verse]));
    setShowNotes(false);
  };

  return (
    <ScrollArea style={{ height: '100%' }} type="auto">
      <Box p="md" maw={800} mx="auto">
        <Stack spacing="md">
          <Text fw={500} size="lg">
            {t('explore.title')}
          </Text>
          <TextInput
            icon={<IconSearch size={16} />}
            placeholder={t('explore.searchPlaceholder')}
            value={query}
            onChange={(e) =>
              handleQueryChange(e.currentTarget.value)
            }
            aria-label={t('explore.searchPlaceholder')}
          />
          {error && (
            <Text color="red" size="sm">
              {t('explore.loadFailed')}
            </Text>
          )}
          {!error && !loading && notes.length === 0 && (
            <Text size="sm" color="dimmed">
              {query
                ? t('explore.noResults')
                : t('explore.emptyFeed')}
            </Text>
          )}
          {notes.map((note) => (
            <Box key={note.id}>
              {note.author &&
                note.is_owner !== true &&
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
          {loading && (
            <Center>
              <Loader aria-label={t('notes.loadingNotes')} />
            </Center>
          )}
          {hasMore && !loading && (
            <Button
              variant="subtle"
              onClick={() =>
                void load(activeQueryRef.current, page + 1, true)
              }
            >
              {t('explore.loadMore')}
            </Button>
          )}
        </Stack>
      </Box>
    </ScrollArea>
  );
}
