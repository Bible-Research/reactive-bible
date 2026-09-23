import {
  ActionIcon,
  Box,
  Footer,
  Title,
  rem,
} from "@mantine/core";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useBibleStore } from "../store";
import { getPassage } from "../api";
import { buildBiblePath } from "../utils/bibleUtils";

interface BottomNavProps {
  setBibleSelectorOpened: (opened: boolean) => void;
}

const BottomNav = ({ setBibleSelectorOpened }: BottomNavProps) => {
  const navigate = useNavigate();
  const showAudioPlayer = useBibleStore((state) => state.showAudioPlayer);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const activeBookId = useBibleStore((state) => state.activeBookId);
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
    if (getPassageResult) {
      const next = getPassageResult[index + 1];
      if (next !== null) {
        console.log(
          `🔗 BottomNav Next: ` +
          `/bible/${next.book_id}.${next.chapter}`
        );
        navigate(buildBiblePath(next.book_id, next.chapter));
      }
    }
  };

  const prevHandler = () => {
    const index = checkPrev();
    if (index === null) return null;
    if (getPassageResult) {
      const prev = getPassageResult[index - 1];
      if (prev !== null) {
        console.log(
          `🔗 BottomNav Prev: ` +
          `/bible/${prev.book_id}.${prev.chapter}`
        );
        navigate(buildBiblePath(prev.book_id, prev.chapter));
      }
    }
  };

  return (
    <Footer
      height={56}
      sx={{
        bottom: showAudioPlayer ? '120px' : '0',
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
          onClick={() => setBibleSelectorOpened(true)}
          sx={{
            cursor: "pointer",
            minWidth: "120px",
            textAlign: "center",
            "&:hover": {
              textDecoration: "underline",
            },
          }}
        >
          {activeBookId} {activeChapter}
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
