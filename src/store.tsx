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
  getCachedNotes,
  cacheNotes,
  clearNotesCache,
} from './utils/cacheManager';

export interface Fileset {
  id: string;
  type: "text_plain" | "audio" | "audio_drama";
  size: string;
  codec: "mp3" | "opus" | null;
  bitrate: string | null;
}

export interface Translation {
  abbr: string;
  name: string;
  language: string;
  language_iso: string;
  filesets: Fileset[];
}

export interface BibleState {
  activeBook: string;
  activeBookShort: string;
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
  setActiveBook: (activeBook: string) => void;
  setActiveBookAndChapter: (
    activeBook: string,
    activeChapter: number
  ) => void;
  setActiveBookOnly: (activeBook: string) => void;
  setActiveBookShort: (activeBookShort: string) => void;
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
  setShowNotes: (show: boolean) => void;
  setLastSelectedTagId: (tagId: string | null) => void;
  setNotesPage: (page: number) => void;
  setNotesPageSize: (pageSize: number) => void;
}

// Define and export the initial state for reusability and testing
export const initialState = {
  activeBook: "John",
  activeBookShort: "Joh",
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
};

const partializeState = (state: BibleState) => ({
  activeBook: state.activeBook,
  activeBookShort: state.activeBookShort,
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
  // showAudioPlayer is NOT persisted
});

type PersistedBibleState = ReturnType<typeof partializeState>;

/**
 * Migrates pre-v2 persisted state: the old bare `activeVerses:
 * number[]` becomes a 'bible'-scoped VerseSelection built from the
 * persisted book/chapter. `selectedVerses` is dropped entirely.
 */
export const migratePersistedState = (
  persistedState: unknown,
  version: number,
): PersistedBibleState => {
  const persisted = (persistedState ?? {}) as Record<string, unknown>;
  if (version >= 2) {
    return persisted as PersistedBibleState;
  }
  const oldVerses = Array.isArray(persisted.activeVerses)
    ? (persisted.activeVerses as unknown[]).filter(
        (v): v is number => typeof v === 'number'
      )
    : [];
  const refs: VerseRef[] = oldVerses.map((v) => ({
    book:
      typeof persisted.activeBook === 'string'
        ? persisted.activeBook
        : 'John',
    chapter:
      typeof persisted.activeChapter === 'number'
        ? persisted.activeChapter
        : 1,
    verse: v,
  }));
  const migrated: Record<string, unknown> = {
    ...persisted,
    verseSelection:
      refs.length > 0 ? { scope: 'bible', refs } : null,
  };
  delete migrated.activeVerses;
  delete migrated.selectedVerses;
  return migrated as PersistedBibleState;
};

export const useBibleStore = createWithEqualityFn<BibleState>()(
  persist(
    (set) => ({
      ...initialState,
      setActiveBook: (activeBook) => set({
        activeBook,
        activeChapter: 1,
        verseSelection: null,
        audioActiveVerse: null
      }),
      setActiveBookAndChapter: (activeBook, activeChapter) =>
        set({
          activeBook,
          activeChapter,
          verseSelection: null,
        }),
      setActiveBookOnly: (activeBook) => set({ activeBook }),
      setActiveBookShort: (activeBookShort) => set({ activeBookShort }),
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
            refA.book !== refB.book ||
            refA.chapter !== refB.chapter
          ) {
            return { verseSelection: { scope, refs: [refB] } };
          }
          const start = Math.min(refA.verse, refB.verse);
          const end = Math.max(refA.verse, refB.verse);
          const rangeRefs: VerseRef[] = [];
          for (let v = start; v <= end; v++) {
            rangeRefs.push({
              book: refA.book,
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
        try {
          const { ordering, page = 1, append = false } = options;
          const {
            notesPageSize,
            activeTextFilesetId
          } = useBibleStore.getState();
          
          // Check cache for any page/ordering combination
          if (!append && tagId) {
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
            `fileset: ${activeTextFilesetId || 'default'})`
          );
          
          const response = await api.getNotes(tagId, {
            ordering,
            page,
            pageSize: notesPageSize,
            filesetId: activeTextFilesetId || undefined,
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
            notes: state.notes.filter((n) => n.id !== noteId)
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
            // Refresh notes from server
            await useBibleStore.getState().fetchNotes(tagId);
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
    }),
    {
      name: "bible-storage",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: migratePersistedState,
      partialize: partializeState,
    }
  )
);
