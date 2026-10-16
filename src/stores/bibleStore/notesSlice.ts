import type { StateCreator } from 'zustand';
import { showNotification } from '@mantine/notifications';
import * as api from '../../api';
import type { Note } from '../../types';
import { resolveTextFileset } from '../../utils/filesetGroups';
import {
  getCachedNotes,
  cacheNotes,
  clearNotesCache,
} from '../../utils/cacheManager';
import { useAuthStore } from '../authStore';
import type { BibleState } from '../../store';

/**
 * Notes-domain slice of the bible store: the paged tag/notes
 * orchestration (latest-call-wins fetch, localStorage page
 * cache, reorder/move with conflict refresh) plus the notes
 * setters. Moved verbatim out of `store.ts` — the only
 * adaptation is `useBibleStore.getState()` → the slice's own
 * `get()` so this module never imports the store it belongs to.
 */
type NotesActions = Pick<
  BibleState,
  | 'fetchNotes'
  | 'getTags'
  | 'deleteNote'
  | 'reorderNotes'
  | 'moveNoteAfter'
  | 'setShowNotes'
  | 'setLastSelectedTagId'
  | 'setNotesPage'
  | 'setNotesPageSize'
>;

/**
 * Latest-call-wins guard for `fetchNotes`: rapid moves, or a
 * move-refresh racing a page change, can resolve out of order.
 * Only the most recently issued request may write `notes`.
 */
let fetchNotesRequestSeq = 0;

export const createNotesSlice: StateCreator<
  BibleState,
  [],
  [],
  NotesActions
> = (set, get) => {
  /**
   * Refetches the tag's current page preserving ordering+page
   * so page membership is re-derived from the server — a
   * cross-page move changes which notes are visible, and a
   * stale page would let a later drag reassign sequential
   * positions that silently undo the move.
   */
  const refreshNotesPage = async (tagId: string): Promise<void> => {
    const { notesOrdering, notesPage } = get();
    clearNotesCache(tagId);
    await get().fetchNotes(tagId, {
      ordering: notesOrdering ?? undefined,
      page: notesPage,
    });
  };

  return {
    fetchNotes: async (tagId?: string, options = {}) => {
      const { ordering, page = 1, append = false } = options;
      const requestId = ++fetchNotesRequestSeq;
      try {
        const {
          notesPageSize,
          activeTextFilesetId,
          activeBookId,
          translations,
        } = get();

        // The stored id may be a grouped product id
        // (`{abbr}:text:n`) — resolve to a concrete fileset
        // before sending it as `fileset_id`.
        const filesetId = activeTextFilesetId
          ? resolveTextFileset(
              activeTextFilesetId,
              activeBookId,
              translations,
            ) ?? activeTextFilesetId
          : undefined;

        // Check cache for any page/ordering combination —
        // but never for anonymous visitors: the localStorage
        // cache may hold private notes from a previous
        // session on this device. (`token` is the
        // synchronously rehydrated anonymous check;
        // `isAuthenticated` lags until App's mount checkAuth
        // runs, so gating on it would miss the cache on
        // every cold load.)
        if (!append && tagId && useAuthStore.getState().token) {
          const cachedData = getCachedNotes(tagId, page, ordering);
          if (cachedData) {
            set({
              notes: cachedData.notes,
              notesCount: cachedData.count ?? cachedData.notes.length,
              notesPage: page,
              notesHasMore: cachedData.hasMore ?? false,
              notesOrdering: ordering || null,
              lastSelectedTagId: tagId,
            });
            return;
          }
        }

        const response = await api.getNotes(tagId, {
          ordering,
          page,
          pageSize: notesPageSize,
          filesetId,
        });

        // Cache all page results
        if (tagId) {
          cacheNotes(tagId, response.results, {
            count: response.count,
            hasMore: response.next !== null,
            page,
            ordering,
          });
        }

        // A response resolving after a newer fetchNotes call
        // was issued is stale — drop it rather than resurrect
        // an older page/order on top of the current one.
        if (requestId !== fetchNotesRequestSeq) return;

        set((state) => ({
          notes: append
            ? [...state.notes, ...response.results]
            : response.results,
          notesCount: response.count,
          notesPage: page,
          notesHasMore: response.next !== null,
          notesOrdering: ordering || null,
          allNotesFetched: !tagId && !response.next,
          lastSelectedTagId: tagId || null,
        }));
      } catch (error) {
        // A superseded request owns no state: no retry and
        // no error toast — the newer request decides the UI.
        if (requestId !== fetchNotesRequestSeq) return;
        if (page > 1) {
          // The requested page may no longer exist (e.g. notes
          // were deleted); fall back to the first page.
          await get().fetchNotes(tagId, {
            ordering,
            page: 1,
            append,
          });
          return;
        }
        console.error('Error fetching notes:', error);
        showNotification({
          title: 'Error',
          message: 'Failed to load notes. Please try again.',
          color: 'red',
        });
        throw error;
      }
    },
    getTags: async (forceRefresh = false) => {
      // Anonymous sessions own no tags. Drop any persisted
      // leftovers from a previous session instead of serving
      // them, and never hit the authed endpoint (which would
      // 401 and trip the "session expired" logout for a user
      // who was never logged in). `token` is the synchronous
      // anonymous check — `isAuthenticated` lags until
      // checkAuth runs, and NotesRoute legitimately calls
      // getTags before that on a cold /notes load.
      if (!useAuthStore.getState().token) {
        if (get().tags.length > 0) {
          set({ tags: [] });
        }
        return;
      }
      // Use cached tags unless force refresh
      const currentTags = get().tags;
      if (!forceRefresh && currentTags.length > 0) {
        return;
      }

      try {
        const tags = await api.getTags();
        set({ tags });
      } catch (error) {
        console.error('Error fetching tags:', error);
        showNotification({
          title: 'Error',
          message: 'Failed to load tags. Please try again.',
          color: 'red',
        });
        throw error;
      }
    },
    deleteNote: async (noteId: string) => {
      try {
        await api.deleteNote(noteId);
        // Clear all notes cache since we don't know which
        // tag this note belonged to
        clearNotesCache();
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== noteId),
          notesCount: state.notes.some((n) => n.id === noteId)
            ? Math.max(0, state.notesCount - 1)
            : state.notesCount,
        }));
        showNotification({
          title: 'Success',
          message: 'Note deleted successfully',
          color: 'green',
        });
      } catch (error) {
        console.error('Error deleting note:', error);
        showNotification({
          title: 'Error',
          message: 'Failed to delete note. Please try again.',
          color: 'red',
        });
        throw error;
      }
    },
    reorderNotes: async (
      tagId: string,
      noteIds: string[],
      currentPage: number,
      pageSize: number
    ) => {
      try {
        // Calculate the starting position based on current page
        // Page 1: positions 1-25, Page 2: positions 26-50, etc.
        const startPosition = (currentPage - 1) * pageSize;

        // Build updates with positions relative to the page
        const updates = noteIds.map((id, index) => ({
          note_id: id,
          position: startPosition + index + 1,
        }));

        await api.reorderNotes(tagId, updates);

        // Update local state to reflect new order
        set((state) => {
          const ordered = noteIds
            .map((id, i) => {
              const note = state.notes.find((n) => n.id === id);
              return note
                ? { ...note, tag_position: startPosition + i + 1 }
                : null;
            })
            .filter(Boolean) as Note[];
          const rest = state.notes.filter(
            (n) => !noteIds.includes(n.id),
          );
          return { notes: [...ordered, ...rest] };
        });

        showNotification({
          title: 'Success',
          message: 'Notes reordered',
          color: 'green',
        });
      } catch (error) {
        if (error instanceof api.ConflictError) {
          showNotification({
            title: 'Conflict',
            message: (
              'Another user modified these notes. ' +
              'Refreshing...'
            ),
            color: 'orange',
          });
          // Refresh the page the user is on — a bare
          // fetchNotes(tagId) would bounce to page 1 and
          // null notesOrdering, corrupting a later move's
          // refreshCurrentPage arguments. Best-effort: a
          // refresh failure must not mask the ConflictError.
          await refreshNotesPage(tagId).catch(() => {
            /* fetchNotes already notified the failure */
          });
        } else {
          showNotification({
            title: 'Error',
            message: 'Failed to reorder notes',
            color: 'red',
          });
        }
        throw error;
      }
    },
    moveNoteAfter: async (
      tagId: string,
      noteId: string,
      targetNoteId: string,
      placement: api.MovePlacement
    ) => {
      try {
        const result = await api.moveNote(
          tagId,
          noteId,
          targetNoteId,
          placement
        );

        if (!result.rebalanced) {
          // Instant feedback: patch the moved note's
          // position locally while the authoritative
          // refetch below resolves. A rebalance renumbers
          // every position, so skip the patch then.
          set((state) => ({
            notes: state.notes.map((n) =>
              n.id === noteId
                ? { ...n, tag_position: result.tag_position }
                : n
            ),
          }));
        }
        // Every move can change page membership, so the
        // server refetch — not the local patch — is
        // authoritative. It is isolated: a refresh failure
        // must not flip this into the 'Failed to move' path
        // (the move succeeded; fetchNotes already shows its
        // own error notification).
        await refreshNotesPage(tagId).catch(() => {
          /* fetchNotes already notified the failure */
        });

        showNotification({
          title: 'Success',
          message: 'Note moved',
          color: 'green',
        });
      } catch (error) {
        if (error instanceof api.ConflictError) {
          showNotification({
            title: 'Conflict',
            message: (
              'Another user modified these notes. ' +
              'Refreshing...'
            ),
            color: 'orange',
          });
          // Best-effort resync — a refresh failure must not
          // mask the original ConflictError.
          await refreshNotesPage(tagId).catch(() => {
            /* fetchNotes already notified the failure */
          });
        } else {
          showNotification({
            title: 'Error',
            message: 'Failed to move note',
            color: 'red',
          });
        }
        throw error;
      }
    },
    setShowNotes: (showNotes) => set({ showNotes }),
    setLastSelectedTagId: (lastSelectedTagId) =>
      set({ lastSelectedTagId }),
    setNotesPage: (page) => set({ notesPage: page }),
    setNotesPageSize: (pageSize) => set({ notesPageSize: pageSize }),
  };
};
