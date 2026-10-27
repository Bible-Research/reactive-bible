import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { MouseEvent } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';
import { showNotification } from '@mantine/notifications';
import {
  UNTAGGED_TAG_ID,
  fetchCommentCounts,
  getTag,
} from '../api';
import { useBibleStore } from '../store';
import type { CommentCounts, Note, Tag } from '../types';
import { clearNotesCache } from '../utils/cacheManager';
import { getApiOrdering } from '../utils/noteSorting';
import type { SortOrder } from '../utils/noteSorting';
import { pageCount } from '../utils/pagination';

interface UseTagNotesDataOptions {
  tagId: string | undefined;
  sortOrder: SortOrder;
  isUntagged: boolean;
  isAuthenticated: boolean;
  /**
   * `?descendants=1` — merge the viewed tag's subtree notes
   * into the page. Folds into the load-effect query key so
   * toggling the toolbar switch refetches, and rides on every
   * fetchNotes call so pagination/refresh keep merged mode.
   */
  includeDescendants: boolean;
  setSearchParams: SetURLSearchParams;
  /** Order-menu gate + resync — owned by `useNoteOrderMenu`;
   *  delete/refresh re-pull the index only while it is on. */
  orderMenuEnabled: boolean;
  reloadOrderIndex: () => Promise<void>;
}

interface UseTagNotesDataResult {
  tag: Tag | null;
  loading: boolean;
  pageLoading: boolean;
  error: string | null;
  commentCounts: CommentCounts;
  handleSortChange: (newSortOrder: string) => void;
  handlePageChange: (newPage: number) => Promise<void>;
  handlePageSizeChange: (
    newPageSize: string | null
  ) => Promise<void>;
  handleRefresh: () => Promise<void>;
  handleDeleteNote: (
    evt: MouseEvent<HTMLButtonElement>,
    note: Note
  ) => Promise<void>;
  handleCountChange: (noteId: string, delta: number) => void;
}

/**
 * Loader/pagination orchestration for TagNotesRoute: the tag +
 * notes load effect (with stored-page restore and
 * re-run-safe page retention), comment counts, and the
 * sort/page/page-size/refresh/delete handlers that refetch.
 */
export const useTagNotesData = ({
  tagId,
  sortOrder,
  isUntagged,
  isAuthenticated,
  includeDescendants,
  setSearchParams,
  orderMenuEnabled,
  reloadOrderIndex,
}: UseTagNotesDataOptions): UseTagNotesDataResult => {
  const fetchNotes = useBibleStore((state) => state.fetchNotes);
  const getTags = useBibleStore((state) => state.getTags);
  const deleteNote = useBibleStore((state) => state.deleteNote);
  const setShowNotes = useBibleStore(
    (state) => state.setShowNotes
  );
  const setLastSelectedTagId = useBibleStore(
    (state) => state.setLastSelectedTagId
  );
  const notesPage = useBibleStore((state) => state.notesPage);
  const setNotesPageSize = useBibleStore(
    (state) => state.setNotesPageSize
  );

  const [tag, setTag] = useState<Tag | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] =
    useState<CommentCounts>({});

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
  // Once the first load completes, later effect re-runs (sort
  // change, auth hydration) use the in-place page spinner
  // instead of blanking the screen behind the full loader.
  const hasLoadedRef = useRef(false);

  // Set showNotes to true and save lastSelectedTagId when on
  // notes route.
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
        const queryKey =
          `${tagId}:${sortOrder}:${includeDescendants}`;
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
          includeDescendants,
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
            public: false,
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
        }
        hasLoadedRef.current = true;
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

    void loadTagAndNotes();

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
    includeDescendants,
  ]);

  // A sort change only rewrites the URL — the load effect
  // re-runs on `sortOrder` and issues the single refetch
  // (page 1 via the fresh queryKey). It used to also call
  // fetchNotes here, so every server-side sort fired twice.
  const handleSortChange = useCallback(
    (newSortOrder: string) => {
      if (!tagId) return;
      // Preserve the other params — a bare `{sort}` object
      // would silently drop `descendants=1`.
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('sort', newSortOrder);
        return next;
      });
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
          includeDescendants,
        });
      } finally {
        setPageLoading(false);
      }

      // Scroll to top of notes section
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [tagId, sortOrder, fetchNotes, includeDescendants]
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
          includeDescendants,
        });
      } finally {
        setPageLoading(false);
      }

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [
      tagId,
      sortOrder,
      setNotesPageSize,
      fetchNotes,
      includeDescendants,
    ]
  );

  const handleRefresh = useCallback(async () => {
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
        includeDescendants,
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
        await reloadOrderIndex();
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
  }, [
    tagId,
    sortOrder,
    notesPage,
    fetchNotes,
    getTags,
    isAuthenticated,
    includeDescendants,
    orderMenuEnabled,
    reloadOrderIndex,
  ]);

  const handleDeleteNote = useCallback(
    async (evt: MouseEvent<HTMLButtonElement>, note: Note) => {
      evt.preventDefault();
      if (!note.id || deletingRef.current) return;
      if (
        !window.confirm(
          'Are you sure you want to delete this note?'
        )
      ) {
        return;
      }
      deletingRef.current = true;
      try {
        try {
          // The store action drops the card from state as soon
          // as the DELETE resolves, so the list updates without
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
            includeDescendants,
          });
          // Resync badges/menu labels — the deleted note's
          // rank shifts every entry below it.
          if (orderMenuEnabled) {
            await reloadOrderIndex();
          }
        } catch {
          // fetchNotes already surfaced an error notification.
        } finally {
          if (emptied) setPageLoading(false);
        }
      } finally {
        deletingRef.current = false;
      }
    },
    [
      tagId,
      sortOrder,
      deleteNote,
      fetchNotes,
      includeDescendants,
      orderMenuEnabled,
      reloadOrderIndex,
    ]
  );

  const handleCountChange = useCallback(
    (noteId: string, delta: number) => {
      setCommentCounts((prev) => ({
        ...prev,
        [noteId]: (prev[noteId] ?? 0) + delta,
      }));
    },
    []
  );

  return {
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
  };
};
