import {
  Suspense,
  lazy,
  useMemo,
  useState,
} from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ScrollArea,
  Stack,
  Center,
  Text,
  Loader,
  Box,
  Collapse,
} from '@mantine/core';
import { Note } from '../types';
import TagSection from '../components/TagSection';
import TagNotesToolbar from '../components/TagNotesToolbar';
import Pagination from '../components/Pagination';
import { useBibleStore } from '../store';
import { UNTAGGED_TAG_ID } from '../api';
import { useAuthStore } from '../stores/authStore';
import { buildBiblePath } from '../utils/bibleUtils';
import { pageCount } from '../utils/pagination';
import {
  SortOrder,
  SORT_ORDERS,
  sortNotes,
} from '../utils/noteSorting';
import { verseDomId } from '../utils/verseRefs';
import { useNoteOrderMenu } from '../hooks/useNoteOrderMenu';
import { useTagNotesData } from '../hooks/useTagNotesData';
import { useNotePlaylist } from '../hooks/useNotePlaylist';

// Lazy + gated below on isEditModalOpen — the modal pulls in
// TipTap, which should not ship with the route chunk.
const EditNoteModal = lazy(
  () => import('../components/EditNoteModal')
);

// Stable fallback so `notes` keeps a constant identity for the
// sortedNotes memo when the store unexpectedly holds a
// non-array value.
const NO_NOTES: Note[] = [];

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
  const notes = Array.isArray(notesFromStore)
    ? notesFromStore
    : NO_NOTES;
  const storedTags = useBibleStore((state) => state.tags);
  const setShowNotes = useBibleStore((state) => state.setShowNotes);
  const notesCount = useBibleStore((state) => state.notesCount);
  const notesPage = useBibleStore((state) => state.notesPage);
  const notesPageSize = useBibleStore((state) => state.notesPageSize);
  const versesFolded = useBibleStore((state) => state.versesFolded);
  const setVersesFolded = useBibleStore((state) => state.setVersesFolded);
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  // MyHeader slides away on a deliberate downward scroll via
  // this flag; the filter/sort toolbar follows it so the notes
  // list reclaims the freed space.
  const headerVisible = useBibleStore(
    (state) => state.headerVisible
  );

  // Get sort order from URL, default to 'custom_asc'
  const urlSortOrder = searchParams.get('sort') as SortOrder | null;
  const sortOrder: SortOrder =
    urlSortOrder && SORT_ORDERS.includes(urlSortOrder)
      ? urlSortOrder
      : 'custom_asc';

  // Ownership: the caller's own tag list is the primary signal —
  // production notes do not send `is_owner` yet, so without the
  // tags check an owner would lose drag/order/edit/delete on
  // their own tag. Two fail-closed terms cover the shared public
  // tag case: an explicit `is_owner === false` on any loaded
  // note hides write affordances outright (the backend only
  // mutates the requester's own rows), and a tag outside the
  // caller's list only passes when every loaded note reports
  // `is_owner === true`.
  const isTagOwner =
    isAuthenticated &&
    notes.every((n) => n.is_owner !== false) &&
    (storedTags.some((t) => t.id === tagId) ||
      (notes.length > 0 &&
        notes.every((n) => n.is_owner === true)));

  const {
    enabled: orderMenuEnabled,
    orderMenu,
    reloadOrderIndex,
    handleReorder,
  } = useNoteOrderMenu({
    tagId,
    sortOrder,
    isTagOwner,
    isUntagged,
  });

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

  const sortedNotes = useMemo(
    () => sortNotes(notes, sortOrder),
    [notes, sortOrder]
  );

  const { playFromNote } = useNotePlaylist(
    sortedNotes,
    loading,
    tagId
  );

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
    // Flex column so the ScrollArea below grows into whatever
    // space the collapsing chrome frees. The height mirrors
    // AppShell's paddingTop: viewport minus the header while it
    // is shown, the full viewport once it has slid away — both
    // animate on the same 0.3s ease-in-out so they stay in sync.
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: headerVisible
          ? 'calc(100vh - var(--mantine-header-height, 0px))'
          : '100vh',
        transition: 'height 0.3s ease-in-out',
      }}
    >
      <Collapse
        in={headerVisible}
        transitionDuration={300}
        data-testid="tag-notes-toolbar"
      >
        <Box px="md" pt="md">
          <TagNotesToolbar
            tags={storedTags}
            isAuthenticated={isAuthenticated}
            tagId={tagId}
            tagName={tag.name}
            sortOrder={sortOrder}
            pageSize={notesPageSize}
            shownCount={notes.length}
            totalCount={notesCount}
            versesFolded={versesFolded}
            onTagChange={handleTagChange}
            onSortChange={handleSortChange}
            onPageSizeChange={handlePageSizeChange}
            onToggleFolded={handleToggleFolded}
            onRefresh={handleRefresh}
          />
        </Box>
      </Collapse>

      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        {pageLoading ? (
          <Center style={{ height: 200 }}>
            <Loader aria-label="loading" />
          </Center>
        ) : notes.length > 0 ? (
          <Stack spacing="md" pb="xl" px="md">
            {pagination}
            <TagSection
              tagName={tag.name}
              notes={sortedNotes}
              onViewInBible={handleViewInBible}
              onEditNote={
                isTagOwner ? handleEditNote : undefined
              }
              onDeleteNote={
                isTagOwner
                  ? handleDeleteNote
                  : undefined
              }
              onPlayFromNote={playFromNote}
              commentCounts={commentCounts}
              onCountChange={handleCountChange}
              isTagOwner={isTagOwner}
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
