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
import { useBibleStore, selectActiveBookName } from "../store";
import { getAdjacentChapters } from "../api/structure";
import { buildBiblePath } from "../utils/bibleUtils";

interface BottomNavProps {
  setBibleSelectorOpened: (opened: boolean) => void;
}

const FOOTER_HEIGHT = 56;

const BottomNav = ({ setBibleSelectorOpened }: BottomNavProps) => {
  const navigate = useNavigate();
  const showAudioPlayer = useBibleStore(
    (state) => state.showAudioPlayer
  );
  // Same flag MyHeader drives — both bars hide/show together on
  // scroll; slide fully off-screen by driving `bottom` negative.
  const headerVisible = useBibleStore(
    (state) => state.headerVisible
  );
  const activeChapter = useBibleStore(
    (state) => state.activeChapter
  );
  const activeBookId = useBibleStore(
    (state) => state.activeBookId
  );
  // Display name ("John") rather than the raw USFM code ("JHN").
  const activeBookName = useBibleStore(selectActiveBookName);

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
          disabled={previous === null}
          title="prev-passage-button"
        >
          <IconArrowLeft size={rem(20)} />
        </ActionIcon>
        <Title order={4} title="nav-current-passage">
          <UnstyledButton
            onClick={() => setBibleSelectorOpened(true)}
            sx={{
              minWidth: "120px",
              textAlign: "center",
              font: "inherit",
              color: "inherit",
              "&:hover": {
                textDecoration: "underline",
              },
            }}
          >
            {activeBookName} {activeChapter}
          </UnstyledButton>
        </Title>
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
