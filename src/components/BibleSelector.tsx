import { Navbar } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useNavigate } from "react-router-dom";
import { useBibleStore } from "../store";
import { buildBiblePath } from "../utils/bibleUtils";
import { verseNumbersFor } from "../utils/verseRefs";
import PassagePicker from "./PassagePicker";

const MOBILE_LANDSCAPE_QUERY =
  "(orientation: landscape) and (max-height: 500px)";

const BibleSelector = ({
  opened,
  setOpened,
}: {
  opened: boolean;
  setOpened: (opened: boolean) => void;
}) => {
  const navigate = useNavigate();
  const activeBookId = useBibleStore((state) => state.activeBookId);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const verseSelection = useBibleStore((state) => state.verseSelection);
  const isMobileLandscape = useMediaQuery(MOBILE_LANDSCAPE_QUERY);
  const pickerVerses =
    verseSelection?.scope === 'bible'
      ? verseNumbersFor(
          verseSelection.refs, activeBookId, activeChapter
        )
      : [];

  if (isMobileLandscape && !opened) {
    return null;
  }

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
          bookId={activeBookId}
          chapter={activeChapter}
          verses={pickerVerses}
          titlePrefix="nav-"
          onSelectBook={(bookId) => {
            console.log(`🔗 Navigating to: /bible/${bookId}.1`);
            navigate(buildBiblePath(bookId, 1));
          }}
          onSelectChapter={(chapter) => {
            console.log(
              `🔗 Navigating to: /bible/${activeBookId}.${chapter}`
            );
            navigate(buildBiblePath(activeBookId, chapter));
          }}
          onSelectVerse={(verse) => {
            navigate(
              buildBiblePath(activeBookId, activeChapter, [verse])
            );
            setOpened(false);
          }}
        />
      </Navbar.Section>
    </Navbar>
  );
};

export default BibleSelector;
