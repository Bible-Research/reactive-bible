import { Box, ScrollArea, createStyles, rem } from "@mantine/core";
import { useEffect, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { showNotification } from "@mantine/notifications";
import { getChapters, getVerses } from "../api/structure";
import { getAllBooks } from "../utils/scriptureMention";
import { useActiveStructure } from "../hooks/useBookName";
import { useBibleStore } from "../store";
import { findTranslationByFilesetId } from "../utils/filesetGroups";
import {
  chaptersFor,
  isBookCovered,
} from "../utils/bookNameRegistry";

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

  // Book rows only: localized names ("Pāvila 2. vēstule
  // korintiešiem") exceed the 185px column — wrap across
  // lines with content-driven height instead of clipping.
  // Composed AFTER `link` (cx order) so these win.
  linkBook: {
    height: "auto",
    minHeight: rem(30),
    lineHeight: 1.25,
    whiteSpace: "normal",
    overflowWrap: "break-word",
    paddingTop: rem(4),
    paddingBottom: rem(4),
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

  // Uncovered books: dimmed but still a real <button> — the
  // `disabled` attribute would swallow the click that shows
  // the "not included" notification.
  linkDimmed: {
    opacity: 0.4,
  },
}));

/**
 * Enter/Space activates a picker row; Space must not scroll the
 * column. The Shift state is forwarded so Shift+Enter can extend
 * a verse range like shift+click does.
 */
const activateOnKeyDown = (
  event: KeyboardEvent,
  action: (shiftKey: boolean) => void,
) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action(event.shiftKey);
  }
};

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
   * Restrict books/chapters to the active structure's
   * coverage. True for navigation pickers — the reader
   * cannot open a book the bible lacks, so uncovered
   * entries dim and refuse with a notification. Citation
   * pickers (mention-, edit-note-) pass false: refs are
   * stored as USFM and stay valid under any translation,
   * so an uncovered book is a legitimate citation target
   * (typed input already parses it).
   */
  restrictToCoverage?: boolean;
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
  restrictToCoverage = true,
  scrollSignal,
  onSelectBook,
  onSelectChapter,
  onSelectVerse,
}: PassagePickerProps) => {
  const { classes, cx } = useStyles();
  const { t } = useTranslation();

  // Bootstrap the active structure — idempotent + in-flight
  // deduped, so all three picker mount points can kick it.
  // Deferred past the commit: a synchronous store write inside
  // a passive effect crashes React's work loop.
  useEffect(() => {
    const t = setTimeout(() => {
      void useBibleStore.getState().loadStructure();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const structure = useActiveStructure();

  /**
   * Books column = canonical 66 order with localized names
   * overlaid. `covered` marks books the active structure
   * actually contains; uncovered books stay rendered but
   * dimmed+clickable (spec: notification, no navigation).
   * `isBookCovered` reads the registry — it still holds the
   * previous structure while a bible-switch fetch is in
   * flight (`structure` === null), so the greying never
   * resets to all-covered mid-swap.
   */
  const books = useMemo(() => {
    const names = new Map(
      (structure?.books ?? []).map((b) => [
        b.book_id,
        b.name,
      ])
    );
    const all = getAllBooks().map((b) => ({
      book_id: b.book_id,
      book_name: names.get(b.book_id) ?? b.book_name,
      covered:
        !restrictToCoverage || isBookCovered(b.book_id),
    }));
    if (!bookFilter) return all;
    const allowed = new Set(bookFilter);
    return all.filter(
      (b) =>
        allowed.has(b.book_name) || allowed.has(b.book_id)
    );
  }, [bookFilter, structure, restrictToCoverage]);

  /**
   * Chapters column = the structure's real coverage when
   * loaded; bundled canon otherwise. Coverage only applies
   * to navigation pickers — a citation picker can reference
   * any canonical chapter. The registry's `chaptersFor`
   * still answers from the previous structure while the
   * switched-to structure is in flight, so the column
   * doesn't flash the bundled canon mid-swap.
   */
  const chapters = useMemo(() => {
    if (!bookId) return [];
    const covered = restrictToCoverage
      ? structure?.books.find(
          (b) => b.book_id === bookId
        )?.chapters ?? chaptersFor(bookId)
      : null;
    if (covered && covered.length > 0) {
      return covered;
    }
    return getChapters(bookId);
  }, [bookId, structure, restrictToCoverage]);

  /**
   * Uncovered-book click: notification, no navigation. Uses
   * the owning translation's display name.
   */
  const notifyNotIncluded = (bookId: string) => {
    const { translations, activeTextFilesetId } =
      useBibleStore.getState();
    const owner = findTranslationByFilesetId(
      activeTextFilesetId,
      translations,
    );
    const translationName =
      owner?.name ?? owner?.abbr ?? t('picker.thisTranslation');
    const bookName =
      books.find((b) => b.book_id === bookId)?.book_name ??
      bookId;
    showNotification({
      title: t('picker.bookNotIncluded'),
      message: t('picker.notIncludedMsg', {
        translation: translationName,
        book: bookName,
      }),
      color: 'yellow',
    });
  };

  const selectBook = (id: string) => {
    const entry = books.find((b) => b.book_id === id);
    if (entry && !entry.covered) {
      notifyNotIncluded(id);
      return;
    }
    onSelectBook(id);
  };

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
              className={cx(classes.link, classes.linkBook, {
                [classes.linkActive]: bookId === b.book_id,
                [classes.linkDimmed]: !b.covered,
              })}
              data-active={bookId === b.book_id || undefined}
              aria-current={bookId === b.book_id || undefined}
              role="button"
              tabIndex={0}
              onClick={() => selectBook(b.book_id)}
              onKeyDown={(event) =>
                activateOnKeyDown(event, () =>
                  selectBook(b.book_id)
                )
              }
              key={b.book_id}
              title={`${titlePrefix}book-${b.book_id}`}
              data-covered={b.covered || undefined}
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
              role="button"
              tabIndex={0}
              onClick={() => onSelectChapter(ch)}
              onKeyDown={(event) =>
                activateOnKeyDown(event, () => onSelectChapter(ch))
              }
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
              role="button"
              tabIndex={0}
              onClick={(event) =>
                onSelectVerse(verse, event.shiftKey)
              }
              onKeyDown={(event) =>
                activateOnKeyDown(event, (shiftKey) =>
                  onSelectVerse(verse, shiftKey)
                )
              }
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
