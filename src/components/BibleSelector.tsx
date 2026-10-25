import { Navbar } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useBibleStore } from "../store";
import { buildBiblePath } from "../utils/bibleUtils";
import { verseNumbersFor } from "../utils/verseRefs";
import { findVersesInBetween } from "../utils/findVersesInBetween";
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
  const prepareBookSwitch = useBibleStore(
    (state) => state.prepareBookSwitch
  );
  // Memoized so the picker's scroll-into-view effect (which
  // depends on `verses`) doesn't refire on every render.
  const pickerVerses = useMemo(
    () =>
      verseSelection?.scope === 'bible'
        ? verseNumbersFor(
            verseSelection.refs, activeBookId, activeChapter
          )
        : [],
    [verseSelection, activeBookId, activeChapter]
  );

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
          scrollSignal={opened}
          onSelectBook={(bookId) => {
            // Resolve the saved position without writing
            // activeBookId — BibleRoute's URL->store sync must
            // be the one to write it. A store-first write lets
            // a commit see the stale URL with the new book and
            // revert the switch (and strands the user on the old
            // book when the reverted chapter doesn't exist in
            // the target book). A locally-known position returns
            // a bare number so this navigate lands in the SAME
            // commit as the click — awaiting it would open a
            // gap where a rapid follow-up pick acts on the
            // stale book.
            const target = prepareBookSwitch(bookId);
            if (typeof target === 'number') {
              void navigate(buildBiblePath(bookId, target));
            } else {
              void target.then((chapter) =>
                navigate(buildBiblePath(bookId, chapter))
              );
            }
          }}
          onSelectChapter={(chapter) => {
            void navigate(buildBiblePath(activeBookId, chapter));
            setOpened(false);
          }}
          onSelectVerse={(verse, extendRange) => {
            // Shift+click extends the range from the first
            // currently selected verse, like Verse.tsx's
            // shift+click anchor.
            const anchor = pickerVerses[0];
            const verses =
              extendRange &&
              anchor !== undefined &&
              anchor !== verse
                ? findVersesInBetween(
                    String(Math.min(anchor, verse)),
                    String(Math.max(anchor, verse)),
                  )
                : [verse];
            void navigate(
              buildBiblePath(activeBookId, activeChapter, verses)
            );
            setOpened(false);
          }}
        />
      </Navbar.Section>
    </Navbar>
  );
};

export default BibleSelector;
