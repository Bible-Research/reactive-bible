import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
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
  Collapse,
} from '@mantine/core';
import {
  IconShare,
  IconRefresh,
  IconArrowsMaximize,
  IconArrowsMinimize,
} from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import type { MouseEvent } from 'react';
import {
  Note,
  Tag,
  CommentCounts,
  NoteOrderIndexEntry,
} from '../types';
import TagSection from '../components/TagSection';
import EditNoteModal from '../components/EditNoteModal';
import Pagination from '../components/Pagination';
import { useBibleStore } from '../store';
import {
  getTag,
  fetchCommentCounts,
  getNoteOrderIndex,
  UNTAGGED_TAG_ID,
} from '../api';
import { useAuthStore } from '../stores/authStore';
import { clearNotesCache } from '../utils/cacheManager';
import { buildBiblePath } from '../utils/bibleUtils';
import { shareOrCopyLink } from '../utils/share';
import { pageCount } from '../utils/pagination';
import {
  SortOrder,
  SORT_ORDERS,
  getApiOrdering,
  sortNotes,
} from '../utils/noteSorting';
import { buildNotePlaylistItems } from '../utils/notePlaylist';
import { verseDomId } from '../utils/verseRefs';


/** `#k — Book C:V[-V]`, or `#k — no passage` for verse-less
 *  notes. `k` is the canonical 1-based order ID. */
const entryLabel = (
  entry: NoteOrderIndexEntry,
  orderId: number
): string => {
  const idPart = `#${orderId}`;
  if (
    !entry.book ||
    entry.chapter === null ||
    entry.verse_start === null
  ) {
    return `${idPart} — no passage`;
  }
  const range =
    entry.verse_end !== null &&
    entry.verse_end !== entry.verse_start
      ? `${entry.verse_start}-${entry.verse_end}`
      : `${entry.verse_start}`;
  return `${idPart} — ${entry.book} ${entry.chapter}:${range}`;
};

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
  const notes = useMemo(
    () => (Array.isArray(notesFromStore) ? notesFromStore : []),
    [notesFromStore]
  );
  const storedTags = useBibleStore((state) => state.tags);
  const fetchNotes = useBibleStore((state) => state.fetchNotes);
  const getTags = useBibleStore((state) => state.getTags);
  const reorderNotes = useBibleStore((state) => state.reorderNotes);
  const deleteNote = useBibleStore((state) => state.deleteNote);
  const moveNoteAfter = useBibleStore(
    (state) => state.moveNoteAfter
  );
  const setShowNotes = useBibleStore((state) => state.setShowNotes);
  const setLastSelectedTagId = useBibleStore(
    (state) => state.setLastSelectedTagId
  );
  const notesCount = useBibleStore((state) => state.notesCount);
  const notesPage = useBibleStore((state) => state.notesPage);
  const notesPageSize = useBibleStore((state) => state.notesPageSize);
  const setNotesPageSize = useBibleStore(
    (state) => state.setNotesPageSize
  );
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

  // Page to restore on the first load. Seeded inside the mount
  // effect below — reading the store during render is unsafe —
  // and it must be captured before that effect writes
  // lastSelectedTagId (which would make the same-tag check
  // always true).
  const initialPageRef = useRef<number | null>(null);
  // The load effect re-runs on mount (StrictMode, auth
  // hydration); remember the last requested query so repeats
  // refetch the current page instead of resetting to page 1.
  const lastLoadRef = useRef<{ key: string; page: number } | null>(
    null
  );
  // Set while a delete is in flight; a second confirm + DELETE
  // would 404 and surface a spurious error notification.
  const deletingRef = useRef(false);

  const [tag, setTag] = useState<Tag | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] =
    useState<CommentCounts>({});
  // Compact index of every note in the tag, in canonical
  // ascending order. Derived data — deliberately kept out of
  // the persisted store — that powers the order-ID badges and
  // the move dropdown.
  const [orderIndex, setOrderIndex] =
    useState<NoteOrderIndexEntry[] | null>(null);
  // Latest-call-wins guard for `loadOrderIndex`: overlapping
  // fetches (rapid moves, tag switch mid-flight) must not
  // apply out of order.
  const orderIndexRequestRef = useRef(0);
  // Once the first load completes, later effect re-runs (sort
  // change, auth hydration) use the in-place page spinner
  // instead of blanking the screen behind the full loader.
  const hasLoadedRef = useRef(false);

  // Set showNotes to true and save lastSelectedTagId when on notes route
  useEffect(() => {
    if (tagId) {
      // Capture the page to restore BEFORE overwriting
      // lastSelectedTagId — after the write the same-tag
      // check would always pass. This runs before the
      // loader effect (declared below) consumes the ref.
      if (initialPageRef.current === null) {
        const stored = useBibleStore.getState();
        initialPageRef.current =
          stored.lastSelectedTagId === tagId &&
          stored.notesPage > 1
            ? stored.notesPage
            : 1;
      }
    }
    setShowNotes(true);
    if (tagId) {
      setLastSelectedTagId(tagId);
    }
    return () => {
      setAudioPlaylistItems(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagId]);

  useEffect(() => {
    let cancelled = false;

    const loadTagAndNotes = async () => {
      if (!tagId) {
        setError('No tag ID provided');
        setLoading(false);
        return;
      }

      if (hasLoadedRef.current) {
        setPageLoading(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        // Preload the caller's own tags when authenticated so the tag
        // switcher works. Failures are non-fatal for shared pages.
        if (isAuthenticated) {
          try { await getTags(); } catch { /* ignore */ }
        }

        // Fetch notes with ordering if non-default sort
        const apiOrdering =
          sortOrder !== 'custom_asc'
            ? getApiOrdering(sortOrder)
            : undefined;

        // Restore the stored page on the first load; re-runs
        // for the same tag+sort (StrictMode remount, auth
        // hydration) refetch the page the user is on instead
        // of bouncing back to page 1.
        const queryKey = `${tagId}:${sortOrder}`;
        let page: number;
        if (lastLoadRef.current?.key === queryKey) {
          // notesPage reflects this tag only once its notes are
          // in the store; before that, reuse the last request.
          const current = useBibleStore.getState();
          const ownsPage = current.notes.some(
            (n) =>
              isUntagged ? n.tag == null : n.tag?.id === tagId
          );
          page = ownsPage
            ? current.notesPage
            : lastLoadRef.current.page;
        } else {
          page = initialPageRef.current ?? 1;
          initialPageRef.current = 1;
        }
        lastLoadRef.current = { key: queryKey, page };

        await fetchNotes(tagId, {
          ordering: apiOrdering,
          page,
        });
        if (cancelled) return;

        const fetchedNotes = useBibleStore.getState().notes;
        let resolvedTag: Tag | null;
        if (isUntagged) {
          // No Tag row exists for the untagged view — use a
          // synthetic label object for display.
          resolvedTag = {
            id: UNTAGGED_TAG_ID,
            name: 'Untagged',
            parent_tag: null,
            created_at: '',
            updated_at: '',
          };
        } else {
          resolvedTag =
            useBibleStore
              .getState()
              .tags.find((t) => t.id === tagId) ||
            fetchedNotes[0]?.tag ||
            null;

          if (!resolvedTag) {
            try {
              resolvedTag = await getTag(tagId);
            } catch {
              resolvedTag = null;
            }
          }
        }

        if (cancelled) return;

        if (!resolvedTag) {
          setError('No public notes available for this tag.');
        } else {
          setTag(resolvedTag);
          hasLoadedRef.current = true;
        }
        setLoading(false);
        setPageLoading(false);

        if (!cancelled && tagId) {
          fetchCommentCounts({ tagId }).then((counts) => {
            if (!cancelled) setCommentCounts(counts);
          }).catch(() => { /* ignore comment count errors */ });
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading tag notes:', err);
        // A re-run failure (sort change, auth flip) keeps the
        // loaded list on screen — fetchNotes already toasted.
        if (!hasLoadedRef.current) {
          setError('Failed to load notes');
        }
        setLoading(false);
        setPageLoading(false);
      }
    };

    loadTagAndNotes();

    return () => {
      cancelled = true;
    };
  }, [
    tagId,
    fetchNotes,
    getTags,
    isAuthenticated,
    sortOrder,
    isUntagged,
  ]);

  // Ownership: the caller's own tag list is the primary signal —
  // production notes do not send `is_owner` yet, so without the
  // tags check an owner would lose drag/order/edit/delete on
  // their own tag. For foreign public tags keep the strict
  // every-note `is_owner === true` fallback so write affordances
  // stay hidden once the backend ships the field.
  const isTagOwner =
    isAuthenticated &&
    (storedTags.some((t) => t.id === tagId) ||
      (notes.length > 0 &&
        notes.every((n) => n.is_owner === true)));

  // The order badge/menu is gated exactly like `isDraggable`:
  // custom sort + owner.
  const orderMenuEnabled =
    (sortOrder === 'custom_asc' || sortOrder === 'custom_desc') &&
    isTagOwner;

  const loadOrderIndex = useCallback(async () => {
    if (!tagId) return;
    const requestId = ++orderIndexRequestRef.current;
    try {
      const entries = await getNoteOrderIndex(tagId);
      // A stale response (a newer fetch already started, or
      // the tag/sort changed) is dropped — latest wins.
      if (requestId === orderIndexRequestRef.current) {
        setOrderIndex(entries);
      }
    } catch (err) {
      // A missing/failed endpoint leaves the index null so the
      // badge stays hidden — the rest of the page still works.
      console.error('Error loading note order index:', err);
    }
  }, [tagId]);

  // Fetch the index once a custom sort + auth is active; it
  // covers every note in the tag, not just the current page.
  // Refetched after every move via the handlers below.
  useEffect(() => {
    if (orderMenuEnabled) {
      loadOrderIndex();
    } else {
      // Invalidate any in-flight fetch before clearing.
      orderIndexRequestRef.current += 1;
      setOrderIndex(null);
    }
  }, [orderMenuEnabled, loadOrderIndex]);

  // Order ID = 1-based rank in canonical ascending order —
  // identical IDs in both custom sort directions.
  const orderIdByNoteId = useMemo(() => {
    const map = new Map<string, number>();
    orderIndex?.forEach((entry, index) => {
      map.set(entry.id, index + 1);
    });
    return map;
  }, [orderIndex]);

  // Display-order "after" translates to canonical placement:
  // in custom_desc visual after = canonical before.
  const handleMoveAfter = useCallback(
    async (noteId: string, targetNoteId: string) => {
      if (!tagId) return;
      try {
        await moveNoteAfter(
          tagId,
          noteId,
          targetNoteId,
          sortOrder === 'custom_desc' ? 'before' : 'after'
        );
      } catch {
        // The store action already showed a notification.
      } finally {
        await loadOrderIndex();
      }
    },
    [tagId, sortOrder, moveNoteAfter, loadOrderIndex]
  );

  const handleMoveToTop = useCallback(
    async (noteId: string) => {
      if (!tagId || !orderIndex || orderIndex.length === 0) {
        return;
      }
      // Visual top is the canonical first entry ascending but
      // the canonical last entry descending.
      const descending = sortOrder === 'custom_desc';
      const target = descending
        ? orderIndex[orderIndex.length - 1]
        : orderIndex[0];
      try {
        await moveNoteAfter(
          tagId,
          noteId,
          target.id,
          descending ? 'after' : 'before'
        );
      } catch {
        // The store action already showed a notification.
      } finally {
        await loadOrderIndex();
      }
    },
    [
      tagId,
      sortOrder,
      orderIndex,
      moveNoteAfter,
      loadOrderIndex,
    ]
  );

  // A drag-reorder must re-pull the order index once the store
  // action settles — otherwise badges, topOrderId and the menu
  // labels keep their pre-drag values (and Move-to-top can aim
  // at an entry that is no longer canonical-first).
  const handleReorder = useCallback(
    async (
      reorderTagId: string,
      noteIds: string[],
      currentPage: number,
      pageSize: number
    ) => {
      try {
        await reorderNotes(
          reorderTagId,
          noteIds,
          currentPage,
          pageSize
        );
      } catch {
        // The store action already showed a notification.
      } finally {
        await loadOrderIndex();
      }
    },
    [reorderNotes, loadOrderIndex]
  );

  const orderMenu = useMemo(
    () =>
      orderMenuEnabled && orderIndex
        ? {
            // Labels are computed once here so ~100 mounted
            // menus share them instead of each re-mapping the
            // full index on every render. Under custom_desc the
            // page displays the index reversed, so the picker
            // lists entries in that same visual order.
            labeledEntries: (
              sortOrder === 'custom_desc'
                ? [...orderIndex].reverse()
                : orderIndex
            ).map((entry) => ({
              entry,
              // Built from this same array, so every entry
              // is guaranteed an order ID.
              label: entryLabel(
                entry,
                orderIdByNoteId.get(entry.id) as number
              ),
            })),
            orderIdByNoteId,
            // Visual top is canonical #1 ascending but the
            // highest order ID descending.
            topOrderId:
              sortOrder === 'custom_desc'
                ? orderIndex.length
                : 1,
            onMoveAfter: handleMoveAfter,
            onMoveToTop: handleMoveToTop,
          }
        : undefined,
    [
      orderMenuEnabled,
      orderIndex,
      orderIdByNoteId,
      sortOrder,
      handleMoveAfter,
      handleMoveToTop,
    ]
  );

  const handleEditNote = (note: Note) => {
    setNoteToEdit(note);
    setIsEditModalOpen(true);
  };

  const handleDeleteNote = async (
    evt: MouseEvent<HTMLButtonElement>,
    note: Note
  ) => {
    evt.preventDefault();
    if (!note.id || deletingRef.current) return;
    if (!window.confirm('Are you sure you want to delete this note?')) {
      return;
    }
    deletingRef.current = true;
    try {
      try {
        // The store action drops the card from state as soon as
        // the DELETE resolves, so the list updates without
        // waiting for the page refetch below.
        await deleteNote(note.id);
      } catch {
        return; // Store already surfaced an error notification.
      }
      if (!tagId) return;
      // The user may have navigated to a different tag while the
      // DELETE was in flight; don't touch its notes list.
      if (useBibleStore.getState().lastSelectedTagId !== tagId) {
        return;
      }
      const apiOrdering =
        sortOrder !== 'custom_asc'
          ? getApiOrdering(sortOrder)
          : undefined;
      // Pull the latest server state for the page being viewed
      // so it backfills; if this was its last note, fall back
      // to the new last page.
      const current = useBibleStore.getState();
      const lastPage = Math.max(
        1,
        pageCount(current.notesCount, current.notesPageSize)
      );
      // An emptied list would flash "No notes found" while the
      // backfill is in flight; show the page loader instead.
      const emptied = current.notes.length === 0;
      if (emptied) setPageLoading(true);
      try {
        await fetchNotes(tagId, {
          ordering: apiOrdering,
          page: Math.min(current.notesPage, lastPage),
        });
        // Resync badges/menu labels — the deleted note's
        // rank shifts every entry below it.
        if (orderMenuEnabled) {
          await loadOrderIndex();
        }
      } catch {
        // fetchNotes already surfaced an error notification.
      } finally {
        if (emptied) setPageLoading(false);
      }
    } finally {
      deletingRef.current = false;
    }
  };

  const handleViewInBible = (
    book: string,
    chapter: number,
    verse: number
  ) => {
    navigate(buildBiblePath(book, chapter, [verse]));
    setShowNotes(false);
  };

  const handleCountChange = (
    noteId: string,
    delta: number
  ) => {
    setCommentCounts((prev) => ({
      ...prev,
      [noteId]: (prev[noteId] ?? 0) + delta,
    }));
  };

  const handleTagChange = (value: string | null) => {
    if (value && value !== tagId) {
      navigate(`/notes/tag/${value}`);
    }
  };

  const handleRefresh = async () => {
    if (!tagId) return;
    
    try {
      // Clear cache for this tag
      clearNotesCache(tagId);

      // Refetch only the page the user is currently on so
      // they keep their place after refreshing
      const apiOrdering =
        sortOrder !== 'custom_asc'
          ? getApiOrdering(sortOrder)
          : undefined;

      await fetchNotes(tagId, {
        ordering: apiOrdering,
        page: notesPage,
      });

      // getTags is an authenticated call — skip it on shared
      // public-tag pages so anon refreshes don't 401/logout.
      if (isAuthenticated) {
        try {
          await getTags();
        } catch {
          // The store action already showed the error toast.
        }
      }

      // Keep the order index current with whatever the
      // refetch brought back.
      if (orderMenuEnabled) {
        await loadOrderIndex();
      }

      showNotification({
        title: 'Refreshed!',
        message: 'Notes updated from server',
        color: 'green',
      });
    } catch (err) {
      console.error('Error refreshing notes:', err);
      showNotification({
        title: 'Error',
        message: 'Failed to refresh notes',
        color: 'red',
      });
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

  // The URL is the source of truth for sorting: writing
  // `?sort=` re-runs the load effect (sortOrder dep), which
  // issues the single fetch — a manual fetch here used to
  // double-request every sort change.
  const handleSortChange = useCallback(
    (newSortOrder: string) => {
      if (!tagId) return;
      setSearchParams({ sort: newSortOrder });
    },
    [tagId, setSearchParams]
  );

  const handlePageChange = useCallback(
    async (newPage: number) => {
      if (!tagId) return;
      
      const apiOrdering =
        sortOrder !== 'custom_asc'
          ? getApiOrdering(sortOrder)
          : undefined;

      setPageLoading(true);
      try {
        await fetchNotes(tagId, {
          ordering: apiOrdering,
          page: newPage,
          append: false,
        });
      } finally {
        setPageLoading(false);
      }

      // Scroll to top of notes section
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [tagId, sortOrder, fetchNotes]
  );

  const handlePageSizeChange = useCallback(
    async (newPageSize: string | null) => {
      if (!newPageSize || !tagId) return;
      
      const pageSizeNum = parseInt(newPageSize, 10);
      setNotesPageSize(pageSizeNum);
      
      // Clear cache and refetch from page 1
      clearNotesCache(tagId);
      
      const apiOrdering =
        sortOrder !== 'custom_asc'
          ? getApiOrdering(sortOrder)
          : undefined;

      setPageLoading(true);
      try {
        await fetchNotes(tagId, {
          ordering: apiOrdering,
          page: 1,
          append: false,
        });
      } finally {
        setPageLoading(false);
      }

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [tagId, sortOrder, setNotesPageSize, fetchNotes]
  );

  const sortedNotes = useMemo(
    () => sortNotes(notes, sortOrder),
    [notes, sortOrder]
  );

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

  // Notes that can actually produce playlist items — the same
  // filtered list the playlist is built from.
  const playableNotes = useMemo(
    () =>
      sortedNotes.filter((n) => (n.verses?.length ?? 0) > 0),
    [sortedNotes]
  );

  // One item per book+chapter block: a note whose verses span
  // several chapters emits one item per block — see
  // buildNotePlaylistItems for the itemId/scope split.
  const playlistItems = useMemo(
    () => buildNotePlaylistItems(playableNotes),
    [playableNotes]
  );

  const handlePlayFromNote = useCallback(
    (noteId: string) => {
      // The start index must come from the same filtered item
      // list handed to the playlist — a verse-less note earlier
      // in sortedNotes would otherwise shift it off by one.
      // Match on `scope` (the note id), not itemId — multi-block
      // notes carry suffixed itemIds and several entries share
      // one scope; the first block is the right start index.
      const itemIndex = playlistItems.findIndex(
        (item) => (item.scope ?? item.itemId) === noteId
      );
      if (itemIndex < 0) return;
      setAudioPlaylistStartIndex(itemIndex);

      const noteIndex = playableNotes.findIndex(
        (n) => n.id === noteId
      );
      showNotification({
        title: 'Playlist Started',
        message:
          `Playing from note ${noteIndex + 1} ` +
          `of ${playableNotes.length}`,
        color: 'blue',
        autoClose: 3000,
      });
    },
    [
      playlistItems,
      playableNotes,
      setAudioPlaylistStartIndex,
    ]
  );

  useEffect(() => {
    if (loading || playlistItems.length === 0) {
      setAudioPlaylistItems(null);
      return;
    }
    setAudioPlaylistItems(playlistItems);
  }, [loading, playlistItems, setAudioPlaylistItems]);

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
        <Stack spacing="sm" mb="md" px="md" pt="md">
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
                label={
                  versesFolded ? 'Unfold verses' : 'Fold verses'
                }
                position="left"
              >
                <ActionIcon
                  onClick={handleToggleFolded}
                  variant="subtle"
                  color={versesFolded ? 'blue' : 'gray'}
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
      </Collapse>

      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
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
                isTagOwner ? handleEditNote : undefined
              }
              onDeleteNote={
                isTagOwner
                  ? handleDeleteNote
                  : undefined
              }
              onPlayFromNote={handlePlayFromNote}
              commentCounts={commentCounts}
              onCountChange={handleCountChange}
              isTagOwner={isTagOwner}
              isDraggable={
                (sortOrder === 'custom_asc' ||
                  sortOrder === 'custom_desc') &&
                isTagOwner
              }
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

      <EditNoteModal
        opened={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        note={noteToEdit}
      />
    </Box>
  );
}
