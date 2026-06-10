import { Box, Text, Title, createStyles } from "@mantine/core";
import { useBibleStore } from "../store";
import { useEffect, useRef, useState } from "react";

const useStyles = createStyles((theme) => ({
  link: {
    WebkitTapHighlightColor: "transparent", // Remove tap highlight
    cursor: "pointer",
    transition: "background-color 150ms ease",
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

const Verse = ({
  verse,
  text,
  folded,
}: {
  verse: number;
  text: string;
  folded?: boolean;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const { classes, cx } = useStyles();
  const activeVerses = useBibleStore((state) => state.activeVerses);
  const setActiveVerses = useBibleStore((state) => state.setActiveVerses);
  const audioActiveVerse = useBibleStore(
    (state) => state.audioActiveVerse
  );
  const isActive = activeVerses.includes(verse);
  const isAudioActive = audioActiveVerse === verse;
  
  // Track touch state to differentiate tap from scroll
  const [touchStartPos, setTouchStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  
  // Track if verse was just clicked to prevent scroll jump
  const userClickedRef = useRef(false);

  const handleVerseClick = () => {
    userClickedRef.current = true;
    if (isActive) {
      setActiveVerses(activeVerses.filter((v) => v !== verse));
    } else {
      setActiveVerses([...activeVerses, verse]);
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
          handleVerseClick();
        }
      }, 50);
    }
    
    setTouchStartPos(null);
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
      className={cx(classes.link, {
        [classes.linkActive]: isActive,
        [classes.linkAudioActive]: isAudioActive,
      })}
      py={7}
      px={10}
      onClick={() => {
        // Only handle click if no text is selected
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
          handleVerseClick();
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
