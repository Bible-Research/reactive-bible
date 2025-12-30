import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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
}

export const useBibleStore = create<BibleState>()(
  persist(
    (set) => ({
      activeBook: "Genesis",
      activeBookShort: "Gen",
      activeChapter: 1,
      activeVerses: [],
      selectedVerses: [],
      bibleVersion: "KJV",
      showAudioPlayer: false,
      translations: [],
      activeTextFilesetId: "ENGKJV", // Default to KJV text
      activeAudioFilesetId: null,
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
