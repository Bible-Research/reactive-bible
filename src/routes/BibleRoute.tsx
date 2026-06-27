import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBibleStore } from '../store';
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
  } = useBibleStore();

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
  // Verse.tsx (which already called setActiveVerses) does not collapse
  // a multi-verse selection down to a single verse.
  useEffect(() => {
    const verseNum = verse ? parseInt(verse, 10) : null;
    if (verseNum && !isNaN(verseNum)) {
      if (!useBibleStore.getState().activeVerses.includes(verseNum)) {
        setActiveVerses([verseNum]);
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
