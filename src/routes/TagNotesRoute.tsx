import {
  Suspense,
  useEffect,
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
} from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
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
import { lazyWithReload } from '../utils/lazyWithReload';
import { HEADER_HEIGHT } from '../utils/layoutChrome';
import { AUDIO_PLAYER_HEIGHT } from '../utils/audioUtils';
import { useTranslation } from 'react-i18next';

// Lazy + gated below on isEditModalOpen — the modal pulls in
// TipTap, which should not ship with the route chunk.
const EditNoteModal = lazyWithReload(
  () => import('../components/EditNoteModal')
);

// Stable fallback so `notes` keeps a constant identity for the
// sortedNotes memo when the store unexpectedly holds a
// non-array value.
const NO_NOTES: Note[] = [];

export default function TagNotesRoute() {
  const { t } = useTranslation();
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
  // this flag; the filter/sort toolbar follows it — both
  // overlay the notes scroll viewport, so toggling them never
  // reflows the list.
  const headerVisible = useBibleStore(
    (state) => state.headerVisible
  );
  // The audio player is fixed to the viewport bottom and never
  // hides on scroll — the scrolled content clears it via the
  // same inside-padding the header/toolbar overlays use.
  const showAudioPlayer = useBibleStore(
    (state) => state.showAudioPlayer
  );
  // Measured height of the overlay toolbar — feeds the
  // clearance INSIDE the scrolled content so the first note
  // rests below the chrome while it is shown.
  const { ref: toolbarRef, height: toolbarHeight } =
    useElementSize();

  // Get sort order from URL, default to 'custom_asc'
  const urlSortOrder = searchParams.get('sort') as SortOrder | null;
  const sortOrder: SortOrder =
    urlSortOrder && SORT_ORDERS.includes(urlSortOrder)
      ? urlSortOrder
      : 'custom_asc';

  // `?descendants=1` — the merged "include sub-tags" view.
  const includeDescendants =
    searchParams.get('descendants') === '1';

  // Ownership: the caller's own tag list is the primary signal —
  // note pages cached before `is_owner` shipped lack the field,
  // so without the tags check an owner would lose
  // drag/order/edit/delete on their own tag. For foreign public
  // tags the strict every-note `is_owner === true` fallback
  // keeps write affordances hidden. An explicit
  // `is_owner === false` on ANY loaded note fails closed even
  // when the tag sits in the caller's list — the backend
  // move/reorder endpoints only touch the requester's rows.
  // Evaluated per tag so the merged subtree view keeps the
  // check for shared foreign tags too.
  const tagOwnerFor = (
    sectionTagId: string | undefined,
    sectionNotes: Note[]
  ) =>
    isAuthenticated &&
    sectionNotes.every((n) => n.is_owner !== false) &&
    (storedTags.some((tag) => tag.id === sectionTagId) ||
      (sectionNotes.length > 0 &&
        sectionNotes.every((n) => n.is_owner === true)));

  const isTagOwner = tagOwnerFor(tagId, notes);

  const {
    enabled: orderMenuEnabled,
    orderMenu,
    reloadOrderIndex,
    handleReorder,
  } = useNoteOrderMenu({
    tagId,
    sortOrder,
    // Reorder is meaningless on the virtual "untagged" view even
    // when every listed note is owned — the hook disables it.
    isTagOwner,
    isUntagged,
    // ... and equally meaningless on the merged subtree view —
    // positions are per-tag.
    includeDescendants,
  });

  const {
    tag,
    loading,
    pageLoading,
    error,
    commentCounts,
    settledQueryKey,
    notesQueryKey,
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
    includeDescendants,
    setSearchParams,
    orderMenuEnabled,
    reloadOrderIndex,
  });

  const sortedNotes = useMemo(
    () => sortNotes(notes, sortOrder),
    [notes, sortOrder]
  );

  // tag id → name lookups reuse a Map instead of a per-note
  // array scan (perf rule: build an index for repeated
  // lookups).
  const tagNameById = useMemo(
    () => new Map(storedTags.map((tag) => [tag.id, tag.name])),
    [storedTags]
  );

  // Merged mode: group the page's notes by their tag,
  // preserving note order inside each group — one TagSection
  // per tag. Single-tag mode skips this entirely.
  const noteSections = useMemo(() => {
    if (!includeDescendants) return [];
    const byTag = new Map<string, { tagName: string; notes: Note[] }>();
    for (const note of sortedNotes) {
      const id = note.tag?.id ?? UNTAGGED_TAG_ID;
      let group = byTag.get(id);
      if (!group) {
        group = {
          tagName:
            tagNameById.get(id) ??
            note.tag?.name ??
            t('common.untagged'),
          notes: [],
        };
        byTag.set(id, group);
      }
      group.notes.push(note);
    }
    return [...byTag.entries()].map(([sectionTagId, group]) => ({
      tagId: sectionTagId,
      ...group,
    }));
  }, [includeDescendants, sortedNotes, tagNameById, t]);

  // A foreign tag (shared-with-me grant or public link) never
  // sits in the caller's own tag list, so `storedTags` can't
  // reveal its subtree. The merged page is the only signal: a
  // note attached to a different tag id proves the viewed tag
  // has descendants. The observation latches for the session —
  // toggling the subtree switch off refetches tag-only notes,
  // and losing the switch then would trap the user out of the
  // merged view. Both gates matter: `notes` keeps the previous
  // tag's rows while a fetch is in flight (and across sessions
  // via persistence), so `includeDescendants` alone isn't
  // enough — `settledQueryKey` is the request-scoped half,
  // proving the rows belong to THIS tag's merged fetch rather
  // than stale leftovers that would latch a childless tag on
  // every navigation.
  const [foreignSubtreeIds, setForeignSubtreeIds] =
    useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (
      !tagId ||
      !includeDescendants ||
      settledQueryKey !== notesQueryKey ||
      foreignSubtreeIds.has(tagId)
    ) {
      return;
    }
    if (
      notes.some((n) => n.tag != null && n.tag.id !== tagId)
    ) {
      setForeignSubtreeIds(
        (prev) => new Set(prev).add(tagId)
      );
    }
  }, [
    notes,
    tagId,
    includeDescendants,
    settledQueryKey,
    notesQueryKey,
    foreignSubtreeIds,
  ]);

  const tagHasChildren = useMemo(
    () =>
      storedTags.some((tag) => tag.parent_tag === tagId) ||
      (tagId !== undefined && foreignSubtreeIds.has(tagId)),
    [storedTags, tagId, foreignSubtreeIds]
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
    void navigate(buildBiblePath(book, chapter, [verse]));
    setShowNotes(false);
  };

  const handleTagChange = (value: string | null) => {
    if (value && value !== tagId) {
      void navigate(`/notes/tag/${value}`);
    }
  };

  const handleToggleDescendants = (include: boolean) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (include) {
        next.set('descendants', '1');
      } else {
        next.delete('descendants');
      }
      return next;
    });
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
        <Loader
          size="lg"
          aria-label={t('notes.loadingNotes')}
        />
      </Center>
    );
  }

  if (error || !tag) {
    return (
      <Center style={{ height: '100vh' }}>
        <Text color="red" size="lg">
          {error || t('tags.notFound')}
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
    // Same overlay-chrome model as /bible: MyHeader and the
    // filter/sort toolbar slide over a fixed, full-height
    // scroll viewport while the clearance for them lives
    // INSIDE the scrolled content — so toggling the chrome
    // never resizes the viewport and the notes never jump.
    <Box style={{ position: 'relative', height: '100vh' }}>
      <ScrollArea style={{ height: '100%' }}>
        <Box
          pt={HEADER_HEIGHT + toolbarHeight}
          pb={showAudioPlayer ? AUDIO_PLAYER_HEIGHT : 0}
        >
          {pageLoading ? (
            <Center style={{ height: 200 }}>
              <Loader aria-label={t('notes.loadingNotes')} />
            </Center>
          ) : notes.length > 0 ? (
            <Stack spacing="md" pb="xl" px="md">
              {pagination}
              {includeDescendants ? (
                // Merged subtree view — one section per tag.
                // Reorder and the order index are per-tag, so
                // both stay off here.
                noteSections.map((section) => {
                  const sectionOwner = tagOwnerFor(
                    section.tagId,
                    section.notes
                  );
                  return (
                    <TagSection
                      key={section.tagId}
                      tagName={section.tagName}
                      notes={section.notes}
                      onViewInBible={handleViewInBible}
                      onEditNote={
                        sectionOwner
                          ? handleEditNote
                          : undefined
                      }
                      onDeleteNote={
                        sectionOwner
                          ? handleDeleteNote
                          : undefined
                      }
                      onPlayFromNote={playFromNote}
                      commentCounts={commentCounts}
                      onCountChange={handleCountChange}
                      isTagOwner={sectionOwner}
                      collapseActions
                      isDraggable={false}
                      tagId={section.tagId}
                      sortOrder={sortOrder}
                      currentPage={notesPage}
                      pageSize={notesPageSize}
                    />
                  );
                })
              ) : (
                <TagSection
                  tagName={tag.name}
                  notes={sortedNotes}
                  onViewInBible={handleViewInBible}
                  onEditNote={
                    isTagOwner ? handleEditNote : undefined
                  }
                  onDeleteNote={
                    isTagOwner ? handleDeleteNote : undefined
                  }
                  onPlayFromNote={playFromNote}
                  commentCounts={commentCounts}
                  onCountChange={handleCountChange}
                  isTagOwner={isTagOwner}
                  collapseActions
                  isDraggable={orderMenuEnabled}
                  tagId={tagId || ''}
                  onReorder={handleReorder}
                  sortOrder={sortOrder}
                  currentPage={notesPage}
                  pageSize={notesPageSize}
                  orderMenu={orderMenu}
                />
              )}

              {pagination}
            </Stack>
          ) : (
            <Center style={{ height: 200 }}>
              <Text>
                {isUntagged
                  ? t('notes.noUntagged')
                  : includeDescendants
                    ? t('notes.noNotesWithSubtags')
                    : t('notes.noNotesForTag')}
              </Text>
            </Center>
          )}
        </Box>
      </ScrollArea>

      {/* Overlay chrome: the toolbar rides under MyHeader
          (the top padding is the header zone) and slides away
          with it — transform-only, so the scroll viewport
          below never resizes and the notes never reflow.
          toolbarHeight feeds the in-content top padding. */}
      <Box
        data-testid="tag-notes-toolbar"
        aria-hidden={!headerVisible}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: HEADER_HEIGHT,
          transform: headerVisible
            ? 'translateY(0)'
            : 'translateY(-100%)',
          transition: 'transform 0.3s ease-in-out',
        }}
      >
        {/* The measured box must carry no padding:
            useElementSize reads border-box on mount but
            ResizeObserver's contentRect (padding excluded)
            on resizes — padding would be under-measured. */}
        <Box
          ref={toolbarRef}
          sx={(theme) => ({
            // Opaque so notes scrolling under the overlay do
            // not show through; matches AppShell's main bg.
            backgroundColor:
              theme.colorScheme === 'dark'
                ? theme.colors.dark[8]
                : theme.colors.gray[0],
          })}
        >
          <Box px="md" pt="md" pb="md">
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
              hasChildren={tagHasChildren}
              includeDescendants={includeDescendants}
              onToggleDescendants={handleToggleDescendants}
              tagPublic={tag.public}
              onTagChange={handleTagChange}
              onSortChange={handleSortChange}
              onPageSizeChange={handlePageSizeChange}
              onToggleFolded={handleToggleFolded}
              onRefresh={handleRefresh}
            />
          </Box>
        </Box>
      </Box>

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
