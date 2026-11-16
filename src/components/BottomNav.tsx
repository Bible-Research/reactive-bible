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
import { AUDIO_PLAYER_HEIGHT } from "../utils/audioUtils";
import Marquee from "./Marquee";
import { getAdjacentChapters } from "../api/structure";
import { buildBiblePath } from "../utils/bibleUtils";
import { FOOTER_HEIGHT } from "../utils/layoutChrome";

interface BottomNavProps {
  bibleSelectorOpened: boolean;
  setBibleSelectorOpened: (opened: boolean) => void;
}

const BottomNav = ({
  bibleSelectorOpened,
  setBibleSelectorOpened,
}: BottomNavProps) => {
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
    void navigate(buildBiblePath(previous.bookId, previous.chapter));
  };

  const nextHandler = () => {
    if (next === null) return;
    void navigate(buildBiblePath(next.bookId, next.chapter));
  };

  return (
    <Footer
      height={FOOTER_HEIGHT}
      data-bottom-nav-visible={headerVisible}
      sx={{
        bottom: headerVisible
          ? showAudioPlayer
            ? `${AUDIO_PLAYER_HEIGHT}px`
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
            onClick={() =>
              setBibleSelectorOpened(!bibleSelectorOpened)
            }
            sx={{
              minWidth: "120px",
              // Caps the title zone so an overflowing
              // localized name triggers the marquee instead
              // of pushing the chapter/arrows outward.
              maxWidth: "min(340px, 58vw)",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "center",
              columnGap: "0.3em",
              font: "inherit",
              color: "inherit",
              "&:hover": {
                textDecoration: "underline",
              },
            }}
          >
            <Marquee text={activeBookName} />
            {" "}
            {/* flex: none pins the chapter at the title's
                right edge — always visible, never scrolling.
                Inline so tests can assert the pin directly. */}
            <Box component="span" style={{ flex: "none" }}>
              {activeChapter}
            </Box>
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
