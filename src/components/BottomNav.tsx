import {
  ActionIcon,
  Box,
  Footer,
  Title,
  UnstyledButton,
  rem,
} from "@mantine/core";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useBibleStore } from "../store";
import { getAdjacentChapters } from "../api";
import { buildBiblePath } from "../utils/bibleUtils";

interface BottomNavProps {
  setBibleSelectorOpened: (opened: boolean) => void;
}

const BottomNav = ({ setBibleSelectorOpened }: BottomNavProps) => {
  const navigate = useNavigate();
  const showAudioPlayer = useBibleStore(
    (state) => state.showAudioPlayer
  );
  const activeChapter = useBibleStore(
    (state) => state.activeChapter
  );
  const activeBookId = useBibleStore(
    (state) => state.activeBookId
  );

  const { previous, next } = useMemo(
    () => getAdjacentChapters(activeBookId, activeChapter),
    [activeBookId, activeChapter]
  );

  const prevHandler = () => {
    if (previous === null) return;
    navigate(buildBiblePath(previous.bookId, previous.chapter));
  };

  const nextHandler = () => {
    if (next === null) return;
    navigate(buildBiblePath(next.bookId, next.chapter));
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
          disabled={previous === null}
          title="prev-passage-button"
        >
          <IconArrowLeft size={rem(20)} />
        </ActionIcon>
        <UnstyledButton
          onClick={() => setBibleSelectorOpened(true)}
          sx={{
            minWidth: "120px",
            textAlign: "center",
            "&:hover": {
              textDecoration: "underline",
            },
          }}
        >
          <Title order={4}>
            {activeBookId} {activeChapter}
          </Title>
        </UnstyledButton>
        <ActionIcon
          variant="transparent"
          onClick={nextHandler}
          disabled={next === null}
          title="next-passage-button"
        >
          <IconArrowRight size={rem(20)} />
        </ActionIcon>
      </Box>
    </Footer>
  );
};

BottomNav.displayName = "BottomNav";

export default BottomNav;
