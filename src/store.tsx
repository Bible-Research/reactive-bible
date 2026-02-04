import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getNotes } from "./api";
import { Note } from "./types";

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

interface BibleState {
  activeBook: string;
  activeBookShort: string;
  activeChapter: number;
  activeVerses: number[];
  bibleVersion: string;
  showAudioPlayer: boolean;
  translations: Translation[];
  activeTextFilesetId: string | null;
  activeAudioFilesetId: string | null;
  notes: Note[];
  allNotes: Note[];
  allNotesFetched: boolean;
  showNotes: boolean;
  setActiveBook: (activeBook: string) => void;
  setActiveBookOnly: (activeBook: string) => void;
  setActiveBookShort: (activeBookShort: string) => void;
  setActiveChapter: (activeChapter: number) => void;
  setActiveVerses: (activeVerses: number[]) => void;
  selectedVerses: number[];
  setBibleVersion: (bibleVersion: string) => void;
  setShowAudioPlayer: (show: boolean) => void;
  setTranslations: (translations: Translation[]) => void;
  setActiveTextFilesetId: (id: string | null) => void;
  setActiveAudioFilesetId: (id: string | null) => void;
  fetchNotes: (tagId?: string) => Promise<void>;
  fetchAllNotes: () => Promise<void>;
  setShowNotes: (show: boolean) => void;
}

// Define and export the initial state for reusability and testing
export const initialState = {
  activeBook: "John",
  activeBookShort: "Joh",
  activeChapter: 1,
  activeVerses: [],
  selectedVerses: [],
  bibleVersion: "KJV",
  showAudioPlayer: false,
  translations: [],
  activeTextFilesetId: "ENGESH",
  activeAudioFilesetId: "ENGESHN1DA-opus16",
  notes: [],
  allNotes: [],
  allNotesFetched: false,
  showNotes: false,
};

export const useBibleStore = create<BibleState>()(
  persist(
    (set) => ({
      ...initialState,
      setActiveBook: (activeBook) => set({ 
        activeBook, 
        activeChapter: 1, 
        activeVerses: [] 
      }),
      setActiveBookOnly: (activeBook) => set({ activeBook }),
      setActiveBookShort: (activeBookShort) => set({ activeBookShort }),
      setActiveChapter: (activeChapter) => set({ 
        activeChapter, 
        activeVerses: [] 
      }),
      setActiveVerses: (activeVerses) => {
        set({ activeVerses });
        activeVerses.forEach((verse) => {
          document
            .getElementById("verse-" + verse)
            ?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      },
      setBibleVersion: (bibleVersion) => set({ bibleVersion }),
      setShowAudioPlayer: (showAudioPlayer) => set({ showAudioPlayer }),
      setTranslations: (translations) => set({ translations }),
      setActiveTextFilesetId: (activeTextFilesetId) =>
        set({ activeTextFilesetId }),
      setActiveAudioFilesetId: (activeAudioFilesetId) =>
        set({ activeAudioFilesetId }),
      fetchNotes: async (tagId?: string) => {
        const notes = await getNotes(tagId);
        set({ notes, allNotesFetched: !tagId });
      },
      fetchAllNotes: async () => {
        const allNotes = await getNotes();
        set({ allNotes });
      },
      setShowNotes: (showNotes) => set({ showNotes }),
    }),
    {
      name: "bible-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeBook: state.activeBook,
        activeBookShort: state.activeBookShort,
        activeChapter: state.activeChapter,
        activeVerses: state.activeVerses,
        selectedVerses: state.selectedVerses,
        bibleVersion: state.bibleVersion,
        translations: state.translations,
        activeTextFilesetId: state.activeTextFilesetId,
        activeAudioFilesetId: state.activeAudioFilesetId,
        // showAudioPlayer is NOT persisted
      }),
    }
  )
);
