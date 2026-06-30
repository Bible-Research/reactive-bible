import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
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
  Pagination,
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
import { searchBible, SearchVerse } from '../api';
import { useAudioPlaylist } from '../hooks/useAudioPlaylist';
import {
  type PlaylistItem,
} from '../types';
import {
  BOOK_CODE_TO_NAME,
  BOOK_CODE_TO_ORDER,
} from '../utils/bibleUtils';

const VERSE_PREVIEW_LIMIT = 5;

function toPlaylistItem(
  v: SearchVerse,
  i: number,
  total: number,
): PlaylistItem {
  const bookName = BOOK_CODE_TO_NAME[v.book_id] ?? v.book_id;
  return {
    itemId: `search-${v.book_id}-${v.chapter}-${v.verse_start}`,
    book: bookName,
    chapter: v.chapter,
    startVerse: v.verse_start,
    endVerse: v.verse_start,
    label:
      `Result ${i + 1}/${total} \u2013 ${bookName} ` +
      `${v.chapter}:${v.verse_start}`,
  };
}

interface BookGroup {
  code: string;
  displayName: string;
  order: number;
  verses: SearchVerse[];
}

function groupByBook(verses: SearchVerse[]): BookGroup[] {
  const map = new Map<string, SearchVerse[]>();
  for (const v of verses) {
    const arr = map.get(v.book_id) ?? [];
    arr.push(v);
    map.set(v.book_id, arr);
  }
  const groups: BookGroup[] = [];
  for (const [code, vs] of map.entries()) {
    const sorted = [...vs].sort(
      (a, b) =>
        a.chapter - b.chapter || a.verse_start - b.verse_start,
    );
    groups.push({
      code,
      displayName: BOOK_CODE_TO_NAME[code] ?? code,
      order: BOOK_CODE_TO_ORDER[code] ?? 999,
      verses: sorted,
    });
  }
  groups.sort((a, b) => a.order - b.order);
  return groups;
}

export default function SearchRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const q = searchParams.get('q') ?? '';
  const page = parseInt(searchParams.get('page') ?? '1', 10);

  const [inputValue, setInputValue] = useState(q);
  const [verses, setVerses] = useState<SearchVerse[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [expandedBooks, setExpandedBooks] =
    useState<Set<string>>(new Set());
  const [playlistItems, setPlaylistItems] =
    useState<PlaylistItem[] | null>(null);

  const verseRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const playlist = useAudioPlaylist();

  const activeTextFilesetId = useBibleStore(
    (s) => s.activeTextFilesetId,
  );
  const setAudioPlaylistItems = useBibleStore(
    (s) => s.setAudioPlaylistItems,
  );
  const setAudioPlaylistStartIndex = useBibleStore(
    (s) => s.setAudioPlaylistStartIndex,
  );
  const audioPlaylistEnded = useBibleStore(
    (s) => s.audioPlaylistEnded,
  );
  const setAudioPlaylistEnded = useBibleStore(
    (s) => s.setAudioPlaylistEnded,
  );

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
    if (!q.trim() || !activeTextFilesetId) {
      setVerses([]);
      setSearched(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    searchBible(q, activeTextFilesetId, page, 50, controller.signal)
      .then((res) => {
        setVerses(res.verses);
        setTotalPages(res.meta.pagination?.total_pages ?? 1);
        setSearched(true);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
        setLoading(false);
      });
    return () => controller.abort();
  }, [q, activeTextFilesetId, page]);

  const groups = useMemo(() => groupByBook(verses), [verses]);

  useEffect(() => {
    setOpenGroups(groups.map((g) => g.code));
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

  useEffect(() => {
    if (!audioPlaylistEnded) return;
    setAudioPlaylistEnded(false);
    if (page < totalPages) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('page', String(page + 1));
          return next;
        },
        { replace: true },
      );
      setAudioPlaylistStartIndex(0);
    }
  }, [
    audioPlaylistEnded,
    page,
    totalPages,
    setAudioPlaylistEnded,
    setSearchParams,
    setAudioPlaylistStartIndex,
  ]);

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

  useEffect(() => {
    if (!playlist.currentItem || !playlist.isActive) return;
    const itemId = playlist.currentItem.itemId;
    const verseEl = verseRefs.current.get(itemId);
    if (verseEl) {
      verseEl.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [playlist.currentItem, playlist.isActive]);

  const handleVerseClick = (v: SearchVerse) => {
    const bookName = BOOK_CODE_TO_NAME[v.book_id] ?? v.book_id;
    navigate(
      `/bible/${bookName}/${v.chapter}.${v.verse_start}`,
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

      {!loading && searched && verses.length === 0 && !error && (
        <Text color="dimmed" mt="md">
          No results found for &ldquo;{q}&rdquo;.
        </Text>
      )}

      {!loading && verses.length > 0 && (
        <>
          <Text size="sm" color="dimmed" mb="sm">
            {verses.length} result{verses.length !== 1 ? 's' : ''}
          </Text>

          <Accordion
            variant="separated"
            chevronPosition="right"
            multiple
            value={openGroups}
            onChange={setOpenGroups}
          >
            {groups.map((group) => {
              const isExpanded = expandedBooks.has(group.code);
              const visible = isExpanded
                ? group.verses
                : group.verses.slice(0, VERSE_PREVIEW_LIMIT);
              const hiddenCount =
                group.verses.length - visible.length;
              return (
                <Accordion.Item
                  key={group.code}
                  value={group.code}
                >
                  <Accordion.Control>
                    <Text weight={600}>
                      {group.displayName}
                      <Text
                        component="span"
                        size="sm"
                        color="dimmed"
                        ml="xs"
                      >
                        ({group.verses.length})
                      </Text>
                    </Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack spacing="xs">
                      {visible.map((v) => {
                        const itemId =
                          `search-${v.book_id}-` +
                          `${v.chapter}-${v.verse_start}`;
                        const isCurrentlyPlaying =
                          playlist.isActive &&
                          playlist.currentItem?.itemId === itemId;
                        return (
                          <Group
                            key={`${v.chapter}-${v.verse_start}`}
                            noWrap
                            position="apart"
                            ref={(el) => {
                              if (el) {
                                verseRefs.current.set(itemId, el);
                              } else {
                                verseRefs.current.delete(itemId);
                              }
                            }}
                            sx={{
                              alignItems: 'flex-start',
                              backgroundColor: isCurrentlyPlaying
                                ? 'rgba(0, 123, 255, 0.1)'
                                : undefined,
                              borderRadius: isCurrentlyPlaying
                                ? '4px'
                                : undefined,
                              padding: isCurrentlyPlaying
                                ? '8px'
                                : undefined,
                              transition:
                                'background-color 0.2s ease',
                            }}
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
                              {group.displayName} {v.chapter}:
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
                        );
                      })}
                      {hiddenCount > 0 && (
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={() =>
                            setExpandedBooks(
                              (prev) =>
                                new Set([...prev, group.code]),
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

          {totalPages > 1 && (
            <Center mt="lg">
              <Pagination
                total={totalPages}
                value={page}
                onChange={(p) =>
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set('page', String(p));
                    return next;
                  })
                }
              />
            </Center>
          )}
        </>
      )}
    </Box>
  );
}
