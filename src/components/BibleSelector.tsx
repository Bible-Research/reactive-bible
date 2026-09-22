import { Navbar } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useBibleStore } from "../store";
import { getAllBooks } from "../utils/scriptureMention";
import { verseNumbersFor } from "../utils/verseRefs";
import PassagePicker from "./PassagePicker";

const BibleSelector = ({
  opened,
  setOpened,
}: {
  opened: boolean;
  setOpened: (opened: boolean) => void;
}) => {
  const navigate = useNavigate();
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const verseSelection = useBibleStore((state) => state.verseSelection);
  const pickerVerses =
    verseSelection?.scope === 'bible'
      ? verseNumbersFor(verseSelection.refs, activeBook, activeChapter)
      : [];
  const setActiveBookShort = useBibleStore(
    (state) => state.setActiveBookShort
  );

  return (
    <Navbar
      hiddenBreakpoint="sm"
      hidden={!opened}
      width={{ sm: 320, lg: 320 }}
      sx={{
        overflow: "hidden",
        transition: "width 1000ms ease, min-width 1000ms ease",
      }}
    >
      <Navbar.Section grow sx={{ overflow: "hidden" }}>
        <PassagePicker
          book={activeBook}
          chapter={activeChapter}
          verses={pickerVerses}
          titlePrefix="nav-"
          onSelectBook={(bookName) => {
            const entry = getAllBooks().find(
              (b) => b.book_name === bookName
            );
            if (entry) setActiveBookShort(entry.book_id);
            console.log(`🔗 Navigating to: /bible/${bookName}/1`);
            navigate(`/bible/${bookName}/1`);
          }}
          onSelectChapter={(chapter) => {
            console.log(
              `🔗 Navigating to: /bible/${activeBook}/${chapter}`
            );
            navigate(`/bible/${activeBook}/${chapter}`);
          }}
          onSelectVerse={(verse) => {
            navigate(`/bible/${activeBook}/${activeChapter}.${verse}`);
            setOpened(false);
          }}
        />
      </Navbar.Section>
    </Navbar>
  );
};

export default BibleSelector;
