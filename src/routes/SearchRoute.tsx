import {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Accordion,
  ActionIcon,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconPlayerPlay,
  IconSearch,
} from '@tabler/icons-react';
import { useBibleStore } from '../store';
import {
  searchBibleGrouped,
  SearchVerse,
  SearchVerseGroup,
} from '../api';
import {
  type PlaylistItem,
} from '../types';
import {
  BOOK_CODE_TO_NAME,
  buildBiblePath,
} from '../utils/bibleUtils';
import { resolveTextFileset } from '../utils/filesetGroups';

const VERSE_PREVIEW_LIMIT = 3;

function toPlaylistItem(
  v: SearchVerse,
  i: number,
  total: number,
): PlaylistItem {
  const bookName = BOOK_CODE_TO_NAME[v.book_id] ?? v.book_id;
  return {
    itemId: `search-${v.book_id}-${v.chapter}-${v.verse_start}`,
    bookId: v.book_id,
    chapter: v.chapter,
    startVerse: v.verse_start,
    endVerse: v.verse_start,
    label:
      `Result ${i + 1}/${total} \u2013 ${bookName} ` +
      `${v.chapter}:${v.verse_start}`,
  };
}

export default function SearchRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const q = searchParams.get('q') ?? '';

  const [inputValue, setInputValue] = useState(q);
  const [groups, setGroups] = useState<SearchVerseGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [expandedBooks, setExpandedBooks] =
    useState<Set<string>>(new Set());
  const [playlistItems, setPlaylistItems] =
    useState<PlaylistItem[] | null>(null);

  const activeTextFilesetId = useBibleStore(
    (s) => s.activeTextFilesetId,
  );
  const activeBookId = useBibleStore((s) => s.activeBookId);
  const translations = useBibleStore((s) => s.translations);
  const setAudioPlaylistItems = useBibleStore(
    (s) => s.setAudioPlaylistItems,
  );
  const setAudioPlaylistStartIndex = useBibleStore(
    (s) => s.setAudioPlaylistStartIndex,
  );

  useEffect(() => {
    return () => {
      setAudioPlaylistItems(null);
    };
  }, [setAudioPlaylistItems]);

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim();
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (trimmed) {
          next.set('q', trimmed);
        } else {
          next.delete('q');
        }
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }, [inputValue, setSearchParams]);

  useEffect(() => {
    // The stored id may be a grouped product id (`{abbr}:text:n`)
    // — resolve to the concrete fileset for the active book's
    // testament before sending it as `fileset_id`.
    const filesetId = resolveTextFileset(
      activeTextFilesetId,
      activeBookId,
      translations,
    );
    if (!q.trim() || !filesetId) {
      setGroups([]);
      setTotal(0);
      setTruncated(false);
      setError(null);
      setSearched(false);
      // A cleared query aborts the in-flight search (swallowed
      // above) — reset loading or the spinner never clears.
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    searchBibleGrouped(q, filesetId, controller.signal)
      .then((res) => {
        setGroups(res.groups);
        setTotal(res.meta.total);
        setTruncated(res.meta.truncated);
        setSearched(true);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setGroups([]);
        setTotal(0);
        setTruncated(false);
        setError(err.message);
        setLoading(false);
      });
    return () => controller.abort();
  }, [q, activeTextFilesetId, activeBookId, translations]);

  const verses = useMemo(
    () => groups.flatMap((g) => g.verses),
    [groups],
  );

  useEffect(() => {
    setOpenGroups(groups.map((g) => g.book_id));
    setExpandedBooks(new Set());
  }, [groups]);

  useEffect(() => {
    if (verses.length === 0) {
      setAudioPlaylistItems(null);
      setPlaylistItems(null);
      return;
    }
    const items = verses.map((v, i) =>
      toPlaylistItem(v, i, verses.length),
    );
    setAudioPlaylistItems(items);
    setPlaylistItems(items);
  }, [verses, setAudioPlaylistItems]);

  const handlePlayVerse = useCallback(
    (v: SearchVerse) => {
      if (!playlistItems) return;
      const clickedIdx = verses.findIndex(
        (x) =>
          x.book_id === v.book_id &&
          x.chapter === v.chapter &&
          x.verse_start === v.verse_start,
      );
      const startIdx = Math.max(0, clickedIdx);
      setAudioPlaylistStartIndex(startIdx);
    },
    [playlistItems, verses, setAudioPlaylistStartIndex],
  );

  const handleVerseClick = (v: SearchVerse) => {
    navigate(
      buildBiblePath(v.book_id, v.chapter, [v.verse_start]),
    );
  };

  return (
    <Box p="md" maw={800} mx="auto">
      <Title order={2} mb="md">
        Search Bible
      </Title>
      <Box
        mb="md"
        component="form"
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <Group noWrap>
          <TextInput
            icon={<IconSearch size={16} />}
            placeholder="Search for words or phrases..."
            value={inputValue}
            onChange={(e) => setInputValue(e.currentTarget.value)}
            size="md"
            aria-label="search-input"
            sx={{ flex: 1 }}
          />
          <Button type="submit" size="md" aria-label="search-button">
            Search
          </Button>
        </Group>
      </Box>

      {loading && (
        <Center mt="xl">
          <Loader aria-label="loading" />
        </Center>
      )}

      {!loading && error && (
        <Text color="red" mt="md">
          {error}
        </Text>
      )}

      {!loading && searched && groups.length === 0 && !error && (
        <Text color="dimmed" mt="md">
          No results found for &ldquo;{q}&rdquo;.
        </Text>
      )}

      {!loading && groups.length > 0 && (
        <>
          <Text size="sm" color="dimmed" mb="sm">
            {verses.length} result{verses.length !== 1 ? 's' : ''}
          </Text>

          {truncated && (
            <Text size="sm" color="dimmed" mb="sm">
              Showing first {verses.length} of {total} results
            </Text>
          )}

          <Accordion
            variant="separated"
            chevronPosition="right"
            multiple
            value={openGroups}
            onChange={setOpenGroups}
          >
            {groups.map((group) => {
              const displayName =
                BOOK_CODE_TO_NAME[group.book_id] ?? group.book_id;
              const isExpanded = expandedBooks.has(group.book_id);
              const visible = isExpanded
                ? group.verses
                : group.verses.slice(0, VERSE_PREVIEW_LIMIT);
              const hiddenCount =
                group.verses.length - visible.length;
              return (
                <Accordion.Item
                  key={group.book_id}
                  value={group.book_id}
                >
                  <Accordion.Control>
                    <Text weight={600}>
                      {displayName}
                      <Text
                        component="span"
                        size="sm"
                        color="dimmed"
                        ml="xs"
                      >
                        ({group.count})
                      </Text>
                    </Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack spacing="xs">
                      {visible.map((v) => (
                        <Group
                          key={`${v.chapter}-${v.verse_start}`}
                          noWrap
                          position="apart"
                          sx={{ alignItems: 'flex-start' }}
                        >
                          <Box
                            sx={{ cursor: 'pointer', flex: 1 }}
                            onClick={() => handleVerseClick(v)}
                          >
                            <Text
                              size="xs"
                              color="dimmed"
                              mb={2}
                            >
                              {displayName} {v.chapter}:
                              {v.verse_start}
                            </Text>
                            <Text size="sm">
                              {v.verse_text}
                            </Text>
                          </Box>
                          <ActionIcon
                            size="sm"
                            variant="light"
                            color="blue"
                            onClick={() => handlePlayVerse(v)}
                            aria-label={
                              `play-${v.book_id}-` +
                              `${v.chapter}-${v.verse_start}`
                            }
                          >
                            <IconPlayerPlay size={12} />
                          </ActionIcon>
                        </Group>
                      ))}
                      {hiddenCount > 0 && (
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={() =>
                            setExpandedBooks(
                              (prev) =>
                                new Set([...prev, group.book_id]),
                            )
                          }
                        >
                          Show {hiddenCount} more verse
                          {hiddenCount !== 1 ? 's' : ''}
                        </Button>
                      )}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>
        </>
      )}
    </Box>
  );
}
