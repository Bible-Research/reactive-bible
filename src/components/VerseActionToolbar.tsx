import {
  ActionIcon,
  Box,
  Group,
  Text,
  rem,
} from "@mantine/core";
import { IconBookmark, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useBibleStore } from "../store";
import AddTagNoteModal from "./AddTagNoteModal";

const VerseActionToolbar = () => {
  const activeVerses = useBibleStore((state) => state.activeVerses);
  const setActiveVerses = useBibleStore((state) => state.setActiveVerses);
  const showAudioPlayer = useBibleStore((state) => state.showAudioPlayer);
  const [noteModalOpened, setNoteModalOpened] = useState(false);
  const location = useLocation();

  const isBibleRoute = location.pathname.startsWith("/bible");
  const isVisible = activeVerses.length > 0 && isBibleRoute;
  const bottomOffset = showAudioPlayer ? 176 : 56;

  return (
    <>
      <Box
        sx={(theme) => ({
          position: "fixed",
          bottom: isVisible ? `${bottomOffset}px` : "-56px",
          left: 0,
          right: 0,
          height: rem(56),
          zIndex: 200,
          transition: "bottom 0.25s ease-in-out",
          pointerEvents: isVisible ? "auto" : "none",
          backgroundColor:
            theme.colorScheme === "dark"
              ? theme.colors.dark[6]
              : theme.white,
          borderTop: `1px solid ${
            theme.colorScheme === "dark"
              ? theme.colors.dark[4]
              : theme.colors.gray[3]
          }`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: rem(16),
          paddingRight: rem(16),
        })}
      >
        <Group spacing="xs">
          <ActionIcon
            variant="transparent"
            onClick={() => setActiveVerses([])}
            title="Clear selection"
          >
            <IconX size={rem(18)} />
          </ActionIcon>
          <Text size="sm">
            {activeVerses.length} verse
            {activeVerses.length !== 1 ? "s" : ""} selected
          </Text>
        </Group>
        <Group spacing="xs">
          <ActionIcon
            variant="light"
            color="blue"
            size="lg"
            onClick={() => setNoteModalOpened(true)}
            title="Add note"
          >
            <IconBookmark size={rem(20)} />
          </ActionIcon>
        </Group>
      </Box>
      {noteModalOpened && (
        <AddTagNoteModal
          opened={noteModalOpened}
          onClose={() => setNoteModalOpened(false)}
        />
      )}
    </>
  );
};

export default VerseActionToolbar;
