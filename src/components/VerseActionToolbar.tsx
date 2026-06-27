import {
  ActionIcon,
  Anchor,
  Box,
  Group,
  Modal,
  Text,
  rem,
  useMantineTheme,
} from "@mantine/core";
import { IconBookmark, IconMap2, IconShare, IconX } from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
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
  const isMobile = useMediaQuery("(max-width: 768px)");
  const location = useLocation();
  const theme = useMantineTheme();
  const faviconStyle = {
    width: rem(28),
    height: rem(28),
    mixBlendMode: (
      theme.colorScheme === "dark" ? "screen" : "multiply"
    ) as React.CSSProperties["mixBlendMode"],
  };

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

  const handleShare = useCallback(async () => {
    const bookEncoded = encodeURIComponent(activeBook);
    const verseParam =
      activeVerses.length > 0
        ? `?v=${formatVerseRanges(activeVerses)}`
        : "";
    const url = `${window.location.origin}/bible/${bookEncoded}/${activeChapter}${verseParam}`;

    const sorted = [...activeVerses].sort((a, b) => a - b);
    const verseText = sorted
      .map((v) => {
        const el = document.querySelector(
          `[title="passage-verse-${v}"]`
        );
        return el?.textContent?.trim() ?? "";
      })
      .filter(Boolean)
      .join(" ");

    const shareBody = verseText
      ? `${verseText}\n\n${passageRef}`
      : passageRef;

    if (navigator.share) {
      try {
        await navigator.share({
          title: passageRef,
          text: `${shareBody}\n\n${url}`,
        });
      } catch (err) {
        if (
          err instanceof Error &&
          err.name !== "AbortError"
        ) {
          showNotification({
            title: "Error",
            message: "Failed to share",
            color: "red",
          });
        }
      }
    } else {
      const clipboardText = verseText
        ? `${verseText}\n\n${passageRef}\n\n${url}`
        : `${passageRef}\n\n${url}`;
      try {
        await navigator.clipboard.writeText(clipboardText);
        showNotification({
          title: "Link copied",
          message: `Link to ${passageRef} copied to clipboard`,
          color: "blue",
        });
      } catch {
        showNotification({
          title: "Error",
          message: "Failed to copy link",
          color: "red",
        });
      }
    }
  }, [activeBook, activeChapter, activeVerses, passageRef]);

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
    return `https://www.bible.com/bible/compare/${bookCode}.${activeChapter}.${verseStr}`;
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
            variant="transparent"
            size="lg"
            onClick={handleCopyAndOpenWebViewer}
            title="Copy passage & open WebViewer"
          >
            <img
              src="https://www.google.com/s2/favicons?sz=64&domain=biblemapper.com"
              alt="BibleMapper"
              style={faviconStyle}
            />
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
              variant="transparent"
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
              <img
                src="https://www.bible.com/apple-touch-icon.png"
                alt="YouVersion"
                style={faviconStyle}
              />
            </ActionIcon>
          )}
          {bibleHubUrl && (
            <ActionIcon
              variant="transparent"
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
              <img
                src="https://www.google.com/s2/favicons?sz=64&domain=biblehub.com"
                alt="BibleHub"
                style={faviconStyle}
              />
            </ActionIcon>
          )}
          {blbUrl && (
            <ActionIcon
              variant="transparent"
              size="lg"
              onClick={() =>
                window.open(blbUrl, "_blank", "noopener,noreferrer")
              }
              title="Look up in Blue Letter Bible"
            >
              <img
                src="https://www.google.com/s2/favicons?sz=64&domain=blueletterbible.org"
                alt="Blue Letter Bible"
                style={faviconStyle}
              />
            </ActionIcon>
          )}
          <ActionIcon
            variant="light"
            color="cyan"
            size="lg"
            onClick={handleShare}
            title="Share this passage"
          >
            <IconShare size={rem(20)} />
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
        fullScreen={isMobile}
        styles={{
          content: isMobile
            ? { display: "flex", flexDirection: "column" }
            : {},
          body: {
            padding: 0,
            ...(isMobile && {
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }),
          },
          header: { paddingLeft: rem(16), paddingRight: rem(16) },
        }}
      >
        <iframe
          src={mapUrl}
          title="BibleMapper PassageBrowser"
          width="100%"
          height={isMobile ? undefined : "600px"}
          style={{
            border: "none",
            display: "block",
            ...(isMobile && { flex: 1, minHeight: 0 }),
          }}
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
