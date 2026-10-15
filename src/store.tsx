import { createWithEqualityFn } from 'zustand/traditional';
import { persist, createJSONStorage } from "zustand/middleware";
import { showNotification } from "@mantine/notifications";
import * as api from './api';
import {
  Note,
  Tag,
  PlaylistItem,
  AudioActiveVerse,
  VerseRef,
  VerseScope,
  VerseSelection,
} from './types';
import { refsInclude, sameRef } from './utils/verseRefs';
import {
  toBookName,
  toUsfmCode,
} from './utils/bibleUtils';
import { resolveTextFileset } from './utils/filesetGroups';
import {
  getCachedNotes,
  cacheNotes,
  clearNotesCache,
} from './utils/cacheManager';
import { useAuthStore } from './stores/authStore';

// Canonical definitions live in `./types`; aliased (not
// specifier re-exports — eslint-plugin-react-refresh@0.3
// counts `export type { X }` names as component exports) so
// existing `from '../store'` type imports keep working.
export type Fileset = import('./types').Fileset;
export type Translation = import('./types').Translation;

export interface BibleState {
  /** USFM book code (e.g. "JHN") — canonical passage identity. */
  activeBookId: string;
  activeChapter: number;
  verseSelection: VerseSelection | null;
  bibleVersion: string;
  showAudioPlayer: boolean;
  translations: Translation[];
  activeTextFilesetId: string | null;
  activeAudioFilesetId: string | null;
  tags: Tag[];
  notes: Note[];
  allNotesFetched: boolean;
  showNotes: boolean;
  lastSelectedTagId: string | null;
  notesCount: number;
  notesPage: number;
  notesPageSize: number;
  notesHasMore: boolean;
  notesOrdering: string | null;
  audioActiveVerse: AudioActiveVerse | null;
  setAudioActiveVerse: (verse: AudioActiveVerse | null) => void;
  audioPlaylistItems: PlaylistItem[] | null;
  setAudioPlaylistItems: (items: PlaylistItem[] | null) => void;
  audioPlaylistStartIndex: number | null;
  setAudioPlaylistStartIndex: (index: number | null) => void;
  audioPlaylistEnded: boolean;
  setAudioPlaylistEnded: (ended: boolean) => void;
  versesFolded: boolean;
  setVersesFolded: (folded: boolean) => void;
  /**
   * Saved position per USFM book id. A missing key means the
   * position was never fetched; a null value means it was fetched
   * and the user has no saved position for that book.
   */
  readingPositions: Record<
    string,
    api.ReadingPositionValue | null
  >;
  /**
   * Transient (not persisted): after switching books, the verse
   * PassageView should scroll to once the chapter loads.
   */
  pendingScrollVerse: VerseRef | null;
  setPendingScrollVerse: (ref: VerseRef | null) => void;
  /**
   * Transient (not persisted): whether the top header is shown.
   * MyHeader hides it on a deliberate downward scroll; the
   * AppShell collapses the reserved padding in sync so the
   * passage reclaims the freed space.
   */
  headerVisible: boolean;
  setHeaderVisible: (visible: boolean) => void;
  setActiveBookAndChapter: (
    activeBookId: string,
    activeChapter: number
  ) => void;
  setActiveChapter: (activeChapter: number) => void;
  setVerseSelection: (selection: VerseSelection | null) => void;
  toggleVerseRef: (scope: VerseScope, ref: VerseRef) => void;
  selectVerseRange: (
    scope: VerseScope,
    refA: VerseRef,
    refB: VerseRef
  ) => void;
  setBibleVersion: (bibleVersion: string) => void;
  setShowAudioPlayer: (show: boolean) => void;
  setTranslations: (translations: Translation[]) => void;
  setActiveTextFilesetId: (id: string | null) => void;
  setActiveAudioFilesetId: (id: string | null) => void;
  fetchNotes: (
    tagId?: string,
    options?: {
      ordering?: string;
      page?: number;
      append?: boolean;
    }
  ) => Promise<void>;
  getTags: (forceRefresh?: boolean) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  reorderNotes: (
    tagId: string,
    noteIds: string[],
    currentPage: number,
    pageSize: number
  ) => Promise<void>;
  moveNoteAfter: (
    tagId: string,
    noteId: string,
    targetNoteId: string,
    placement: api.MovePlacement
  ) => Promise<void>;
  setShowNotes: (show: boolean) => void;
  setLastSelectedTagId: (tagId: string | null) => void;
  setNotesPage: (page: number) => void;
  setNotesPageSize: (pageSize: number) => void;
  setActiveBookWithPosition: (
    activeBookId: string
  ) => Promise<void>;
  syncReadingPosition: (
    bookId: string,
    chapter: number,
    verse?: number
  ) => void;
  prefetchReadingPositions: () => Promise<void>;
}

// Define and export the initial state for reusability and testing
export const initialState = {
  activeBookId: "JHN",
  activeChapter: 1,
  verseSelection: null as VerseSelection | null,
  bibleVersion: "KJV",
  showAudioPlayer: false,
  translations: [],
  activeTextFilesetId: "ENGESV_API",
  activeAudioFilesetId: "ENGESV_API",
  tags: [] as Tag[],
  notes: [] as Note[],
  allNotesFetched: false,
  showNotes: false,
  lastSelectedTagId: null,
  notesCount: 0,
  notesPage: 1,
  notesPageSize: 25,
  notesHasMore: false,
  notesOrdering: null,
  audioActiveVerse: null as AudioActiveVerse | null,
  audioPlaylistItems: null as PlaylistItem[] | null,
  audioPlaylistStartIndex: null as number | null,
  audioPlaylistEnded: false,
  versesFolded: false,
  readingPositions: {} as Record<
    string,
    api.ReadingPositionValue | null
  >,
  pendingScrollVerse: null as VerseRef | null,
  headerVisible: true,
};

const partializeState = (state: BibleState) => ({
  activeBookId: state.activeBookId,
  activeChapter: state.activeChapter,
  verseSelection: state.verseSelection,
  bibleVersion: state.bibleVersion,
  translations: state.translations,
  activeTextFilesetId: state.activeTextFilesetId,
  activeAudioFilesetId: state.activeAudioFilesetId,
  lastSelectedTagId: state.lastSelectedTagId,
  audioActiveVerse: state.audioActiveVerse,
  notes: state.notes,
  tags: state.tags,
  notesPage: state.notesPage,
  notesPageSize: state.notesPageSize,
  readingPositions: state.readingPositions,
  // showAudioPlayer is NOT persisted
  // pendingScrollVerse is NOT persisted
  // headerVisible is NOT persisted
});

type PersistedBibleState = ReturnType<typeof partializeState>;

/** Resolves a persisted book name or code to a USFM code. */
const migrateBookId = (book: unknown): string =>
  typeof book === 'string'
    ? toUsfmCode(book) ?? 'JHN'
    : 'JHN';

/** Converts a persisted ref ({book} or {bookId}) to bookId form. */
const migrateRef = (ref: Record<string, unknown>): VerseRef => ({
  bookId:
    typeof ref.bookId === 'string'
      ? ref.bookId
      : migrateBookId(ref.book),
  chapter:
    typeof ref.chapter === 'number' ? ref.chapter : 1,
  verse:
    typeof ref.verse === 'number' ? ref.verse : 1,
});

/**
 * Migrates persisted state across versions:
 * - pre-v2: the old bare `activeVerses: number[]` becomes a
 *   'bible'-scoped VerseSelection built from the persisted
 *   book/chapter; `selectedVerses` is dropped entirely.
 * - pre-v3: `activeBook`/`activeBookShort` (display names) become
 *   `activeBookId` (USFM code); VerseRef/audio refs gain bookId.
 * - pre-v4: `notesPage`/`notesPageSize` are newly persisted;
 *   absent values fall back to defaults, no migration needed.
 * - pre-v5: `readingPositions` is introduced; any pre-existing
 *   value is sanitized and name-keyed entries are re-keyed to
 *   USFM codes.
 */
export const migratePersistedState = (
  persistedState: unknown,
  version: number,
): PersistedBibleState => {
  let migrated = (persistedState ?? {}) as Record<string, unknown>;

  if (version < 2) {
    const oldVerses = Array.isArray(migrated.activeVerses)
      ? (migrated.activeVerses as unknown[]).filter(
          (v): v is number => typeof v === 'number'
        )
      : [];
    const refs: VerseRef[] = oldVerses.map((v) => ({
      bookId: migrateBookId(migrated.activeBook),
      chapter:
        typeof migrated.activeChapter === 'number'
          ? migrated.activeChapter
          : 1,
      verse: v,
    }));
    migrated = {
      ...migrated,
      verseSelection:
        refs.length > 0 ? { scope: 'bible', refs } : null,
    };
    delete migrated.activeVerses;
    delete migrated.selectedVerses;
  }

  if (version < 3) {
    const selection = migrated.verseSelection as
      | { scope: string; refs: Record<string, unknown>[] }
      | null;
    const aav = migrated.audioActiveVerse as
      | Record<string, unknown>
      | null;
    migrated = {
      ...migrated,
      activeBookId:
        typeof migrated.activeBookId === 'string'
          ? migrated.activeBookId
          : migrateBookId(migrated.activeBook),
      verseSelection: selection
        ? {
            scope: selection.scope,
            refs: selection.refs.map(migrateRef),
          }
        : null,
      audioActiveVerse: aav
        ? { ...migrateRef(aav), scope: aav.scope }
        : null,
    };
    delete migrated.activeBook;
    delete migrated.activeBookShort;
  }

  if (version < 5) {
    const raw = migrated.readingPositions;
    const positions: Record<
      string,
      api.ReadingPositionValue | null
    > = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw)) {
        // Keys may be USFM codes or legacy book names.
        const bookId = toUsfmCode(key);
        if (!bookId) continue;
        const entry = value as {
          chapter?: unknown;
          verse?: unknown;
        } | null;
        positions[bookId] =
          entry !== null &&
          typeof entry === 'object' &&
          typeof entry.chapter === 'number' &&
          typeof entry.verse === 'number'
            ? { chapter: entry.chapter, verse: entry.verse }
            : null;
      }
    }
    migrated = { ...migrated, readingPositions: positions };
  }

  return migrated as PersistedBibleState;
};

/**
 * Latest-call-wins guard for `fetchNotes`: rapid moves, or a
 * move-refresh racing a page change, can resolve out of order.
 * Only the most recently issued request may write `notes`.
 */
let fetchNotesRequestSeq = 0;

/**
 * Refetches the tag's current page preserving ordering+page so
 * page membership is re-derived from the server — a cross-page
 * move changes which notes are visible, and a stale page would
 * let a later drag reassign sequential positions that silently
 * undo the move.
 */
const refreshNotesPage = async (tagId: string): Promise<void> => {
  const { notesOrdering, notesPage } = useBibleStore.getState();
  clearNotesCache(tagId);
  await useBibleStore.getState().fetchNotes(tagId, {
    ordering: notesOrdering ?? undefined,
    page: notesPage,
  });
};

export const useBibleStore = createWithEqualityFn<BibleState>()(
  persist(
    (set) => ({
      ...initialState,
      setActiveBookAndChapter: (activeBookId, activeChapter) =>
        set({
          activeBookId,
          activeChapter,
          verseSelection: null,
        }),
      setActiveChapter: (activeChapter) => set({
        activeChapter,
        verseSelection: null,
      }),
      setVerseSelection: (verseSelection) => set({ verseSelection }),
      toggleVerseRef: (scope, ref) =>
        set((state) => {
          const current =
            state.verseSelection?.scope === scope
              ? state.verseSelection.refs
              : [];
          const next = refsInclude(current, ref)
            ? current.filter((r) => !sameRef(r, ref))
            : [...current, ref];
          return {
            verseSelection:
              next.length > 0 ? { scope, refs: next } : null,
          };
        }),
      selectVerseRange: (scope, refA, refB) =>
        set((state) => {
          // Range selection is constrained to a single book/chapter.
          if (
            refA.bookId !== refB.bookId ||
            refA.chapter !== refB.chapter
          ) {
            return { verseSelection: { scope, refs: [refB] } };
          }
          const start = Math.min(refA.verse, refB.verse);
          const end = Math.max(refA.verse, refB.verse);
          const rangeRefs: VerseRef[] = [];
          for (let v = start; v <= end; v++) {
            rangeRefs.push({
              bookId: refA.bookId,
              chapter: refA.chapter,
              verse: v,
            });
          }
          const merged =
            state.verseSelection?.scope === scope
              ? [...state.verseSelection.refs]
              : [];
          for (const r of rangeRefs) {
            if (!refsInclude(merged, r)) merged.push(r);
          }
          return { verseSelection: { scope, refs: merged } };
        }),
      setBibleVersion: (bibleVersion) => set({ bibleVersion }),
      setShowAudioPlayer: (showAudioPlayer) => set({ showAudioPlayer }),
      setTranslations: (translations) => set({ translations }),
      setActiveTextFilesetId: (activeTextFilesetId) =>
        set({ activeTextFilesetId }),
      setActiveAudioFilesetId: (activeAudioFilesetId) =>
        set({ activeAudioFilesetId }),
      fetchNotes: async (tagId?: string, options = {}) => {
        const { ordering, page = 1, append = false } = options;
        const requestId = ++fetchNotesRequestSeq;
        try {
          const {
            notesPageSize,
            activeTextFilesetId,
            activeBookId,
            translations,
          } = useBibleStore.getState();

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
              console.log(
                `✅ Using cached notes for tag: ${tagId} ` +
                `(page ${page}, ordering: ${ordering || 'default'}, ` +
                `${cachedData.notes.length} notes, ` +
                `total: ${cachedData.count ?? 'unknown'})`
              );
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
          
          // Fetch from API
          console.log(
            `📝 Fetching notes from API for tag: ` +
            `${tagId || 'all'} ` +
            `(page ${page}, ordering: ${ordering || 'default'}, ` +
            `fileset: ${filesetId || 'default'})`
          );

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
            await useBibleStore.getState().fetchNotes(tagId, {
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
          if (useBibleStore.getState().tags.length > 0) {
            set({ tags: [] });
          }
          return;
        }
        // Use cached tags unless force refresh
        const currentTags = useBibleStore.getState().tags;
        if (!forceRefresh && currentTags.length > 0) {
          console.log(
            `✅ Using cached tags ` +
            `(${currentTags.length} tags) - no API call`
          );
          return;
        }

        // Fetch from API
        console.log('📝 Fetching tags from API');
        try {
          const tags = await api.getTags();
          set({ tags });
          console.log(`✅ Tags fetched successfully (${tags.length} tags)`);
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
      setAudioActiveVerse: (audioActiveVerse) =>
        set({ audioActiveVerse }),
      setAudioPlaylistItems: (audioPlaylistItems) =>
        set({ audioPlaylistItems }),
      setAudioPlaylistStartIndex: (audioPlaylistStartIndex) =>
        set({ audioPlaylistStartIndex }),
      setAudioPlaylistEnded: (audioPlaylistEnded) =>
        set({ audioPlaylistEnded }),
      setVersesFolded: (versesFolded) => set({ versesFolded }),
      setPendingScrollVerse: (pendingScrollVerse) =>
        set({ pendingScrollVerse }),
      setHeaderVisible: (headerVisible) => set({ headerVisible }),
      setActiveBookWithPosition: async (activeBookId) => {
        const cached =
          useBibleStore.getState().readingPositions[activeBookId];
        // undefined = never fetched; null = fetched, nothing saved
        let position = cached as
          | api.ReadingPositionValue
          | null
          | undefined;
        if (
          position === undefined &&
          useAuthStore.getState().isAuthenticated &&
          (typeof navigator === 'undefined' || navigator.onLine)
        ) {
          try {
            const apiPosition =
              await api.getReadingPosition(activeBookId);
            const entry: api.ReadingPositionValue | null =
              apiPosition
                ? {
                    chapter: apiPosition.chapter,
                    verse: apiPosition.verse,
                  }
                : null;
            position = entry;
            set((state) => ({
              readingPositions: {
                ...state.readingPositions,
                [activeBookId]: entry,
              },
            }));
          } catch {
            // A failed lookup stays `undefined` — never cached
            // as "no position", so the next book click retries
            // instead of permanently landing on chapter 1.
          }
        }
        const chapter = position?.chapter ?? 1;
        const verse = position?.verse ?? 1;
        // Clear verseSelection: restoring a position must not
        // select a verse or pop up the VerseActionToolbar.
        set({
          activeBookId,
          activeChapter: chapter,
          verseSelection: null,
          audioActiveVerse: null,
          pendingScrollVerse:
            verse > 1
              ? { bookId: activeBookId, chapter, verse }
              : null,
        });
      },
      syncReadingPosition: (bookId, chapter, verse = 1) => {
        set((state) => ({
          readingPositions: {
            ...state.readingPositions,
            [bookId]: { chapter, verse },
          },
        }));
        // Anonymous sessions must not hit the API: session auth
        // would land them in a shared auto-provisioned account.
        if (useAuthStore.getState().isAuthenticated) {
          api.updateReadingPosition(bookId, chapter, verse);
        }
      },
      prefetchReadingPositions: async () => {
        if (!useAuthStore.getState().isAuthenticated) return;
        try {
          const bookIds = api.getBooks().map((b) => b.book_id);
          const positions =
            await api.getBulkReadingPositions(bookIds);
          // Keep explicit nulls: they mark books as checked so
          // they are not refetched on every book click. A local
          // non-null entry wins over a remote null (offline reads).
          set((state) => {
            const merged = { ...state.readingPositions };
            for (const [bookId, pos] of Object.entries(
              positions
            )) {
              if (merged[bookId] === undefined || pos !== null) {
                merged[bookId] = pos;
              }
            }
            return { readingPositions: merged };
          });
        } catch (error) {
          console.error(
            'Error prefetching reading positions:',
            error
          );
        }
      },
    }),
    {
      name: "bible-storage",
      storage: createJSONStorage(() => localStorage),
      version: 5,
      migrate: migratePersistedState,
      partialize: partializeState,
    }
  )
);

/** Display name for the active book (e.g. "John"). */
export const selectActiveBookName = (state: BibleState): string =>
  toBookName(state.activeBookId) ?? state.activeBookId;
