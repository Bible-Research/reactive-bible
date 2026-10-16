import {
  Suspense,
  lazy,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ScrollArea,
  Stack,
  Center,
  Text,
  Loader,
  Box,
  Group,
  Select,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconShare,
  IconRefresh,
  IconArrowsMaximize,
  IconArrowsMinimize,
} from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { Note } from '../types';
import TagSection from '../components/TagSection';
import Pagination from '../components/Pagination';
import { useBibleStore } from '../store';
import { UNTAGGED_TAG_ID } from '../api';
import { useAuthStore } from '../stores/authStore';
import { buildBiblePath } from '../utils/bibleUtils';
import { shareOrCopyLink } from '../utils/share';
import { pageCount } from '../utils/pagination';
import {
  SortOrder,
  SORT_ORDERS,
  sortNotes,
} from '../utils/noteSorting';
import { buildNotePlaylistItems } from '../utils/notePlaylist';
import { verseDomId } from '../utils/verseRefs';
import { useNoteOrderMenu } from '../hooks/useNoteOrderMenu';
import { useTagNotesData } from '../hooks/useTagNotesData';

// Lazy + gated below on isEditModalOpen — the modal pulls in
// TipTap, which should not ship with the route chunk.
const EditNoteModal = lazy(
  () => import('../components/EditNoteModal')
);

export default function TagNotesRoute() {
  const { tagId } = useParams<{ tagId: string }>();
  // `/notes/tag/untagged` is the virtual "no tag" view: the
  // API translates the sentinel into a tag__isnull filter.
  const isUntagged = tagId === UNTAGGED_TAG_ID;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState<Note | null>(null);
  
  const notesFromStore = useBibleStore((state) => state.notes);
  const notes = Array.isArray(notesFromStore) ? notesFromStore : [];
  const storedTags = useBibleStore((state) => state.tags);
  const setShowNotes = useBibleStore((state) => state.setShowNotes);
  const notesCount = useBibleStore((state) => state.notesCount);
  const notesPage = useBibleStore((state) => state.notesPage);
  const notesPageSize = useBibleStore((state) => state.notesPageSize);
  const versesFolded = useBibleStore((state) => state.versesFolded);
  const setVersesFolded = useBibleStore((state) => state.setVersesFolded);
  const setAudioPlaylistItems = useBibleStore(
    (state) => state.setAudioPlaylistItems
  );
  const setAudioPlaylistStartIndex = useBibleStore(
    (state) => state.setAudioPlaylistStartIndex
  );
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  
  // Get sort order from URL, default to 'custom_asc'
  const urlSortOrder = searchParams.get('sort') as SortOrder | null;
  const sortOrder: SortOrder =
    urlSortOrder && SORT_ORDERS.includes(urlSortOrder)
      ? urlSortOrder
      : 'custom_asc';

  // Order badges/menus + drag-reorder — enabled and resynced
  // via the shared hook (custom sort + auth + owned notes).
  const {
    enabled: orderMenuEnabled,
    orderMenu,
    reloadOrderIndex,
    handleReorder,
  } = useNoteOrderMenu({
    tagId,
    sortOrder,
    isAuthenticated,
    isUntagged,
    notes,
  });

  // Tag + notes loading, pagination, sort/refresh/delete
  // orchestration — owned by the data hook.
  const {
    tag,
    loading,
    pageLoading,
    error,
    commentCounts,
    handleSortChange,
    handlePageChange,
    handlePageSizeChange,
    handleRefresh,
    handleDeleteNote,
    handleCountChange,
  } = useTagNotesData({
    tagId,
    sortOrder,
    isUntagged,
    isAuthenticated,
    setSearchParams,
    orderMenuEnabled,
    reloadOrderIndex,
  });

  const handleEditNote = (note: Note) => {
    setNoteToEdit(note);
    setIsEditModalOpen(true);
  };

  const handleViewInBible = (
    book: string,
    chapter: number,
    verse: number
  ) => {
    navigate(buildBiblePath(book, chapter, [verse]));
    setShowNotes(false);
  };

  const handleTagChange = (value: string | null) => {
    if (value && value !== tagId) {
      navigate(`/notes/tag/${value}`);
    }
  };

  const handleShare = async () => {
    await shareOrCopyLink(
      {
        title: `Notes: ${tag?.name || 'Tag'}`,
        // notesCount is the tag total; notes.length is only
        // the currently loaded page.
        text:
          `Check out these ${notesCount} note(s) ` +
          `tagged with "${tag?.name}"`,
        url: window.location.href,
      },
      {
        shareSuccess: {
          title: 'Shared!',
          message: 'Link shared successfully',
        },
        copySuccess: {
          title: 'Link Copied!',
          message: 'Tag link copied to clipboard',
        },
        copyFailure: {
          title: 'Error',
          message: 'Failed to copy link',
        },
      }
    );
  };

  const sortedNotes = sortNotes(notes, sortOrder);

  const handleToggleFolded = () => {
    const next = !versesFolded;
    setVersesFolded(next);
    if (next) return; // Folding needs no scroll compensation.
    // After unfolding, restore focus to the selected or
    // currently-playing verse inside its note card.
    setTimeout(() => {
      const { verseSelection, audioActiveVerse } =
        useBibleStore.getState();
      const focus =
        verseSelection && verseSelection.refs.length > 0
          ? {
              scope: verseSelection.scope,
              ref: verseSelection.refs[0],
            }
          : audioActiveVerse?.scope
            ? { scope: audioActiveVerse.scope, ref: audioActiveVerse }
            : null;
      if (focus) {
        document
          .getElementById(verseDomId(focus.scope, focus.ref))
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 50);
  };

  // Verse-less notes never become playlist items; "play from
  // here" must index the same filtered list the playlist
  // effect below builds, or the start position is off.
  const playableNotes = sortedNotes.filter(
    (n) => (n.verses?.length ?? 0) > 0
  );

  const handlePlayFromNote = useCallback(
    (noteId: string) => {
      const noteIndex = playableNotes.findIndex(
        (n) => n.id === noteId
      );

      if (noteIndex >= 0) {
        setAudioPlaylistStartIndex(noteIndex);

        showNotification({
          title: 'Playlist Started',
          message:
            `Playing from note ${noteIndex + 1} ` +
            `of ${playableNotes.length}`,
          color: 'blue',
          autoClose: 3000,
        });
      }
    },
    [playableNotes, setAudioPlaylistStartIndex]
  );

  useEffect(() => {
    if (loading || notes.length === 0) {
      setAudioPlaylistItems(null);
      return;
    }
    const items = buildNotePlaylistItems(sortedNotes);
    setAudioPlaylistItems(items.length > 0 ? items : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, sortOrder, loading, setAudioPlaylistItems]);

  if (loading) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader size="lg" aria-label="loading" />
      </Center>
    );
  }

  if (error || !tag) {
    return (
      <Center style={{ height: '100vh' }}>
        <Text color="red" size="lg">
          {error || 'Tag not found'}
        </Text>
      </Center>
    );
  }

  const sortedTags = [...storedTags].sort(
    (a, b) => a.name.localeCompare(b.name)
  );

  // Calculate total pages
  const totalPages = pageCount(notesCount, notesPageSize);

  const pagination = totalPages > 1 ? (
    <Pagination
      currentPage={notesPage}
      totalPages={totalPages}
      onPageChange={handlePageChange}
    />
  ) : null;

  return (
    <Box p="md">
      <Stack spacing="sm" mb="md">
        {isAuthenticated && sortedTags.length > 0 ? (
          <Select
            label="Filter by tag"
            placeholder="Select a tag"
            value={tagId}
            onChange={handleTagChange}
            // Grouped items render above a divider; the
            // ungrouped "Untagged" entry lands in its own
            // bottom section (Mantine v6 SelectItems).
            data={[
              ...sortedTags.map((t) => ({
                value: t.id,
                label: t.name,
                group: 'Tags',
              })),
              { value: UNTAGGED_TAG_ID, label: 'Untagged' },
            ]}
            searchable
            style={{ maxWidth: 400 }}
          />
        ) : (
          <Text fw={500} size="lg">{tag.name}</Text>
        )}
        <Group spacing="xs" position="apart">
          <Group spacing="xs" noWrap>
            <Select
              size="xs"
              value={sortOrder}
              onChange={(v) => {
                if (v) {
                  handleSortChange(v);
                }
              }}
              data={[
                {
                  value: 'custom_asc',
                  label: 'Custom: Ascending',
                },
                {
                  value: 'custom_desc',
                  label: 'Custom: Descending',
                },
                {
                  value: 'created_desc',
                  label: 'Date: Newest first',
                },
                {
                  value: 'created_asc',
                  label: 'Date: Oldest first',
                },
                {
                  value: 'verse_asc',
                  label: 'Verse: Ascending',
                },
                {
                  value: 'verse_desc',
                  label: 'Verse: Descending',
                },
              ]}
              style={{ width: 170, flexShrink: 0 }}
            />
            <Select
              size="xs"
              value={String(notesPageSize)}
              onChange={handlePageSizeChange}
              data={[
                { value: '5', label: '5' },
                { value: '25', label: '25' },
                { value: '50', label: '50' },
                { value: '100', label: '100' },
              ]}
              style={{ width: 60, flexShrink: 0 }}
            />
          </Group>
          <Group spacing="xs" noWrap>
            <Text
              color="dimmed"
              size="sm"
              sx={(theme) => ({
                [theme.fn.smallerThan('sm')]: {
                  display: 'none',
                },
              })}
            >
              {notes.length}
              {notesCount > notes.length && ` of ${notesCount}`}
              {' '}
              {notes.length === 1 ? 'note' : 'notes'}
            </Text>
            <Tooltip
              label={versesFolded ? "Unfold verses" : "Fold verses"}
              position="left"
            >
              <ActionIcon
                onClick={handleToggleFolded}
                variant="subtle"
                color={versesFolded ? "blue" : "gray"}
                size="lg"
                aria-label={
                  versesFolded ? 'Unfold verses' : 'Fold verses'
                }
              >
                {versesFolded
                  ? <IconArrowsMaximize size={20} />
                  : <IconArrowsMinimize size={20} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Refresh notes" position="left">
              <ActionIcon
                onClick={handleRefresh}
                variant="subtle"
                color="gray"
                size="lg"
                aria-label="Refresh notes"
              >
                <IconRefresh size={20} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Share tag link" position="left">
              <ActionIcon
                onClick={handleShare}
                variant="subtle"
                color="blue"
                size="lg"
                aria-label="Share tag link"
              >
                <IconShare size={20} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Stack>

      <ScrollArea style={{ height: 'calc(100vh - 200px)' }}>
        {pageLoading ? (
          <Center style={{ height: 200 }}>
            <Loader aria-label="loading" />
          </Center>
        ) : notes.length > 0 ? (
          <Stack spacing="md" pb="xl">
            {pagination}
            <TagSection
              tagName={tag.name}
              notes={sortedNotes}
              onViewInBible={handleViewInBible}
              onEditNote={
                isAuthenticated ? handleEditNote : undefined
              }
              onDeleteNote={
                isAuthenticated
                  ? handleDeleteNote
                  : undefined
              }
              onPlayFromNote={handlePlayFromNote}
              commentCounts={commentCounts}
              onCountChange={handleCountChange}
              isDraggable={orderMenuEnabled}
              tagId={tagId || ''}
              onReorder={handleReorder}
              sortOrder={sortOrder}
              currentPage={notesPage}
              pageSize={notesPageSize}
              orderMenu={orderMenu}
            />
            
            {pagination}
          </Stack>
        ) : (
          <Center style={{ height: 200 }}>
            <Text>
              {isUntagged
                ? 'No untagged notes.'
                : 'No notes found for this tag.'}
            </Text>
          </Center>
        )}
      </ScrollArea>

      {isEditModalOpen && (
        <Suspense fallback={null}>
          <EditNoteModal
            opened={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            note={noteToEdit}
          />
        </Suspense>
      )}
    </Box>
  );
}
