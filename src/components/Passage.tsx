
import { Box } from "@mantine/core";
import { useBibleStore } from "../store";
import { getBooks } from "../api";
import SubHeader from "./SubHeader";
import PassageView from "./PassageView";
import NotesView from "./NotesView";

interface PassageProps {
  open: () => void;
  showNotes: boolean;
  setShowNotes: (show: boolean) => void;
  bibleSelectorOpened: boolean;
  setBibleSelectorOpened: (opened: boolean) => void;
}

const Passage = ({
  open,
  showNotes,
  setShowNotes,
  bibleSelectorOpened,
  setBibleSelectorOpened,
}: PassageProps) => {
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
    <Box style={{ flex: "1 0 100%" }}>
      <SubHeader
        open={open}
        bibleSelectorOpened={bibleSelectorOpened}
        setBibleSelectorOpened={setBibleSelectorOpened}
      />
      <Box h="80vh">
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
