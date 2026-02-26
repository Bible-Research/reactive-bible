import { Box, Navbar, ScrollArea, createStyles, rem } from "@mantine/core";
import { Link } from "react-router-dom";
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
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeBookShort = useBibleStore((state) => state.activeBookShort);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const activeVerses = useBibleStore((state) => state.activeVerses);

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
        <Box style={{ flex: "0 0 185px" }}>
          <ScrollArea h="88vh" className={classes.border}>
            <Link to="/notes/public" className={classes.link}>
              Public Notes
            </Link>
            {getBooks().map((book) => (
              <Link
                className={cx(classes.link, {
                  [classes.linkActive]: activeBook === book.book_name,
                })}
                to={`/bible/${book.book_id}/${activeChapter}`}
                key={book.book_id}
                title={"nav-book-" + book.book_id}
              >
                {book.book_name}
              </Link>
            ))}
          </ScrollArea>
        </Box>
        <Box style={{ flex: "1 0 60px" }}>
          <ScrollArea h="88vh" className={classes.border}>
            {getChapters(activeBook).map((chapter) => (
              <Link
                className={cx(classes.link, {
                  [classes.linkActive]: activeChapter === chapter,
                })}
                to={`/bible/${activeBookShort}/${chapter}`}
                key={chapter}
                title={"nav-chapter-" + chapter}
              >
                {chapter}
              </Link>
            ))}
          </ScrollArea>
        </Box>
        <Box style={{ flex: "1 0 60px" }}>
          <ScrollArea h="88vh">
            {getVerses(activeBook, activeChapter).map((verse) => (
              <Link
                className={cx(classes.link, {
                  [classes.linkActive]: activeVerses.includes(verse),
                })}
                to={`/bible/${activeBookShort}/${activeChapter}/${verse}`}
                onClick={() => setOpened(false)}
                key={verse}
                title={"nav-verse-" + verse}
              >
                {verse}
              </Link>
            ))}
          </ScrollArea>
        </Box>
      </Navbar.Section>
    </Navbar>
  );
};

export default BibleSelector;
