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
import {
  Suspense,
  lazy,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useMediaQuery } from "@mantine/hooks";
import { useLocation, useNavigate } from "react-router-dom";
import { useBibleStore } from "../store";
import { useAuthStore } from "../stores/authStore";
import { showNotification } from "@mantine/notifications";
import {
  buildBiblePath,
  toBookName,
  toUsfmCode,
} from "../utils/bibleUtils";
import { copyTextToClipboard } from "../utils/clipboard";
import {
  groupRefsByChapter,
  verseNumbersFor,
} from "../utils/verseRefs";
import {
  BIBLE_MAPPER_WEB_URL,
  buildBibleHubUrl,
  buildBibleMapperUrl,
  buildBlbUrl,
  buildShareText,
  buildYouVersionUrl,
  collectSelectedVerseText,
  faviconUrl,
} from "../utils/externalLinks";

// Lazy + gated below on noteModalOpened so TipTap stays out of
// the entry chunk until a note is actually authored.
const AddTagNoteModal = lazy(() => import("./AddTagNoteModal"));

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

const VerseActionToolbar = () => {
  const verseSelection = useBibleStore((state) => state.verseSelection);
  const setVerseSelection = useBibleStore(
    (state) => state.setVerseSelection
  );
  const showAudioPlayer = useBibleStore((state) => state.showAudioPlayer);
  const headerVisible = useBibleStore((state) => state.headerVisible);
  const notes = useBibleStore((state) => state.notes);
  const detailNote = useBibleStore((state) => state.detailNote);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();
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
  const primary = useMemo(() => {
    if (refs.length === 0) return null;
    const first = refs[0];
    return {
      bookId: first.bookId,
      chapter: first.chapter,
      verses: verseNumbersFor(refs, first.bookId, first.chapter),
    };
  }, [refs]);
  const passageRef = useMemo(() => {
    if (refs.length === 0) return "";
    return groupRefsByChapter(refs).map(formatChapterGroup).join("; ");
  }, [refs]);

  // Selected verse text from the note's own data when the
  // selection lives inside a note card — DOM scraping only sees
  // rendered verses, so folded cards shared a partial passage.
  // 'bible'-scope selections still scrape the passage DOM below.
  // `detailNote` covers /notes/:id — that page's note is fetched
  // into local state and never joins `notes`.
  const noteVerseText = useMemo(() => {
    if (!scope || scope === 'bible' || refs.length === 0) {
      return null;
    }
    const note =
      notes.find((n) => n.id === scope) ??
      (detailNote?.id === scope ? detailNote : null);
    if (!note) return null;
    const text = refs
      .map(
        (r) =>
          note.verses
            .find(
              (v) =>
                toUsfmCode(v.book) === r.bookId &&
                v.chapter === r.chapter &&
                v.verse === r.verse
            )
            ?.text.trim() ?? ''
      )
      .filter(Boolean)
      .join(' ');
    return text || null;
  }, [scope, refs, notes, detailNote]);

  const handleShare = useCallback(async () => {
    if (!primary) return;
    const path = buildBiblePath(
      primary.bookId,
      primary.chapter,
      primary.verses,
    );
    const url = `${window.location.origin}${path}`;

    const verseText =
      noteVerseText ?? collectSelectedVerseText(refs, scope);

    const shareText = buildShareText(
      verseText ?? '',
      passageRef,
      url
    );

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
      if (await copyTextToClipboard(shareText)) {
        showNotification({
          title: "Link copied",
          message: `Link to ${passageRef} copied to clipboard`,
          color: "blue",
        });
      } else {
        showNotification({
          title: "Error",
          message: "Failed to copy link",
          color: "red",
        });
      }
    }
  }, [primary, refs, scope, noteVerseText, passageRef]);

  const handleCopyAndOpenWebViewer = useCallback(async () => {
    // Copy first — opening the viewer after a failed copy would
    // send the user to a page with nothing on the clipboard.
    if (!(await copyTextToClipboard(passageRef))) {
      showNotification({
        title: "Error",
        message: "Failed to copy to clipboard",
        color: "red",
      });
      return;
    }
    showNotification({
      title: "Copied",
      message: `${passageRef} copied to clipboard`,
      color: "green",
    });
    window.open(
      BIBLE_MAPPER_WEB_URL,
      "_blank",
      "noopener,noreferrer"
    );
  }, [passageRef]);

  const youVersionUrl = useMemo(
    () =>
      primary
        ? buildYouVersionUrl(
            primary.bookId,
            primary.chapter,
            primary.verses
          )
        : null,
    [primary]
  );

  const bibleHubUrl = useMemo(
    () =>
      primary
        ? buildBibleHubUrl(
            primary.bookId,
            primary.chapter,
            primary.verses[primary.verses.length - 1]
          )
        : null,
    [primary]
  );

  const blbUrl = useMemo(
    () =>
      primary
        ? buildBlbUrl(
            primary.bookId,
            primary.chapter,
            primary.verses[primary.verses.length - 1]
          )
        : null,
    [primary]
  );

  const mapUrl = useMemo(
    () => buildBibleMapperUrl(primary?.bookId ?? null,
      primary?.chapter ?? null),
    [primary]
  );

  const isVisible = refCount > 0;
  // BottomNav (56px) only renders on /bible routes and slides
  // away with MyHeader on downward scroll (headerVisible); on
  // /notes the toolbar would otherwise float mid-screen. The
  // audio player bar (~120px) sits at the bottom on every route.
  const onBibleRoute = location.pathname.startsWith('/bible');
  const bottomOffset = showAudioPlayer
    ? onBibleRoute && headerVisible
      ? 176
      : 120
    : onBibleRoute && headerVisible
      ? 56
      : 0;

  const handleViewInBible = useCallback(() => {
    if (!primary) return;
    void navigate(
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
        <Suspense fallback={null}>
          <AddTagNoteModal
            opened={noteModalOpened}
            onClose={() => setNoteModalOpened(false)}
          />
        </Suspense>
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
          sandbox={
            "allow-scripts allow-same-origin allow-forms " +
            "allow-popups allow-popups-to-escape-sandbox"
          }
          referrerPolicy="no-referrer"
          loading="lazy"
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
