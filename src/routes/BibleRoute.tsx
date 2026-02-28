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

  console.log('📖 BibleRoute render:', { 
    urlBook: book, 
    urlChapter: chapter, 
    storeBook: activeBook, 
    storeChapter: activeChapter 
  });

  // Sync URL params to store (one-way: URL is source of truth)
  useEffect(() => {
    if (book && chapter) {
      const chapterNum = parseInt(chapter, 10);
      
      // Update store to match URL
      if (book !== activeBook || chapterNum !== activeChapter) {
        console.log(`📖 Syncing URL to store: ${book} ${chapterNum}`);
        setActiveBook(book);
        setActiveChapter(chapterNum);
      }
    } else {
      // No URL params - redirect to current store state
      console.log(`📖 No URL params, redirecting to: ${activeBook} ${activeChapter}`);
      navigate(`/bible/${activeBook}/${activeChapter}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, chapter]); // Only depend on URL params to prevent loops

  return <Passage />;
}
