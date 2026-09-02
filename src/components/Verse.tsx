import { Box, Text, Title, createStyles } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useBibleStore } from "../store";
import { encodeVerses } from "../utils/bibleUtils";
import { useEffect, useRef, useState } from "react";

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

// Store for tracking the last clicked verse for Shift+click range selection
let lastClickedVerse: number | null = null;

const Verse = ({
  verse,
  text,
  folded,
  selectable = true,
}: {
  verse: number;
  text: string;
  folded?: boolean;
  selectable?: boolean;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const { classes, cx } = useStyles();
  const navigate = useNavigate();
  const activeVerses = useBibleStore((state) => state.activeVerses);
  const setActiveVerses = useBibleStore((state) => state.setActiveVerses);
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const audioActiveVerse = useBibleStore(
    (state) => state.audioActiveVerse
  );
  const isActive = activeVerses.includes(verse);
  const isAudioActive =
    audioActiveVerse !== null &&
    audioActiveVerse.book === activeBook &&
    audioActiveVerse.chapter === activeChapter &&
    audioActiveVerse.verse === verse;
  
  // Track touch state to differentiate tap from scroll
  const [touchStartPos, setTouchStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  
  // Track if verse was just clicked to prevent scroll jump
  const userClickedRef = useRef(false);

  const updateNavigationWithVerses = (verses: number[]) => {
    if (verses.length > 0) {
      navigate(
        `/bible/${activeBook}/${activeChapter}.${encodeVerses(verses)}`,
        { replace: true }
      );
    } else {
      navigate(
        `/bible/${activeBook}/${activeChapter}`,
        { replace: true }
      );
    }
  };

  const handleVerseClick = (event: React.MouseEvent) => {
    if (!selectable) return;
    userClickedRef.current = true;
    
    // Shift+click for range selection
    if (event.shiftKey && lastClickedVerse !== null) {
      const start = Math.min(lastClickedVerse, verse);
      const end = Math.max(lastClickedVerse, verse);
      const rangeVerses: number[] = [];
      for (let v = start; v <= end; v++) {
        rangeVerses.push(v);
      }
      // Merge with existing selection
      const newVerses = Array.from(new Set([...activeVerses, ...rangeVerses])).sort((a, b) => a - b);
      setActiveVerses(newVerses);
      updateNavigationWithVerses(newVerses);
    } else {
      // Normal click - toggle single verse
      const newVerses = isActive
        ? activeVerses.filter((v) => v !== verse)
        : [...activeVerses, verse];
      setActiveVerses(newVerses);
      updateNavigationWithVerses(newVerses);
      lastClickedVerse = isActive ? null : verse;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStartPos({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartPos) return;

    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPos.x);
    const deltaY = Math.abs(touch.clientY - touchStartPos.y);
    
    // Only trigger click if movement is minimal (< 10px)
    // This prevents selection during scroll
    if (deltaX < 10 && deltaY < 10) {
      // Use setTimeout to allow text selection to register
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
          handleTouchClick();
        }
      }, 50);
    }
    
    setTouchStartPos(null);
  };

  const handleTouchClick = () => {
    if (!selectable) return;
    userClickedRef.current = true;
    // Mobile: simple toggle (no shift-click support)
    const newVerses = isActive
      ? activeVerses.filter((v) => v !== verse)
      : [...activeVerses, verse];
    setActiveVerses(newVerses);
    updateNavigationWithVerses(newVerses);
    lastClickedVerse = isActive ? null : verse;
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
      className={cx({
        [classes.link]: selectable,
        [classes.linkReadOnly]: !selectable,
        [classes.linkActive]: selectable && isActive,
        [classes.linkAudioActive]: isAudioActive,
      })}
      py={7}
      px={10}
      onClick={(e) => {
        // Only handle click if no text is selected
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
          handleVerseClick(e);
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => e.preventDefault()} // Prevent context menu
      id={"verse-" + verse}
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
        title={"passage-verse-" + verse}
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
