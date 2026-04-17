import { Box, Navbar, ScrollArea, createStyles, rem, Loader } from "@mantine/core";
import { useEffect, useState } from 'react';
import { useNavigate } from "react-router-dom";
import { getBooks, getChapters, getVerses } from "../api";
import { useBibleStore } from "../store";

const useStyles = createStyles((theme) => ({
  border: {
    borderRight: `${rem(1)} solid ${
      theme.colorScheme === "dark" ? theme.colors.dark[5] : theme.colors.gray[3]
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

const BibleSelector = ({
  opened,
  setOpened,
}: {
  opened: boolean;
  setOpened: (opened: boolean) => void;
}) => {
  const { classes, cx } = useStyles();
  const navigate = useNavigate();
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const activeVerses = useBibleStore((state) => state.activeVerses);
  const setActiveBookShort = useBibleStore((state) => state.setActiveBookShort);

  const [books, setBooks] = useState<{ book_name: string; book_id: string }[]>([]);
  const [chapters, setChapters] = useState<number[]>([]);
  const [verses, setVerses] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  // Load books on mount
  useEffect(() => {
    getBooks().then((data) => {
      setBooks(data);
      setLoading(false);
    });
  }, []);

  // Load chapters when book changes
  useEffect(() => {
    if (activeBook) {
      getChapters(activeBook).then(setChapters);
    }
  }, [activeBook]);

  // Load verses when chapter changes
  useEffect(() => {
    if (activeBook && activeChapter) {
      getVerses(activeBook, activeChapter).then(setVerses);
    }
  }, [activeBook, activeChapter]);

  return (
    <Navbar
      py="sm"
      hiddenBreakpoint="sm"
      hidden={!opened}
      width={{ sm: 320, lg: 320 }}
      sx={{
        overflow: "hidden",
        transition: "width 1000ms ease, min-width 1000ms ease",
      }}
    >
      <Navbar.Section style={{ display: "flex" }}>
        {loading ? (
          <Loader role="progressbar" />
        ) : (
          <>
            <Box style={{ flex: "0 0 185px" }}>
              <ScrollArea h="88vh" className={classes.border}>
                {books.map((book) => (
                  <a
                    className={cx(classes.link, {
                      [classes.linkActive]: activeBook === book.book_name,
                    })}
                    href="/"
                    onClick={(event) => {
                      event.preventDefault();
                      console.log(`🔗 Navigating to: /bible/${book.book_name}/1`);
                      setActiveBookShort(book.book_id);
                      navigate(`/bible/${book.book_name}/1`);
                    }}
                    key={book.book_id}
                    title={"nav-book-" + book.book_id}
                  >
                    {book.book_name}
                  </a>
                ))}
              </ScrollArea>
            </Box>
            <Box style={{ flex: "1 0 60px" }}>
              <ScrollArea h="88vh" className={classes.border}>
                {chapters.map((chapter) => (
                  <a
                    className={cx(classes.link, {
                      [classes.linkActive]: activeChapter === chapter,
                    })}
                    href="/"
                    onClick={(event) => {
                      event.preventDefault();
                      console.log(`🔗 Navigating to: /bible/${activeBook}/${chapter}`);
                      navigate(`/bible/${activeBook}/${chapter}`);
                    }}
                    key={chapter}
                    title={"nav-chapter-" + chapter}
                  >
                    {chapter}
                  </a>
                ))}
              </ScrollArea>
            </Box>
            <Box style={{ flex: "1 0 60px" }}>
              <ScrollArea h="88vh">
                {verses.map((verse) => (
                  <a
                    className={cx(classes.link, {
                      [classes.linkActive]: activeVerses.includes(verse),
                    })}
                    href="/"
                    onClick={(event) => {
                      event.preventDefault();
                      console.log(`🔗 Navigating to: /bible/${activeBook}/${activeChapter}`);
                      // For now, just navigate to chapter (verse highlighting will come later)
                      navigate(`/bible/${activeBook}/${activeChapter}`);
                      setOpened(false);
                    }}
                    key={verse}
                    title={"nav-verse-" + verse}
                  >
                    {verse}
                  </a>
                ))}
              </ScrollArea>
            </Box>
          </>
        )}
      </Navbar.Section>
    </Navbar>
  );
};

export default BibleSelector;
