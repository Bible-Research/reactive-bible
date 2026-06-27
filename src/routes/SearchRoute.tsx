import { useEffect, useRef, useState, useCallback } from 'react';
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
  IconListCheck,
  IconPlayerPlay,
  IconSearch,
} from '@tabler/icons-react';
import { useBibleStore } from '../store';
import { searchBible, SearchVerse } from '../api';
import { PlaylistItem } from '../types';
import {
  BOOK_CODE_TO_NAME,
  BOOK_CODE_TO_ORDER,
} from '../utils/bibleUtils';

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

  const activeTextFilesetId = useBibleStore(
    (s) => s.activeTextFilesetId,
  );
  const setAudioPlaylistItems = useBibleStore(
    (s) => s.setAudioPlaylistItems,
  );
  const setActiveVerses = useBibleStore(
    (s) => s.setActiveVerses,
  );
  const setActiveBookAndChapter = useBibleStore(
    (s) => s.setActiveBookAndChapter,
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const handleInputChange = useCallback(
    (val: string) => {
      setInputValue(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (val.trim()) {
              next.set('q', val.trim());
            } else {
              next.delete('q');
            }
            next.delete('page');
            return next;
          },
          { replace: true },
        );
      }, 300);
    },
    [setSearchParams],
  );

  useEffect(() => {
    setInputValue(q);
  }, [q]);

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

  const groups = groupByBook(verses);
  const allPlaylistItems = verses.map((v, i) =>
    toPlaylistItem(v, i, verses.length),
  );

  const handlePlayVerse = (v: SearchVerse) => {
    setAudioPlaylistItems([toPlaylistItem(v, 0, 1)]);
  };

  const handlePlayAll = () => {
    if (allPlaylistItems.length > 0) {
      setAudioPlaylistItems(allPlaylistItems);
    }
  };

  const handleVerseClick = (v: SearchVerse) => {
    const bookName = BOOK_CODE_TO_NAME[v.book_id] ?? v.book_id;
    setActiveBookAndChapter(bookName, v.chapter);
    setActiveVerses([v.verse_start]);
    navigate(`/bible/${bookName}/${v.chapter}`);
  };

  return (
    <Box p="md" maw={800} mx="auto">
      <Title order={2} mb="md">
        Search Bible
      </Title>
      <TextInput
        icon={<IconSearch size={16} />}
        placeholder="Search for words or phrases..."
        value={inputValue}
        onChange={(e) => handleInputChange(e.currentTarget.value)}
        mb="md"
        size="md"
        aria-label="search-input"
      />

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
          <Group position="apart" mb="sm">
            <Text size="sm" color="dimmed">
              {verses.length} result{verses.length !== 1 ? 's' : ''}
            </Text>
            <Button
              size="xs"
              leftIcon={<IconListCheck size={14} />}
              variant="light"
              onClick={handlePlayAll}
              aria-label="play-all"
            >
              Play all
            </Button>
          </Group>

          <Accordion variant="separated" chevronPosition="right">
            {groups.map((group) => (
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
                    {group.verses.map((v) => (
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
                          <Text size="xs" color="dimmed" mb={2}>
                            {group.displayName} {v.chapter}:
                            {v.verse_start}
                          </Text>
                          <Text size="sm">{v.verse_text}</Text>
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
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
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
