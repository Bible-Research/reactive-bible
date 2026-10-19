/* eslint-disable react-refresh/only-export-components --
 * BOOK_TO_BLB_ABBR and the URL/share builders are exported so
 * their pure logic can be unit-tested. */
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
import {
  IconBook,
  IconBookmark,
  IconMap2,
  IconShare,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import { useNavigate } from "react-router-dom";
import { useBibleStore } from "../store";
import { useAuthStore } from "../stores/authStore";
import { showNotification } from "@mantine/notifications";
import AddTagNoteModal from "./AddTagNoteModal";
import {
  buildBiblePath,
  toBookName,
} from "../utils/bibleUtils";
import {
  groupRefsByChapter,
  verseNumbersFor,
} from "../utils/verseRefs";


export const BOOK_TO_BLB_ABBR: Record<string, string> = {
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

const faviconUrl = (domain: string) =>
  `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;

/** A single-chapter selection group — the primary ref used by
 *  the external-link and share builders. */
export interface PrimaryChapterRef {
  bookId: string;
  chapter: number;
  verses: number[];
}

const formatChapterGroup = (group: PrimaryChapterRef): string => {
  const sorted = group.verses;
  const label =
    `${toBookName(group.bookId) ?? group.bookId} ` +
    `${group.chapter}`;
  if (sorted.length === 0) return label;
  const isConsecutive = sorted.every(
    (v, i) => i === 0 || v === sorted[i - 1] + 1
  );
  if (isConsecutive) {
    return sorted.length === 1
      ? `${label}:${sorted[0]}`
      : `${label}:${sorted[0]}-${sorted[sorted.length - 1]}`;
  }
  return `${label}:${sorted.join(", ")}`;
};

/** YouVersion compare URL — `bookId` is the USFM code. */
export const buildYouVersionUrl = (
  primary: PrimaryChapterRef
): string => {
  const sorted = primary.verses;
  const verseStr =
    sorted.length === 1
      ? `${sorted[0]}`
      : `${sorted[0]}-${sorted[sorted.length - 1]}`;
  return (
    "https://www.bible.com/bible/compare/" +
    `${primary.bookId}.${primary.chapter}.${verseStr}`
  );
};

/** BibleHub commentary URL — `bookName` is the display name. */
export const buildBibleHubUrl = (
  bookName: string,
  chapter: number,
  verse: number
): string => {
  const bookPath =
    bookName === "Song of Solomon"
      ? "songs"
      : bookName.toLowerCase().replace(/ /g, "_");
  return (
    `https://biblehub.com/${bookPath}/` +
    `${chapter}-${verse}.htm#commentary`
  );
};

/** Blue Letter Bible KJV URL; null when the book has no BLB
 *  abbreviation in `BOOK_TO_BLB_ABBR`. */
export const buildBlbUrl = (
  bookName: string,
  chapter: number,
  verse: number
): string | null => {
  const abbr = BOOK_TO_BLB_ABBR[bookName];
  if (!abbr) return null;
  return (
    `https://www.blueletterbible.org/kjv/${abbr}/` +
    `${chapter}/${verse}/`
  );
};

/** BibleMapper mapfinder URL scoped to the chapter, or the
 *  generic mapfinder page when no passage is selected. */
export const buildMapUrl = (
  bookName: string | null,
  chapter: number | null
): string => {
  if (!bookName || chapter === null) {
    return "https://biblemapper.com/blog/mapfinder/";
  }
  const ref = `${bookName} ${chapter}`;
  return (
    "https://biblemapper.com/blog/mapfinder/?ref=" +
    encodeURIComponent(ref)
  );
};

/** Shared text for navigator.share and the clipboard fallback.
 *  Verse text is DOM-scraped and may be empty — then the body
 *  falls back to the bare passage reference. */
export const buildShareText = (
  verseText: string,
  passageRef: string,
  url: string
): string => {
  const body = verseText
    ? `${verseText}\n\n${passageRef}`
    : passageRef;
  return `${body}\n\n${url}`;
};

const VerseActionToolbar = () => {
  const verseSelection = useBibleStore((state) => state.verseSelection);
  const setVerseSelection = useBibleStore(
    (state) => state.setVerseSelection
  );
  const showAudioPlayer = useBibleStore((state) => state.showAudioPlayer);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [noteModalOpened, setNoteModalOpened] = useState(false);
  const [mapModalOpened, setMapModalOpened] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const navigate = useNavigate();
  const theme = useMantineTheme();
  const faviconStyle = {
    width: rem(28),
    height: rem(28),
    mixBlendMode: (
      theme.colorScheme === "dark" ? "screen" : "multiply"
    ) as React.CSSProperties["mixBlendMode"],
  };

  const scope = verseSelection?.scope;
  const refs = useMemo(
    () => verseSelection?.refs ?? [],
    [verseSelection]
  );
  const refCount = refs.length;

  // The primary group is the first ref's book/chapter — share URLs
  // and external links are single-chapter formats.
  const primary = useMemo((): PrimaryChapterRef | null => {
    if (refs.length === 0) return null;
    const first = refs[0];
    return {
      bookId: first.bookId,
      chapter: first.chapter,
      verses: verseNumbersFor(refs, first.bookId, first.chapter),
    };
  }, [refs]);
  const primaryBookName = primary
    ? toBookName(primary.bookId) ?? primary.bookId
    : null;

  const passageRef = useMemo(() => {
    if (refs.length === 0) return "";
    return groupRefsByChapter(refs).map(formatChapterGroup).join("; ");
  }, [refs]);

  const handleShare = useCallback(async () => {
    if (!primary) return;
    const path = buildBiblePath(
      primary.bookId,
      primary.chapter,
      primary.verses,
    );
    const url = `${window.location.origin}${path}`;

    const verseText = refs
      .map((r) => {
        const el = document.querySelector(
          `[data-verse-scope="${scope}"] ` +
          `[title="passage-verse-${r.chapter}-${r.verse}"]`
        );
        return el?.textContent?.trim() ?? "";
      })
      .filter(Boolean)
      .join(" ");

    const shareText = buildShareText(verseText, passageRef, url);

    if (navigator.share) {
      try {
        await navigator.share({
          title: passageRef,
          text: shareText,
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
      try {
        await navigator.clipboard.writeText(shareText);
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
  }, [primary, refs, scope, passageRef]);

  const handleCopyAndOpenWebViewer = useCallback(async () => {
    window.open(
      "https://biblemapper.com/web/",
      "_blank",
      "noopener,noreferrer"
    );
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

  const youVersionUrl = useMemo(
    () => (primary ? buildYouVersionUrl(primary) : null),
    [primary]
  );

  const bibleHubUrl = useMemo(() => {
    if (!primary || !primaryBookName) return null;
    const verse = primary.verses[primary.verses.length - 1];
    if (verse == null) return null;
    return buildBibleHubUrl(
      primaryBookName,
      primary.chapter,
      verse
    );
  }, [primary, primaryBookName]);

  const blbUrl = useMemo(() => {
    if (!primary || !primaryBookName) return null;
    const verse = primary.verses[primary.verses.length - 1];
    if (verse == null) return null;
    return buildBlbUrl(primaryBookName, primary.chapter, verse);
  }, [primary, primaryBookName]);

  const mapUrl = useMemo(
    () =>
      buildMapUrl(
        primaryBookName,
        primary ? primary.chapter : null
      ),
    [primary, primaryBookName]
  );

  const isVisible = refCount > 0;
  const bottomOffset = showAudioPlayer ? 176 : 56;

  const handleViewInBible = useCallback(() => {
    if (!primary) return;
    navigate(
      buildBiblePath(
        primary.bookId,
        primary.chapter,
        primary.verses,
      )
    );
  }, [primary, navigate]);

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
            onClick={() => setVerseSelection(null)}
            title="Clear selection"
          >
            <IconX size={rem(18)} />
          </ActionIcon>
          <Text size="sm">
            {refCount} verse
            {refCount !== 1 ? "s" : ""} selected
          </Text>
        </Group>
        <Group
          spacing="xs"
          sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}
        >
          {scope !== 'bible' && (
            <ActionIcon
              variant="light"
              color="indigo"
              size="lg"
              onClick={handleViewInBible}
              title="View in Bible"
            >
              <IconBook size={rem(20)} />
            </ActionIcon>
          )}
          <ActionIcon
            variant="transparent"
            size="lg"
            onClick={handleCopyAndOpenWebViewer}
            title="Copy passage & open WebViewer"
          >
            <img
              src={faviconUrl("biblemapper.com")}
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
                src={faviconUrl("biblehub.com")}
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
                src={faviconUrl("blueletterbible.org")}
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
          {isAuthenticated && (
            <ActionIcon
              variant="light"
              color="blue"
              size="lg"
              onClick={() => setNoteModalOpened(true)}
              title="Add note"
            >
              <IconBookmark size={rem(20)} />
            </ActionIcon>
          )}
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
          <Anchor
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
          >
            Open in new tab
          </Anchor>
        </Box>
      </Modal>
    </>
  );
};

export default VerseActionToolbar;
