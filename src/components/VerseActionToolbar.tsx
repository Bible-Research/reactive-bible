import {
  ActionIcon,
  Anchor,
  Box,
  Group,
  Modal,
  Text,
  rem,
} from "@mantine/core";
import { IconBookmark, IconCopy, IconMap2, IconX } from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useBibleStore } from "../store";
import { showNotification } from "@mantine/notifications";
import AddTagNoteModal from "./AddTagNoteModal";

const VerseActionToolbar = () => {
  const activeVerses = useBibleStore((state) => state.activeVerses);
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const setActiveVerses = useBibleStore((state) => state.setActiveVerses);
  const showAudioPlayer = useBibleStore((state) => state.showAudioPlayer);
  const [noteModalOpened, setNoteModalOpened] = useState(false);
  const [mapModalOpened, setMapModalOpened] = useState(false);
  const location = useLocation();

  const passageRef = useMemo(() => {
    const sorted = [...activeVerses].sort((a, b) => a - b);
    if (sorted.length === 0) return `${activeBook} ${activeChapter}`;
    const isConsecutive = sorted.every(
      (v, i) => i === 0 || v === sorted[i - 1] + 1
    );
    if (isConsecutive) {
      return sorted.length === 1
        ? `${activeBook} ${activeChapter}:${sorted[0]}`
        : `${activeBook} ${activeChapter}:${sorted[0]}-${sorted[sorted.length - 1]}`;
    }
    return `${activeBook} ${activeChapter}:${sorted.join(", ")}`;
  }, [activeBook, activeChapter, activeVerses]);

  const handleCopyAndOpenWebViewer = useCallback(async () => {
    window.open("https://biblemapper.com/web/", "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(passageRef);
      showNotification({
        title: "Copied",
        message: `${passageRef} copied to clipboard`,
        color: "green",
      });
    } catch {
      showNotification({
        title: "Error",
        message: "Failed to copy to clipboard",
        color: "red",
      });
    }
  }, [passageRef]);

  const mapUrl = useMemo(() => {
    const ref = `${activeBook} ${activeChapter}`;
    return `https://biblemapper.com/blog/mapfinder/?ref=${encodeURIComponent(ref)}`;
  }, [activeBook, activeChapter]);

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
            color="orange"
            size="lg"
            onClick={handleCopyAndOpenWebViewer}
            title="Copy passage & open WebViewer"
          >
            <IconCopy size={rem(20)} />
          </ActionIcon>
          <ActionIcon
            variant="light"
            color="teal"
            size="lg"
            onClick={() => setMapModalOpened(true)}
            title="View on map"
          >
            <IconMap2 size={rem(20)} />
          </ActionIcon>
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
      <Modal
        opened={mapModalOpened}
        onClose={() => setMapModalOpened(false)}
        title="Bible Maps"
        size="xl"
        styles={{
          body: { padding: 0 },
          header: { paddingLeft: rem(16), paddingRight: rem(16) },
        }}
      >
        <iframe
          src={mapUrl}
          title="BibleMapper PassageBrowser"
          width="100%"
          height="600px"
          style={{ border: "none", display: "block" }}
        />
        <Box p="xs" sx={{ textAlign: "center" }}>
          <Anchor href={mapUrl} target="_blank" rel="noopener noreferrer" size="sm">
            Open in new tab
          </Anchor>
        </Box>
      </Modal>
    </>
  );
};

export default VerseActionToolbar;
