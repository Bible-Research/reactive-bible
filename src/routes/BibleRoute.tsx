import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box } from "@mantine/core";
import { useBibleStore } from "../store";
import { getBooks } from "../api";
import SubHeader from "../components/SubHeader";
import PassageView from "../components/PassageView";

export default function BibleRoute() {
  const { book, chapter, verse } = useParams<{
    book?: string;
    chapter?: string;
    verse?: string;
  }>();
  const navigate = useNavigate();

  const {
    activeBook,
    activeBookShort,
    activeChapter,
    setActiveBook,
    setActiveBookShort,
    setActiveChapter,
    setActiveVerses,
  } = useBibleStore((state) => ({
    activeBook: state.activeBook,
    activeBookShort: state.activeBookShort,
    activeChapter: state.activeChapter,
    setActiveBook: state.setActiveBook,
    setActiveBookShort: state.setActiveBookShort,
    setActiveChapter: state.setActiveChapter,
    setActiveVerses: state.setActiveVerses,
  }));

  // Sync URL params to store on mount/change
  useEffect(() => {
    if (book && chapter) {
      const books = getBooks();
      const bookData = books.find(
        (b) =>
          b.book_id.toLowerCase() === book.toLowerCase() ||
          b.book_name.toLowerCase() === book.toLowerCase()
      );

      if (!bookData) {
        // Invalid book, redirect to current active book
        navigate(`/bible/${activeBookShort}/${activeChapter}`, {
          replace: true,
        });
        return;
      }

      const chapterNum = parseInt(chapter, 10);
      if (isNaN(chapterNum) || chapterNum < 1) {
        navigate(`/bible/${bookData.book_id}/1`, { replace: true });
        return;
      }

      // Update store if different from current state
      if (
        bookData.book_name !== activeBook ||
        chapterNum !== activeChapter
      ) {
        setActiveBook(bookData.book_name);
        setActiveBookShort(bookData.book_id);
        setActiveChapter(chapterNum);
      }

      // Handle verse parameter
      if (verse) {
        const verseNum = parseInt(verse, 10);
        if (!isNaN(verseNum) && verseNum > 0) {
          setActiveVerses([verseNum]);
        }
      } else {
        setActiveVerses([]);
      }
    } else if (!book && !chapter) {
      // No params, redirect to current active passage
      navigate(`/bible/${activeBookShort}/${activeChapter}`, {
        replace: true,
      });
    }
  }, [book, chapter, verse]);

  return (
    <Box style={{ flex: "1 0 100%" }}>
      <SubHeader />
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
        h="80vh"
      >
        <PassageView />
      </Box>
    </Box>
  );
}
