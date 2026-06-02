import {
  ActionIcon,
  Anchor,
  Box,
  Group,
  Modal,
  Text,
  rem,
} from "@mantine/core";
import { IconBook2, IconBookmark, IconCopy, IconMap2, IconMessage2, IconSearch, IconX } from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useBibleStore } from "../store";
import { showNotification } from "@mantine/notifications";
import AddTagNoteModal from "./AddTagNoteModal";
import { BOOK_NAME_TO_CODE } from "../utils/bibleUtils";

function formatVerseRanges(verses: number[]): string {
  const sorted = [...verses].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(",");
}

const BOOK_TO_BLB_ABBR: Record<string, string> = {
  Genesis: "gen",
  Exodus: "exo",
  Leviticus: "lev",
  Numbers: "num",
  Deuteronomy: "deu",
  Joshua: "jos",
  Judges: "jdg",
  Ruth: "rth",
  "1 Samuel": "1sa",
  "2 Samuel": "2sa",
  "1 Kings": "1ki",
  "2 Kings": "2ki",
  "1 Chronicles": "1ch",
  "2 Chronicles": "2ch",
  Ezra: "ezr",
  Nehemiah: "neh",
  Esther: "est",
  Job: "job",
  Psalms: "psa",
  Proverbs: "pro",
  Ecclesiastes: "ecc",
  "Song of Solomon": "sng",
  Isaiah: "isa",
  Jeremiah: "jer",
  Lamentations: "lam",
  Ezekiel: "eze",
  Daniel: "dan",
  Hosea: "hos",
  Joel: "joe",
  Amos: "amo",
  Obadiah: "oba",
  Jonah: "jon",
  Micah: "mic",
  Nahum: "nah",
  Habakkuk: "hab",
  Zephaniah: "zep",
  Haggai: "hag",
  Zechariah: "zec",
  Malachi: "mal",
  Matthew: "mat",
  Mark: "mar",
  Luke: "luk",
  John: "jhn",
  Acts: "act",
  Romans: "rom",
  "1 Corinthians": "1co",
  "2 Corinthians": "2co",
  Galatians: "gal",
  Ephesians: "eph",
  Philippians: "php",
  Colossians: "col",
  "1 Thessalonians": "1th",
  "2 Thessalonians": "2th",
  "1 Timothy": "1ti",
  "2 Timothy": "2ti",
  Titus: "tit",
  Philemon: "phm",
  Hebrews: "heb",
  James: "jam",
  "1 Peter": "1pe",
  "2 Peter": "2pe",
  "1 John": "1jo",
  "2 John": "2jo",
  "3 John": "3jo",
  Jude: "jde",
  Revelation: "rev",
};

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

  const youVersionUrl = useMemo(() => {
    if (activeVerses.length === 0) return null;
    const bookCode = BOOK_NAME_TO_CODE[activeBook.toLowerCase()];
    if (!bookCode) return null;
    const verseStr = formatVerseRanges(activeVerses);
    return `https://www.bible.com/bible/59/${bookCode}.${activeChapter}.${verseStr}.ESV`;
  }, [activeBook, activeChapter, activeVerses]);

  const bibleHubUrl = useMemo(() => {
    const sorted = [...activeVerses].sort((a, b) => a - b);
    const verse = sorted[sorted.length - 1];
    if (verse == null) return null;
    const bookPath =
      activeBook === "Song of Solomon"
        ? "songs"
        : activeBook.toLowerCase().replace(/ /g, "_");
    return `https://biblehub.com/${bookPath}/${activeChapter}-${verse}.htm#commentary`;
  }, [activeBook, activeChapter, activeVerses]);

  const blbUrl = useMemo(() => {
    const sorted = [...activeVerses].sort((a, b) => a - b);
    const verse = sorted[sorted.length - 1];
    const abbr = BOOK_TO_BLB_ABBR[activeBook];
    if (!abbr || verse == null) return null;
    return `https://www.blueletterbible.org/kjv/${abbr}/${activeChapter}/${verse}/`;
  }, [activeBook, activeChapter, activeVerses]);

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
          bottom: isVisible ? `${bottomOffset}px` : "-200px",
          left: 0,
          right: 0,
          minHeight: rem(56),
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
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: rem(16),
          paddingRight: rem(16),
          paddingTop: rem(8),
          paddingBottom: rem(8),
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
        <Group spacing="xs" sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
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
          {youVersionUrl && (
            <ActionIcon
              variant="light"
              color="grape"
              size="lg"
              onClick={() =>
                window.open(
                  youVersionUrl,
                  "_blank",
                  "noopener,noreferrer"
                )
              }
              title="Open in YouVersion (Bible.com)"
            >
              <IconBook2 size={rem(20)} />
            </ActionIcon>
          )}
          {bibleHubUrl && (
            <ActionIcon
              variant="light"
              color="lime"
              size="lg"
              onClick={() =>
                window.open(
                  bibleHubUrl,
                  "_blank",
                  "noopener,noreferrer"
                )
              }
              title="Commentary on BibleHub"
            >
              <IconMessage2 size={rem(20)} />
            </ActionIcon>
          )}
          {blbUrl && (
            <ActionIcon
              variant="light"
              color="violet"
              size="lg"
              onClick={() =>
                window.open(blbUrl, "_blank", "noopener,noreferrer")
              }
              title="Look up in Blue Letter Bible"
            >
              <IconSearch size={rem(20)} />
            </ActionIcon>
          )}
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
