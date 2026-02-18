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
}));

const Verse = ({ verse, text }: { verse: number; text: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { classes, cx } = useStyles();
  const activeVerses = useBibleStore((state) => state.activeVerses);
  const setActiveVerses = useBibleStore((state) => state.setActiveVerses);
  const isActive = activeVerses.includes(verse);
  
  // Track touch state to differentiate tap from scroll
  const [touchStartPos, setTouchStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleVerseClick = () => {
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
      // Check if user was selecting text
      const selection = window.getSelection();
      if (!selection || selection.toString().length === 0) {
        handleVerseClick();
      }
    }
    
    setTouchStartPos(null);
  };

  useEffect(() => {
    if (isActive) {
      ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [isActive]);

  return (
    <Box
      component="div"
      display="flex"
      data-active={isActive}
      className={cx(classes.link, {
        [classes.linkActive]: isActive,
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
      ref={isActive ? ref : null}
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
      >
        {text}
      </Title>
    </Box>
  );
};

export default Verse;
