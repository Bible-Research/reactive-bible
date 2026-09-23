import { Box, Text, Title, createStyles } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useBibleStore } from "../store";
import {
  buildBiblePath,
  toUsfmCode,
} from "../utils/bibleUtils";
import {
  refsInclude,
  verseDomId,
  verseNumbersFor,
} from "../utils/verseRefs";
import { useEffect, useRef } from "react";
import type { VerseRef, VerseScope } from "../types";

const useStyles = createStyles((theme) => ({
  link: {
    WebkitTapHighlightColor: "transparent", // Remove tap highlight
    cursor: "pointer",
    transition: "background-color 150ms ease",
  },
  linkReadOnly: {
    cursor: "default",
    WebkitTapHighlightColor: "transparent",
  },
  linkActive: {
    backgroundColor:
      theme.colorScheme === "dark"
        ? theme.colors.dark[5]
        : theme.colors.gray[2],
    color: theme.colorScheme === "dark" ? theme.white : theme.black,
  },
  linkAudioActive: {
    borderLeft: `3px solid ${theme.colors.blue[5]}`,
    backgroundColor:
      theme.colorScheme === 'dark'
        ? theme.fn.rgba(theme.colors.blue[9], 0.15)
        : theme.fn.rgba(theme.colors.blue[1], 0.5),
  },
}));

// Store for tracking the last clicked verse for Shift+click range
// selection. Scoped so ranges never leak between views/cards.
let lastClickedVerse: { scope: VerseScope; ref: VerseRef } | null = null;

const Verse = ({
  book,
  chapter,
  verse,
  text,
  scope,
  folded,
  selectable = true,
}: {
  /** USFM code or book name (notes API gives names). */
  book: string;
  chapter: number;
  verse: number;
  text: string;
  scope: VerseScope;
  folded?: boolean;
  selectable?: boolean;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const { classes, cx } = useStyles();
  const navigate = useNavigate();
  const verseSelection = useBibleStore((state) => state.verseSelection);
  const toggleVerseRef = useBibleStore((state) => state.toggleVerseRef);
  const selectVerseRange = useBibleStore(
    (state) => state.selectVerseRange
  );
  const audioActiveVerse = useBibleStore(
    (state) => state.audioActiveVerse
  );
  const bookId = toUsfmCode(book) ?? book;
  const thisRef: VerseRef = { bookId, chapter, verse };
  const isActive =
    verseSelection?.scope === scope &&
    refsInclude(verseSelection.refs, thisRef);
  const isAudioActive =
    audioActiveVerse !== null &&
    audioActiveVerse.scope === scope &&
    audioActiveVerse.bookId === bookId &&
    audioActiveVerse.chapter === chapter &&
    audioActiveVerse.verse === verse;

  // Track touch state to differentiate tap from scroll
  const touchStartPos = useRef<{ x: number; y: number } | null>(
    null
  );

  // Mobile browsers fire a synthetic `click` after `touchend`.
  // Track handled taps so that click can be ignored — otherwise
  // the selection toggles twice (select then instantly unselect).
  const lastTouchTapRef = useRef(0);

  // Track if verse was just clicked to prevent scroll jump
  const userClickedRef = useRef(false);

  // Bible-scope selection is mirrored into the URL; note-scope
  // selection is ephemeral and never navigates.
  const navigateForSelection = () => {
    const sel = useBibleStore.getState().verseSelection;
    const verses =
      sel && sel.scope === scope
        ? verseNumbersFor(sel.refs, bookId, chapter)
        : [];
    navigate(buildBiblePath(bookId, chapter, verses), {
      replace: true,
    });
  };

  const handleVerseClick = (event: React.MouseEvent) => {
    if (!selectable) return;

    // Ignore the synthetic click fired after a handled touch tap
    if (Date.now() - lastTouchTapRef.current < 700) return;

    // Only handle click if no text is selected (allow users to copy text)
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0 && !event.shiftKey) {
      return;
    }

    userClickedRef.current = true;

    // Shift+click for range selection — only within the same scope
    // and same book/chapter.
    const anchor = lastClickedVerse;
    if (
      event.shiftKey &&
      anchor !== null &&
      anchor.scope === scope &&
      anchor.ref.bookId === bookId &&
      anchor.ref.chapter === chapter
    ) {
      // Clear any text selection
      window.getSelection()?.removeAllRanges();
      selectVerseRange(scope, anchor.ref, thisRef);
    } else {
      // Normal click - toggle single verse
      toggleVerseRef(scope, thisRef);
      lastClickedVerse = isActive ? null : { scope, ref: thisRef };
    }
    if (scope === 'bible') {
      navigateForSelection();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartPos.current) return;

    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);

    // Only trigger click if movement is minimal (< 10px)
    // This prevents selection during scroll
    if (deltaX < 10 && deltaY < 10) {
      lastTouchTapRef.current = Date.now();
      // Suppress the synthetic click where the browser allows it
      e.preventDefault();
      // Use setTimeout to allow text selection to register
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
          handleTouchClick();
        }
      }, 50);
    }

    touchStartPos.current = null;
  };

  const handleTouchClick = () => {
    if (!selectable) return;
    userClickedRef.current = true;
    // Mobile: simple toggle (no shift-click support)
    toggleVerseRef(scope, thisRef);
    lastClickedVerse = isActive ? null : { scope, ref: thisRef };
    if (scope === 'bible') {
      navigateForSelection();
    }
  };

  useEffect(() => {
    if (isActive && !userClickedRef.current) {
      // Only scroll if verse was selected programmatically
      // (e.g., from notes view), not by user click
      ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    // Reset the flag after effect runs
    userClickedRef.current = false;
  }, [isActive]);

  useEffect(() => {
    if (isAudioActive) {
      ref.current?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    }
  }, [isAudioActive]);

  return (
    <Box
      component="div"
      display="flex"
      data-active={isActive}
      data-audio-active={isAudioActive}
      className={cx({
        [classes.link]: selectable,
        [classes.linkReadOnly]: !selectable,
        [classes.linkActive]: selectable && isActive,
        [classes.linkAudioActive]: isAudioActive,
      })}
      py={7}
      px={10}
      onClick={(e) => {
        handleVerseClick(e);
      }}
      onMouseDown={(e) => {
        // Prevent text selection when shift-clicking
        if (e.shiftKey) {
          e.preventDefault();
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => e.preventDefault()} // Prevent context menu
      id={verseDomId(scope, thisRef)}
      ref={ref}
      sx={{
        touchAction: "pan-y", // Allow vertical scrolling
      }}
    >
      <Text
        fz="sm"
        fw="bold"
        mr={3}
        sx={{
          userSelect: "none", // Keep verse number non-selectable
          WebkitUserSelect: "none",
        }}
      >
        {verse}
      </Text>
      <Title
        order={3}
        weight={400}
        title={`passage-verse-${chapter}-${verse}`}
        sx={folded ? {
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          minWidth: 0,
          flex: 1,
        } : undefined}
      >
        {text}
      </Title>
    </Box>
  );
};

export default Verse;
