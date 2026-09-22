import { Box, ScrollArea, createStyles, rem } from "@mantine/core";
import { useEffect, useMemo, useRef } from "react";
import { getChapters, getVerses } from "../api";
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
    boxSizing: "border-box",
    display: "block",
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
  /** Resolved book_name (e.g. "John"), null when unresolved. */
  book: string | null;
  chapter: number | null;
  /** Highlighted verse range. */
  verses: number[];
  /** Restricts the book column to these book names. */
  bookFilter?: string[];
  height?: number | string;
  /** 'nav-' for BibleSelector, 'mention-' for the picker popup. */
  titlePrefix?: string;
  onSelectBook: (bookName: string) => void;
  onSelectChapter: (chapter: number) => void;
  onSelectVerse: (verse: number, extendRange: boolean) => void;
}

const PassagePicker = ({
  book,
  chapter,
  verses,
  bookFilter,
  height = "100%",
  titlePrefix = "nav-",
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
    () => (book ? getChapters(book) : []),
    [book]
  );

  const verseList = useMemo(
    () => (book && chapter !== null ? getVerses(book, chapter) : []),
    [book, chapter]
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
  }, [book, bookFilter]);

  useEffect(() => {
    chaptersRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [book, chapter]);

  useEffect(() => {
    versesRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [book, chapter, verses]);

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
            <a
              className={cx(classes.link, {
                [classes.linkActive]: book === b.book_name,
              })}
              data-active={book === b.book_name || undefined}
              href="/"
              onClick={(event) => {
                event.preventDefault();
                onSelectBook(b.book_name);
              }}
              key={b.book_id}
              title={`${titlePrefix}book-${b.book_id}`}
            >
              {b.book_name}
            </a>
          ))}
        </ScrollArea>
      </Box>
      <Box
        ref={chaptersRef}
        style={{ flex: "1 0 60px", overflow: "hidden" }}
      >
        <ScrollArea h="100%" className={classes.border}>
          {chapters.map((ch) => (
            <a
              className={cx(classes.link, {
                [classes.linkActive]: chapter === ch,
              })}
              data-active={chapter === ch || undefined}
              href="/"
              onClick={(event) => {
                event.preventDefault();
                onSelectChapter(ch);
              }}
              key={ch}
              title={`${titlePrefix}chapter-${ch}`}
            >
              {ch}
            </a>
          ))}
        </ScrollArea>
      </Box>
      <Box
        ref={versesRef}
        style={{ flex: "1 0 60px", overflow: "hidden" }}
      >
        <ScrollArea h="100%">
          {verseList.map((verse) => (
            <a
              className={cx(classes.link, {
                [classes.linkActive]: verses.includes(verse),
              })}
              data-active={verses.includes(verse) || undefined}
              href="/"
              onClick={(event) => {
                event.preventDefault();
                onSelectVerse(verse, event.shiftKey);
              }}
              key={verse}
              title={`${titlePrefix}verse-${verse}`}
            >
              {verse}
            </a>
          ))}
        </ScrollArea>
      </Box>
    </Box>
  );
};

export default PassagePicker;
