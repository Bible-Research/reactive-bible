
import { Box } from "@mantine/core";
import { useBibleStore } from "../store";
import { getBooks } from "../api";
import PassageView from "./PassageView";
import NotesView from "./NotesView";

const Passage = () => {
  // Get showNotes from store instead of props
  const showNotes = useBibleStore((state) => state.showNotes);
  const setShowNotes = useBibleStore((state) => state.setShowNotes);
  const setActiveBook = useBibleStore((state) => state.setActiveBook);
  const setActiveBookShort = useBibleStore(
    (state) => state.setActiveBookShort
  );
  const setActiveChapter = useBibleStore((state) => state.setActiveChapter);
  const setActiveVerses = useBibleStore((state) => state.setActiveVerses);

  const handleViewInBible = (
    book: string,
    chapter: number,
    verse: number
  ) => {
    // Find the book_id (short name) for the given book name
    const books = getBooks();
    const bookData = books.find((b) => b.book_name === book);
    const bookShort = bookData?.book_id || book;

    // Set context for note creation
    setActiveBook(book);
    setActiveBookShort(bookShort);
    setActiveChapter(chapter);
    setActiveVerses([verse]);
    setShowNotes(false); // Switch to Bible view
  };

  return (
    <Box style={{ flex: "1 0 100%", height: "100%" }}>
      <Box style={{ height: "100%", overflow: "auto" }}>
        {showNotes ? (
          <NotesView onViewInBible={handleViewInBible} />
        ) : (
          <PassageView />
        )}
      </Box>
    </Box>
  );
};

export default Passage;
