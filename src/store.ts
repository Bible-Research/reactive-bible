import { createWithEqualityFn } from 'zustand/traditional';
import { persist, createJSONStorage } from "zustand/middleware";
import * as api from './api';
import {
  Note,
  Tag,
  TagPagination,
  PlaylistItem,
  AudioActiveVerse,
  LastLanguageSelection,
  VerseRef,
  VerseScope,
  VerseSelection,
} from './types';
import { refsInclude, sameRef } from './utils/verseRefs';
import { localizedBookName } from './utils/bibleUtils';
import {
  useAuthStore,
  registerBibleStore,
} from './stores/authStore';
import { createNotesSlice } from './stores/bibleStore/notesSlice';
import { createStructureSlice } from './stores/bibleStore/structureSlice';
import {
  migratePersistedState,
  partializeState,
} from './stores/bibleStore/persistence';
import i18n, {
  changeUiLanguage,
  resolveInitialTextFileset,
  resolveUiLanguage,
  type UiLanguage,
} from './i18n';
import { showNotification } from '@mantine/notifications';
import * as Sentry from '@sentry/react';
import { captureHandledError } from './utils/errorReporter';

export { migratePersistedState, partializeState };

// Canonical definitions live in `./types`; aliased so existing
// `from '../store'` type imports keep working.
export type Fileset = import('./types').Fileset;
export type Translation = import('./types').Translation;

export interface BibleState {
  /**
   * Resolved `/bible/structure/` data keyed by bible abbr
   * (transient — persistence lives in the cacheManager tier;
   * SWR resolution in stores/bibleStore/structureSlice.ts).
   */
  structureByBible: Record<string, api.BibleStructure>;
  /**
   * The abbr whose structure currently drives localized
   * names + picker coverage.
   */
  activeStructureKey: string | null;
  /**
   * SWR resolve of the structure for `activeTextFilesetId` —
   * localStorage -> bundled catalog -> previous -> fetch.
   * Idempotent + in-flight deduped.
   */
  loadStructure: () => void;
  /**
   * SWR-fill `structureByBible` for the bible owning an
   * arbitrary selection id — warms the abbr-keyed coverage
   * oracle (utils/structureCoverage) for the selected AUDIO
   * version without touching the display layer.
   */
  ensureStructure: (
    selectionId: string | null
  ) => Promise<void>;
  /** USFM book code (e.g. "JHN") — canonical passage identity. */
  activeBookId: string;
  activeChapter: number;
  verseSelection: VerseSelection | null;
  bibleVersion: string;
  /**
   * UI locale (BCP-47: 'en' | 'lv' | 'ru'). Persisted; the
   * first-run value comes from `navigator.language` detection
   * and is independent of the Bible translation choice.
   */
  uiLanguage: UiLanguage;
  setUiLanguage: (lang: UiLanguage) => void;
  /**
   * Persisted preferred reading language for notes (BCP-47,
   * e.g. 'en'/'lv'). `null` means "follow `uiLanguage`" — the
   * initial seed — so a first-run Latvian user sees Latvian
   * notes without configuring anything.
   */
  preferredNoteLanguage: string | null;
  setPreferredNoteLanguage: (lang: string | null) => void;
  /**
   * Persisted "Auto-translate notes" toggle (MainMenu,
   * default ON). When OFF, no `?lang=` is ever sent and all
   * translation UI on note cards is hidden.
   */
  autoTranslateNotes: boolean;
  setAutoTranslateNotes: (enabled: boolean) => void;
  showAudioPlayer: boolean;
  translations: Translation[];
  activeTextFilesetId: string | null;
  activeAudioFilesetId: string | null;
  /**
   * Pinned translation for note-reference surfaces (the
   * '@…' scripture preview and note-linked verse text).
   * `null` = follow `activeTextFilesetId`. Persisted; set on
   * /settings via TranslationSelector's pick-only mode.
   */
  noteRefFilesetId: string | null;
  setNoteRefFilesetId: (id: string | null) => void;
  /**
   * Last saved translation pick per `language_iso`
   * (persisted). TranslationSelector re-stages the
   * remembered version when its language is revisited;
   * an entry whose `abbr` no longer appears in the
   * fetched list is ignored.
   */
  lastSelectionByLanguage: Record<
    string,
    LastLanguageSelection
  >;
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
  /**
   * Persisted per-tag pagination prefs keyed by tag id (the
   * UNTAGGED sentinel included): the page and page size the
   * user last viewed that tag at. `fetchNotes` writes it on
   * every successful tag fetch; `useTagNotesData` restores
   * it when a tag is revisited.
   */
  tagPagination: Record<string, TagPagination>;
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
  /**
   * Persisted opt-out for the bottom-bar book-name marquee
   * (default on; `prefers-reduced-motion` also disables it
   * regardless of this flag). The settings toggle UI is
   * deferred — it will only need to write this field.
   */
  bookTitleMarquee: boolean;
  setBookTitleMarquee: (enabled: boolean) => void;
  /**
   * Persisted "confirm before reordering notes" preference
   * (default ON — a Sentry user report asked for the check).
   * When ON, tag-page reorder actions (order-menu moves and
   * drag reorder) first open a confirm modal; the /settings
   * toggle lets the user skip it.
   */
  confirmNoteReorder: boolean;
  setConfirmNoteReorder: (enabled: boolean) => void;
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
  /** Records the last saved translation pick for a language. */
  setLastSelectionByLanguage: (
    languageIso: string,
    selection: LastLanguageSelection
  ) => void;
  fetchNotes: (
    tagId?: string,
    options?: {
      ordering?: string;
      page?: number;
      append?: boolean;
      includeDescendants?: boolean;
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
  /** Drops a deleted tag's remembered pagination position. */
  removeTagPagination: (tagId: string) => void;
  /**
   * Resolves the saved reading position for `bookId` and stages
   * the book-switch side effects (pendingScrollVerse,
   * audioActiveVerse) WITHOUT writing activeBookId/activeChapter.
   * The caller navigates to `/bible/{bookId}.{chapter}` and
   * BibleRoute's URL->store sync writes the book — writing it
   * here first would let a commit see the stale URL and revert
   * the switch. Returns the target chapter: a bare number when
   * the position was already known locally (cached, anonymous,
   * offline) so the caller can navigate in the same commit —
   * a Promise only when an authenticated fetch is required.
   */
  prepareBookSwitch: (bookId: string) => number | Promise<number>;
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
  uiLanguage: resolveUiLanguage(),
  // null = seed from uiLanguage at read time (see the
  // BibleState docs) — the persisted field itself stays
  // untouched until the user picks a language explicitly.
  preferredNoteLanguage: null as string | null,
  autoTranslateNotes: true,
  showAudioPlayer: false,
  translations: [],
  activeTextFilesetId: resolveInitialTextFileset(),
  activeAudioFilesetId: "ENGESV_API",
  noteRefFilesetId: null as string | null,
  lastSelectionByLanguage: {} as Record<
    string,
    LastLanguageSelection
  >,
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
  tagPagination: {} as Record<string, TagPagination>,
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
  bookTitleMarquee: true,
  confirmNoteReorder: true,
  structureByBible: {} as Record<string, api.BibleStructure>,
  activeStructureKey: null as string | null,
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
      // Persisted UI locale; rehydration bypasses this action
      // but initI18n resolves the same stored value directly.
      setUiLanguage: (uiLanguage) => {
        const previous = get().uiLanguage;
        set({ uiLanguage });
        // A failed lazy-catalog import must not strand the
        // persisted choice on a language the UI cannot
        // render — roll back and tell the user.
        void changeUiLanguage(uiLanguage).catch(() => {
          // A later setUiLanguage may have already switched
          // past this stale failure — reverting now would
          // clobber the newer choice (and toast for nothing).
          if (get().uiLanguage !== uiLanguage) return;
          set({ uiLanguage: previous });
          showNotification({
            title: i18n.t('common.error'),
            message: i18n.t('menu.languageLoadFailed'),
            color: 'red',
          });
        });
      },
      setShowAudioPlayer: (showAudioPlayer) => set({ showAudioPlayer }),
      setTranslations: (translations) => set({ translations }),
      setActiveTextFilesetId: (activeTextFilesetId) =>
        set({ activeTextFilesetId }),
      setActiveAudioFilesetId: (activeAudioFilesetId) =>
        set({ activeAudioFilesetId }),
      setNoteRefFilesetId: (noteRefFilesetId) =>
        set({ noteRefFilesetId }),
      setLastSelectionByLanguage: (languageIso, selection) =>
        set((state) => ({
          lastSelectionByLanguage: {
            ...state.lastSelectionByLanguage,
            [languageIso]: selection,
          },
        })),
      // Notes orchestration (paged fetch/cache, reorder/move
      // with conflict refresh) lives in
      // stores/bibleStore/notesSlice.ts — one store, same state.
      ...createNotesSlice(set, get, store),
      // Per-bible structure (localized names + coverage) with
      // stale-while-revalidate loading — structureSlice.ts.
      ...createStructureSlice(set, get, store),
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
      setBookTitleMarquee: (bookTitleMarquee) =>
        set({ bookTitleMarquee }),
      setConfirmNoteReorder: (confirmNoteReorder) =>
        set({ confirmNoteReorder }),
      setPreferredNoteLanguage: (preferredNoteLanguage) =>
        set({ preferredNoteLanguage }),
      setAutoTranslateNotes: (autoTranslateNotes) =>
        set({ autoTranslateNotes }),
      prepareBookSwitch: (bookId) => {
        // pendingScrollVerse carries the verse > 1 restore —
        // PassageView consumes it once the chapter loads.
        const stage = (
          position: api.ReadingPositionValue | null | undefined
        ): number => {
          const chapter = position?.chapter ?? 1;
          const verse = position?.verse ?? 1;
          set({
            audioActiveVerse: null,
            pendingScrollVerse:
              verse > 1 ? { bookId, chapter, verse } : null,
          });
          return chapter;
        };

        const cached = get().readingPositions[bookId];
        // undefined = never fetched; null = fetched, nothing
        // saved. Synchronous when the position is already known
        // or no fetch would run — the caller's navigate then
        // lands in the same commit, leaving no gap where a
        // rapid follow-up pick could act on the stale book.
        if (
          cached !== undefined ||
          !useAuthStore.getState().isAuthenticated ||
          (typeof navigator !== 'undefined' && !navigator.onLine)
        ) {
          return stage(cached);
        }
        return api
          .getReadingPosition(bookId)
          .then((apiPosition) => {
            const entry: api.ReadingPositionValue | null =
              apiPosition
                ? {
                    chapter: apiPosition.chapter,
                    verse: apiPosition.verse,
                  }
                : null;
            set((state) => ({
              readingPositions: {
                ...state.readingPositions,
                [bookId]: entry,
              },
            }));
            return stage(entry);
          })
          .catch((error) => {
            // A failed lookup stays `undefined` — never cached
            // as "no position", so the next book click retries
            // instead of permanently landing on chapter 1.
            captureHandledError(
              error,
              'Reading position fetch',
              { book: bookId }
            );
            return stage(undefined);
          });
      },
      syncReadingPosition: (bookId, chapter, verse = 1) => {
        set((state) => ({
          readingPositions: {
            ...state.readingPositions,
            [bookId]: { chapter, verse },
          },
        }));
        // Reading positions are user-owned and auth-required;
        // anonymous calls would only 401.
        if (useAuthStore.getState().isAuthenticated) {
          void api.updateReadingPosition(bookId, chapter, verse);
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
          captureHandledError(
            error,
            'Reading positions prefetch'
          );
        }
      },
    }),
    {
      name: "bible-storage",
      storage: createJSONStorage(() => localStorage),
      version: 12,
      migrate: migratePersistedState,
      partialize: partializeState,
    }
  )
);

// Let authStore purge session-owned state (logout / token change)
// without it importing this module — that edge would make the
// store evaluate inside api.tsx's Vitest importOriginal window
// and bind the real api, breaking vi.mock('../api').
registerBibleStore(useBibleStore);

// Re-resolve the bible structure whenever the active text
// fileset changes or the translation list first populates
// (the list arriving is also the first moment a fileset id
// can be mapped to its owning bible abbr). A same-shape list
// reset ([] -> []) must NOT kick a redundant SWR load.
useBibleStore.subscribe((state, prev) => {
  if (
    state.activeTextFilesetId !== prev.activeTextFilesetId ||
    (prev.translations.length === 0 &&
      state.translations.length > 0)
  ) {
    void state.loadStructure();
  }
});

// Warm the coverage oracle for the selected AUDIO version too:
// its owning bible can differ from the read version's
// (LVSGLU8 text + LAVLVR audio), and audio prefetch/fallback
// paths gate on the owner's own structure — loaded here via
// `ensureStructure` the same way `loadStructure` follows the
// text selection.
useBibleStore.subscribe((state, prev) => {
  if (
    state.activeAudioFilesetId !== prev.activeAudioFilesetId ||
    (prev.translations.length === 0 &&
      state.translations.length > 0)
  ) {
    void state.ensureStructure(state.activeAudioFilesetId);
  }
});
// Seed for returning users: the persisted translations list
// and audio fileset id rehydrate synchronously before this
// subscription registers, so neither trigger ever fires on a
// cold start — without it the audio coverage oracle stays
// unknown forever and uncovered-chapter prefetches keep
// paying guaranteed 404s.
void useBibleStore
  .getState()
  .ensureStructure(useBibleStore.getState().activeAudioFilesetId);

/**
 * Attach the active passage/fileset selection to the Sentry
 * scope — every subsequent event carries where in the Bible
 * the user was. The subscription covers navigation; the seed
 * call covers the persisted selection at startup.
 */
const syncSentryBibleContext = (state: BibleState): void => {
  Sentry.setContext('bible', {
    book: state.activeBookId,
    chapter: state.activeChapter,
    textFilesetId: state.activeTextFilesetId,
    audioFilesetId: state.activeAudioFilesetId,
  });
};
useBibleStore.subscribe((state, prev) => {
  if (
    state.activeBookId !== prev.activeBookId ||
    state.activeChapter !== prev.activeChapter ||
    state.activeTextFilesetId !== prev.activeTextFilesetId ||
    state.activeAudioFilesetId !== prev.activeAudioFilesetId
  ) {
    syncSentryBibleContext(state);
  }
});
syncSentryBibleContext(useBibleStore.getState());

/** Localized display name for the active book. */
export const selectActiveBookName = (state: BibleState): string =>
  localizedBookName(state.activeBookId) ?? state.activeBookId;
