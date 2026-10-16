import { Box, ScrollArea, createStyles, rem } from "@mantine/core";
import { useEffect, useMemo, useRef } from "react";
import { getChapters, getVerses } from "../api/structure";
import { getAllBooks } from "../utils/scriptureMention";

const useStyles = createStyles((theme) => ({
  border: {
    borderRight: `${rem(1)} solid ${
      theme.colorScheme === "dark"
        ? theme.colors.dark[5]
        : theme.colors.gray[3]
    }`,
  },

  link: {
    appearance: "none",
    background: "none",
    border: 0,
    cursor: "pointer",
    font: "inherit",
    ...theme.fn.focusStyles(),
    boxSizing: "border-box",
    display: "block",
    textAlign: "left",
    textDecoration: "none",
    color:
      theme.colorScheme === "dark"
        ? theme.colors.dark[0]
        : theme.colors.gray[7],
    padding: `0 ${theme.spacing.xs}`,
    fontSize: theme.fontSizes.sm,
    marginRight: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
    fontWeight: 500,
    height: rem(30),
    lineHeight: rem(30),

    "&:hover": {
      backgroundColor:
        theme.colorScheme === "dark"
          ? theme.colors.dark[5]
          : theme.colors.gray[1],
      color: theme.colorScheme === "dark" ? theme.white : theme.black,
    },
  },

  linkActive: {
    "&, &:hover": {
      backgroundColor:
        theme.colorScheme === "dark"
          ? theme.colors.dark[5]
          : theme.colors.gray[1],
      color: theme.colorScheme === "dark" ? theme.white : theme.black,
    },
  },
}));

interface PassagePickerProps {
  /** USFM book code (e.g. "JHN"), null when unresolved. */
  bookId: string | null;
  chapter: number | null;
  /** Highlighted verse range. */
  verses: number[];
  /** Restricts the book column to these book names. */
  bookFilter?: string[];
  height?: number | string;
  /** 'nav-' for BibleSelector, 'mention-' for the picker popup. */
  titlePrefix?: string;
  /**
   * Toggling this re-runs the scroll-to-active effects — e.g. when
   * the picker becomes visible again after display:none hid it.
   */
  scrollSignal?: boolean;
  onSelectBook: (bookId: string) => void;
  onSelectChapter: (chapter: number) => void;
  onSelectVerse: (verse: number, extendRange: boolean) => void;
}

const PassagePicker = ({
  bookId,
  chapter,
  verses,
  bookFilter,
  height = "100%",
  titlePrefix = "nav-",
  scrollSignal,
  onSelectBook,
  onSelectChapter,
  onSelectVerse,
}: PassagePickerProps) => {
  const { classes, cx } = useStyles();

  const books = useMemo(() => {
    const all = getAllBooks();
    if (!bookFilter) return all;
    const allowed = new Set(bookFilter);
    return all.filter((b) => allowed.has(b.book_name));
  }, [bookFilter]);

  const chapters = useMemo(
    () => (bookId ? getChapters(bookId) : []),
    [bookId]
  );

  const verseList = useMemo(
    () =>
      bookId && chapter !== null
        ? getVerses(bookId, chapter)
        : [],
    [bookId, chapter]
  );

  // Keep the active item of each column scrolled into view, e.g.
  // typing "@COL" scrolls the Books column to Colossians.
  const booksRef = useRef<HTMLDivElement>(null);
  const chaptersRef = useRef<HTMLDivElement>(null);
  const versesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // scrollIntoView is missing in some DOM impls (happy-dom).
    booksRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [bookId, bookFilter, scrollSignal]);

  useEffect(() => {
    chaptersRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [bookId, chapter, scrollSignal]);

  useEffect(() => {
    versesRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [bookId, chapter, verses, scrollSignal]);

  return (
    <Box
      style={{
        display: "flex",
        overflow: "hidden",
      }}
      h={height}
    >
      <Box
        ref={booksRef}
        style={{ flex: "0 0 185px", overflow: "hidden" }}
      >
        <ScrollArea h="100%" className={classes.border}>
          {books.map((b) => (
            <button
              type="button"
              className={cx(classes.link, {
                [classes.linkActive]: bookId === b.book_id,
              })}
              data-active={bookId === b.book_id || undefined}
              aria-current={bookId === b.book_id || undefined}
              onClick={() => onSelectBook(b.book_id)}
              key={b.book_id}
              title={`${titlePrefix}book-${b.book_id}`}
            >
              {b.book_name}
            </button>
          ))}
        </ScrollArea>
      </Box>
      <Box
        ref={chaptersRef}
        style={{ flex: "1 0 60px", overflow: "hidden" }}
      >
        <ScrollArea h="100%" className={classes.border}>
          {chapters.map((ch) => (
            <button
              type="button"
              className={cx(classes.link, {
                [classes.linkActive]: chapter === ch,
              })}
              data-active={chapter === ch || undefined}
              aria-current={chapter === ch || undefined}
              onClick={() => onSelectChapter(ch)}
              key={ch}
              title={`${titlePrefix}chapter-${ch}`}
            >
              {ch}
            </button>
          ))}
        </ScrollArea>
      </Box>
      <Box
        ref={versesRef}
        style={{ flex: "1 0 60px", overflow: "hidden" }}
      >
        <ScrollArea h="100%">
          {verseList.map((verse) => (
            <button
              type="button"
              className={cx(classes.link, {
                [classes.linkActive]: verses.includes(verse),
              })}
              data-active={verses.includes(verse) || undefined}
              aria-pressed={verses.includes(verse)}
              onClick={(event) => {
                onSelectVerse(verse, event.shiftKey);
              }}
              key={verse}
              title={`${titlePrefix}verse-${verse}`}
            >
              {verse}
            </button>
          ))}
        </ScrollArea>
      </Box>
    </Box>
  );
};

export default PassagePicker;
