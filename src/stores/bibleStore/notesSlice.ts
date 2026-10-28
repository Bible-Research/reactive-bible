import type { StateCreator } from 'zustand';
import { showNotification } from '@mantine/notifications';
import * as api from '../../api';
import type { Note, Tag, Translation } from '../../types';
import {
  findTextOption,
  resolveTextFileset,
} from '../../utils/filesetGroups';
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

/**
 * Resolves the stored text selection to the fileset id sent as
 * `fileset_id` on notes requests. A testament-split product
 * (different OT/NT member filesets, e.g. `*_ET` pairs) has no
 * single fileset that can serve every note's verses — resolving
 * against the *viewed* book would hand the backend an id that
 * cannot serve cross-testament notes — so the param is omitted
 * and the server falls back to its default fileset.
 */
const resolveNotesFilesetId = (
  storedId: string | null,
  bookId: string,
  translations: Translation[]
): string | undefined => {
  if (!storedId) return undefined;
  const found = findTextOption(storedId, translations);
  if (found) {
    const { OT, NT } = found.option.byTestament;
    const otId = OT ? Object.values(OT)[0] : undefined;
    const ntId = NT ? Object.values(NT)[0] : undefined;
    if (otId && ntId && otId !== ntId) return undefined;
  }
  return resolveTextFileset(storedId, bookId, translations)
    ?? storedId;
};

/**
 * True when `tagId` belongs to the current user: authenticated
 * AND either the tag is in the user's own tag list, or fetched
 * notes carry `is_owner === true` for it. The tag-list branch
 * covers production, where notes do not send `is_owner` yet;
 * the `is_owner` branch keeps foreign public tags read-only
 * once the backend ships the field. `lastSelectedTagId` must
 * not be hijacked by browsing someone else's public tag.
 */
const isOwnedTag = (
  tagId: string,
  notes: Note[],
  tags: Tag[]
): boolean => {
  if (!useAuthStore.getState().isAuthenticated) return false;
  return (
    tags.some((t) => t.id === tagId) ||
    notes.some((n) => n.tag?.id === tagId && n.is_owner === true)
  );
};

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
      const {
        ordering,
        page = 1,
        append = false,
        includeDescendants = false,
      } = options;
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
        // before sending it as `fileset_id`. Testament-split
        // products yield undefined (see resolveNotesFilesetId).
        const filesetId = resolveNotesFilesetId(
          activeTextFilesetId,
          activeBookId,
          translations,
        );

        // The cache key scope mirrors exactly what shapes the
        // response: the fileset fills verse text, pageSize
        // shapes page membership, and auth decides visibility
        // of private notes. Residual edge: a token that is
        // present but expired marks the scope `authed: true`
        // even though publicFetch's anonymous retry fills the
        // entry with the anonymous payload — logout clears the
        // cache, so the stale view only lasts until then.
        const notesScope = {
          filesetId,
          pageSize: notesPageSize,
          authed: Boolean(useAuthStore.getState().token),
          // Merged subtree pages must never collide with the
          // tag's direct-only pages under the same key.
          includeDescendants,
        };

        // Check cache for any page/ordering combination —
        // but never for anonymous visitors: the localStorage
        // cache may hold private notes from a previous
        // session on this device. (`token` is the
        // synchronously rehydrated anonymous check;
        // `isAuthenticated` lags until App's mount checkAuth
        // runs, so gating on it would miss the cache on
        // every cold load.)
        if (!append && tagId && useAuthStore.getState().token) {
          const cachedData = getCachedNotes(
            tagId,
            page,
            ordering,
            notesScope,
          );
          if (cachedData) {
            set((state) => ({
              notes: cachedData.notes,
              notesCount:
                cachedData.count ?? cachedData.notes.length,
              notesPage: page,
              notesHasMore: cachedData.hasMore ?? false,
              notesOrdering: ordering || null,
              // Remember the selection only for the user's own
              // tags — a foreign public tag must not hijack the
              // next /notes visit.
              lastSelectedTagId: isOwnedTag(
                tagId, cachedData.notes, state.tags
              )
                ? tagId
                : state.lastSelectedTagId,
            }));
            return;
          }
        }

        const response = await api.getNotes(tagId, {
          ordering,
          page,
          pageSize: notesPageSize,
          filesetId,
          includeDescendants,
        });

        // Cache all page results — but only for authed
        // sessions; anonymous reads skip the cache entirely
        // so writing entries for it would be dead weight.
        if (tagId && useAuthStore.getState().token) {
          cacheNotes(tagId, response.results, {
            count: response.count,
            hasMore: response.next !== null,
            page,
            ordering,
            filesetId,
            pageSize: notesPageSize,
            authed: notesScope.authed,
            includeDescendants,
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
          // Browsing a foreign public tag must not rewrite the
          // remembered own-tag selection.
          lastSelectedTagId: tagId
            ? (isOwnedTag(tagId, response.results, state.tags)
                ? tagId
                : state.lastSelectedTagId)
            : null,
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
            includeDescendants,
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
      // them, and never hit the authed endpoint — it requires
      // auth, so an anonymous call would only 401.
      // `token` is the synchronous anonymous check —
      // `isAuthenticated` lags until checkAuth runs, and
      // NotesRoute legitimately calls getTags before that on a
      // cold /notes load.
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

        // The dense integers we sent are interim: the server
        // may rebalance to float positions, and cached pages
        // still hold the pre-reorder order (api.reorderNotes
        // already invalidated them). Refresh so the visible
        // positions are the server's authoritative ones.
        // Best-effort — fetchNotes notifies on its own failure.
        await refreshNotesPage(tagId).catch(() => {
          /* fetchNotes already notified the failure */
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
