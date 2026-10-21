import {
  ActionIcon,
  Box,
  Footer,
  Title,
  rem,
} from "@mantine/core";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useBibleStore, selectActiveBookName } from "../store";
import { getPassage } from "../api";
import { buildBiblePath } from "../utils/bibleUtils";

interface BottomNavProps {
  setBibleSelectorOpened: (opened: boolean) => void;
}

const FOOTER_HEIGHT = 56;

const BottomNav = ({ setBibleSelectorOpened }: BottomNavProps) => {
  const navigate = useNavigate();
  const showAudioPlayer = useBibleStore((state) => state.showAudioPlayer);
  // Same flag MyHeader drives — both bars hide/show together on
  // scroll; slide fully off-screen by driving `bottom` negative.
  const headerVisible = useBibleStore((state) => state.headerVisible);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const activeBookId = useBibleStore((state) => state.activeBookId);
  // Display name ("John") rather than the raw USFM code ("JHN").
  const activeBookName = useBibleStore(selectActiveBookName);
  const getPassageResult = getPassage();

  const checkNext = (): number | null => {
    const index = getPassageResult.findIndex(
      (book) =>
        book.book_id === activeBookId &&
        book.chapter === activeChapter
    );
    return index === -1 || index === getPassageResult.length - 1
      ? null
      : index;
  };

  const checkPrev = (): number | null => {
    const index = getPassageResult.findIndex(
      (book) =>
        book.book_id === activeBookId &&
        book.chapter === activeChapter
    );
    return index === -1 || index === 0 ? null : index;
  };

  const nextHandler = () => {
    const index = checkNext();
    if (index === null) return null;
    const next = getPassageResult[index + 1];
    if (next !== null) {
      navigate(buildBiblePath(next.book_id, next.chapter));
    }
  };

  const prevHandler = () => {
    const index = checkPrev();
    if (index === null) return null;
    const prev = getPassageResult[index - 1];
    if (prev !== null) {
      navigate(buildBiblePath(prev.book_id, prev.chapter));
    }
  };

  return (
    <Footer
      height={FOOTER_HEIGHT}
      data-bottom-nav-visible={headerVisible}
      sx={{
        bottom: headerVisible
          ? showAudioPlayer
            ? '120px'
            : '0'
          : `-${FOOTER_HEIGHT}px`,
        transition: 'bottom 0.3s ease-in-out',
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          gap: "1rem",
        }}
      >
        <ActionIcon
          variant="transparent"
          onClick={prevHandler}
          disabled={checkPrev() === null}
          title="prev-passage-button"
        >
          <IconArrowLeft size={rem(20)} />
        </ActionIcon>
        <Title
          order={4}
          role="button"
          tabIndex={0}
          title="nav-current-passage"
          onClick={() => setBibleSelectorOpened(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setBibleSelectorOpened(true);
            }
          }}
          sx={{
            cursor: "pointer",
            minWidth: "120px",
            textAlign: "center",
            "&:hover": {
              textDecoration: "underline",
            },
          }}
        >
          {activeBookName} {activeChapter}
        </Title>
        <ActionIcon
          variant="transparent"
          onClick={nextHandler}
          disabled={checkNext() === null}
          title="next-passage-button"
        >
          <IconArrowRight size={rem(20)} />
        </ActionIcon>
      </Box>
    </Footer>
  );
};

export default BottomNav;
