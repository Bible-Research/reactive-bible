import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
import { decodeVerses } from '../utils/bibleUtils';
import { sameRefSet } from '../utils/verseRefs';
import type { VerseRef } from '../types';
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
    setVerseSelection,
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
  // Verse.tsx (which already updated verseSelection) does not re-set
  // the store when the URL already matches current selection.
  useEffect(() => {
    const chapterNum = chapter ? parseInt(chapter, 10) : NaN;
    if (verse && book && !isNaN(chapterNum)) {
      const decoded = decodeVerses(verse);
      if (decoded.length > 0) {
        const refs: VerseRef[] = decoded.map((v) => ({
          book,
          chapter: chapterNum,
          verse: v,
        }));
        const current = useBibleStore.getState().verseSelection;
        const matches =
          current?.scope === 'bible' &&
          sameRefSet(current.refs, refs);
        if (!matches) {
          setVerseSelection({ scope: 'bible', refs });
        }
        return;
      }
    }
    if (useBibleStore.getState().verseSelection !== null) {
      setVerseSelection(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verse, book, chapter]);

  return <Passage />;
}
