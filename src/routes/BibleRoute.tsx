import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBibleStore } from '../store';
import Passage from '../components/Passage';

export default function BibleRoute() {
  const { book, chapter } = useParams<{
    book?: string;
    chapter?: string;
  }>();
  
  const navigate = useNavigate();
  const {
    activeBook,
    activeChapter,
    setActiveBookAndChapter,
    setShowNotes,
    setVersesFolded,
  } = useBibleStore();

  // Sync URL params to store (one-way: URL is source of truth).
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

  return <Passage />;
}
