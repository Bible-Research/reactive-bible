import { createWithEqualityFn } from 'zustand/traditional';
import { persist, createJSONStorage } from "zustand/middleware";
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
import { toBookName } from './utils/bibleUtils';
import {
  useAuthStore,
  registerBibleStore,
} from './stores/authStore';
import { createNotesSlice } from './stores/bibleStore/notesSlice';
import {
  migratePersistedState,
  partializeState,
} from './stores/bibleStore/persistence';

export { migratePersistedState, partializeState };

// Canonical definitions live in `./types`; aliased so existing
// `from '../store'` type imports keep working.
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
  /**
   * Transient (not persisted): the public note shown on
   * /notes/:id. Kept out of `notes` — that list is the tag
   * page's pagination state — but the share toolbar needs its
   * verses so folded-note shares carry the full text.
   */
  detailNote: Note | null;
  setDetailNote: (note: Note | null) => void;
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
  detailNote: null as Note | null,
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
  versesFolded: false,
  readingPositions: {} as Record<
    string,
    api.ReadingPositionValue | null
  >,
  pendingScrollVerse: null as VerseRef | null,
  headerVisible: true,
};

export const useBibleStore = createWithEqualityFn<BibleState>()(
  persist(
    (set, get, store) => ({
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
      // Notes orchestration (paged fetch/cache, reorder/move
      // with conflict refresh) lives in
      // stores/bibleStore/notesSlice.ts — one store, same state.
      ...createNotesSlice(set, get, store),
      setAudioActiveVerse: (audioActiveVerse) =>
        set({ audioActiveVerse }),
      setAudioPlaylistItems: (audioPlaylistItems) =>
        set({ audioPlaylistItems }),
      setAudioPlaylistStartIndex: (audioPlaylistStartIndex) =>
        set({ audioPlaylistStartIndex }),
      setDetailNote: (detailNote) => set({ detailNote }),
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
          // non-null entry always wins — it may have been written
          // by navigation while this request was in flight,
          // making it fresher than the remote snapshot. A remote
          // position still fills in over a local null (the local
          // null only meant "checked, empty" at fetch time).
          set((state) => {
            const merged = { ...state.readingPositions };
            for (const [bookId, pos] of Object.entries(
              positions
            )) {
              if (
                merged[bookId] === undefined ||
                (merged[bookId] === null && pos !== null)
              ) {
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
      version: 6,
      migrate: migratePersistedState,
      partialize: partializeState,
    }
  )
);

// Let authStore purge session-owned state (logout / token change)
// without it importing this module — that edge would make the
// store evaluate inside api's Vitest importOriginal window and
// bind the real api, breaking vi.mock('../api') interception.
registerBibleStore(useBibleStore);

/** Display name for the active book (e.g. "John"). */
export const selectActiveBookName = (state: BibleState): string =>
  toBookName(state.activeBookId) ?? state.activeBookId;
