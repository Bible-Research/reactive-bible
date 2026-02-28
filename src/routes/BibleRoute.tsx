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
    setActiveBook,
    setActiveChapter,
  } = useBibleStore();

  // Sync URL params to store when URL changes
  useEffect(() => {
    if (book && chapter) {
      const chapterNum = parseInt(chapter, 10);
      
      // Only update if different from current state
      if (book !== activeBook || chapterNum !== activeChapter) {
        console.log(`📖 URL changed: ${book} ${chapterNum}`);
        setActiveBook(book);
        setActiveChapter(chapterNum);
      }
    } else {
      // No URL params - redirect to current store state
      console.log(
        `📖 No URL params, redirecting to: ${activeBook} ${activeChapter}`
      );
      navigate(`/bible/${activeBook}/${activeChapter}`, { replace: true });
    }
  }, [book, chapter, activeBook, activeChapter, setActiveBook, setActiveChapter, navigate]);

  // Sync store changes back to URL (when user navigates via UI)
  useEffect(() => {
    // Skip if we don't have URL params yet (handled by first effect)
    if (!book || !chapter) return;
    
    const expectedUrl = `/bible/${activeBook}/${activeChapter}`;
    const currentUrl = `/bible/${book}/${chapter}`;
    
    // Only update URL if store state differs from URL params
    if (expectedUrl !== currentUrl) {
      console.log(`📖 Store changed, updating URL to: ${expectedUrl}`);
      navigate(expectedUrl, { replace: true });
    }
  }, [activeBook, activeChapter, book, chapter, navigate]);

  return <Passage />;
}
