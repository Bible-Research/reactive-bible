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
  }, [book, chapter]);

  // Sync store changes back to URL (when user navigates via UI)
  useEffect(() => {
    const expectedUrl = `/bible/${activeBook}/${activeChapter}`;
    const currentPath = window.location.pathname;
    
    if (currentPath !== expectedUrl && !currentPath.includes('/bible/')) {
      console.log(`📖 Store changed, updating URL to: ${expectedUrl}`);
      navigate(expectedUrl, { replace: true });
    }
  }, [activeBook, activeChapter]);

  return <Passage />;
}
