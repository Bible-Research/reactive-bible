import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
import { decodeVerses } from '../utils/bibleUtils';
import Passage from '../components/Passage';

export default function BibleRoute() {
  const { book, chapterVerse } = useParams<{
    book?: string;
    chapterVerse?: string;
  }>();
  const dotIdx = chapterVerse?.indexOf('.') ?? -1;
  const chapter = dotIdx >= 0
    ? chapterVerse!.slice(0, dotIdx)
    : chapterVerse;
  const verse = dotIdx >= 0
    ? chapterVerse!.slice(dotIdx + 1)
    : undefined;
  
  const navigate = useNavigate();
  const {
    activeBook,
    activeChapter,
    setActiveBookAndChapter,
    setActiveVerses,
    setShowNotes,
    setVersesFolded,
    getTags,
  } = useBibleStore();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Always refresh tags when navigating to this route
  useEffect(() => {
    if (isAuthenticated) {
      getTags(true); // Force refresh to get latest tags
    }
  }, [getTags, isAuthenticated]);

  // Sync book/chapter URL params to store and handle redirect.
  // activeBook/activeChapter are intentionally included so this
  // re-runs after Zustand persist rehydration overwrites the state.
  useEffect(() => {
    setShowNotes(false);
    setVersesFolded(false);

    if (book && chapter) {
      const chapterNum = parseInt(chapter, 10);
      if (book !== activeBook || chapterNum !== activeChapter) {
        setActiveBookAndChapter(book, chapterNum);
      }
    } else {
      navigate(`/bible/${activeBook}/${activeChapter}`, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, chapter, activeBook, activeChapter]);

  // Sync verse URL param to store. Guarded so that navigating from
  // Verse.tsx (which already called setActiveVerses) does not re-set
  // the store when the URL already matches current selection.
  useEffect(() => {
    if (verse) {
      const decoded = decodeVerses(verse);
      if (decoded.length > 0) {
        const current = useBibleStore.getState().activeVerses;
        const sd = [...decoded].sort((a, b) => a - b);
        const sc = [...current].sort((a, b) => a - b);
        const matches = sd.length === sc.length &&
          sd.every((v, i) => v === sc[i]);
        if (!matches) {
          setActiveVerses(decoded);
        }
      }
    } else {
      if (useBibleStore.getState().activeVerses.length > 0) {
        setActiveVerses([]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verse]);

  return <Passage />;
}
