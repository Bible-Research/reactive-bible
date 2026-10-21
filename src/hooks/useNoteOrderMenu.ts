import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getNoteOrderIndex } from '../api';
import { useBibleStore } from '../store';
import type {
  Note,
  NoteOrderIndexEntry,
  NoteOrderMenuData,
} from '../types';
import type { SortOrder } from '../utils/noteSorting';

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

interface UseNoteOrderMenuOptions {
  tagId: string | undefined;
  sortOrder: SortOrder;
  /**
   * The viewed tag belongs to the signed-in user — either it
   * appears in their tag list, or every loaded note reports
   * `is_owner === true`. Computed by the route.
   */
  isTagOwner: boolean;
  /**
   * The currently loaded page of notes — carries `is_owner`.
   */
  notes: Note[];
}

interface UseNoteOrderMenuResult {
  /** Whether reorder UI (drag + order badges/menus) may show. */
  enabled: boolean;
  /** Shared `NoteOrderMenu` data; undefined while disabled or
   *  before the order index resolves. */
  orderMenu: NoteOrderMenuData | undefined;
  /** Refetch the order index (after moves, deletes, refresh). */
  reloadOrderIndex: () => Promise<void>;
  /** dnd-kit bulk reorder — writes through the store action. */
  handleReorder: (
    tagId: string,
    noteIds: string[],
    currentPage: number,
    pageSize: number
  ) => Promise<void>;
}

/**
 * Order-badge/dropdown orchestration for TagNotesRoute: the
 * compact order index, canonical order IDs, pre-labeled menu
 * entries, and the move/reorder handlers that write through
 * the store then resync the index.
 */
export const useNoteOrderMenu = ({
  tagId,
  sortOrder,
  isTagOwner,
  notes,
}: UseNoteOrderMenuOptions): UseNoteOrderMenuResult => {
  const moveNoteAfter = useBibleStore(
    (state) => state.moveNoteAfter
  );
  const reorderNotes = useBibleStore(
    (state) => state.reorderNotes
  );

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

  // The order badge/menu is gated exactly like `isDraggable`:
  // custom sort + owner. `isTagOwner` is resolved by the
  // route: the tag appears in the user's own tag list, or
  // every loaded note reports `is_owner === true`. The loaded
  // page gets a second, harder check — a note that explicitly
  // reports `is_owner === false` vetoes reorder even on a tag
  // in the user's list, since the backend move/reorder
  // endpoints only touch the requester's own rows (foreign
  // anchors 400, foreign positions 409). `!== false` keeps
  // reorder enabled when a payload omits the field entirely.
  const enabled =
    (sortOrder === 'custom_asc' || sortOrder === 'custom_desc') &&
    isTagOwner &&
    notes.every((n) => n.is_owner !== false);

  const reloadOrderIndex = useCallback(async () => {
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
    if (enabled) {
      reloadOrderIndex();
    } else {
      // Invalidate any in-flight fetch before clearing.
      orderIndexRequestRef.current += 1;
      setOrderIndex(null);
    }
  }, [enabled, reloadOrderIndex]);

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
        await reloadOrderIndex();
      }
    },
    [tagId, sortOrder, moveNoteAfter, reloadOrderIndex]
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
        await reloadOrderIndex();
      }
    },
    [
      tagId,
      sortOrder,
      orderIndex,
      moveNoteAfter,
      reloadOrderIndex,
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
        await reloadOrderIndex();
      }
    },
    [reorderNotes, reloadOrderIndex]
  );

  const orderMenu = useMemo(
    () =>
      enabled && orderIndex
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
      enabled,
      orderIndex,
      orderIdByNoteId,
      sortOrder,
      handleMoveAfter,
      handleMoveToTop,
    ]
  );

  return {
    enabled,
    orderMenu,
    reloadOrderIndex,
    handleReorder,
  };
};
