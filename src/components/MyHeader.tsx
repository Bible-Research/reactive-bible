import {
  ActionIcon,
  Box,
  Burger,
  Button,
  Center,
  ColorScheme,
  Header,
  Switch,
  Title,
  rem,
  useMantineTheme,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconArrowRight,
  IconMoonStars,
  IconSearch,
  IconSun,
} from "@tabler/icons-react";
import { useState } from "react";
import { useBibleStore } from "../store";
import { getPassage } from "../api";
import AddTagNoteModal from "./AddTagNoteModal";
import Audio from "./Audio";

const MyHeader = ({
  menuOpened,
  setMenuOpened,
  open,
  setBibleSelectorOpened,
  colorScheme,
  toggleColorScheme,
}: {
  menuOpened: boolean;
  setMenuOpened: (opened: boolean) => void;
  open: () => void;
  setBibleSelectorOpened: (opened: boolean) => void;
  colorScheme: ColorScheme;
  toggleColorScheme: () => void;
}) => {
  const theme = useMantineTheme();
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const activeBookShort = useBibleStore((state) => state.activeBookShort);
  const activeBook = useBibleStore((state) => state.activeBook);
  const setActiveBookOnly = useBibleStore((state) => state.setActiveBookOnly);
  const setActiveBookShort = useBibleStore(
    (state) => state.setActiveBookShort
  );
  const setActiveChapter = useBibleStore((state) => state.setActiveChapter);
  const getPassageResult = getPassage();
  const [noteModalOpened, setNoteModalOpened] = useState(false);

  const checkNext = (): number | null => {
    const index = getPassageResult.findIndex(
      (book) =>
        book.book_name === activeBook && book.chapter === activeChapter
    );
    return index === -1 || index === getPassageResult.length - 1
      ? null
      : index;
  };

  const checkPrev = (): number | null => {
    const index = getPassageResult.findIndex(
      (book) =>
        book.book_name === activeBook && book.chapter === activeChapter
    );
    return index === -1 || index === 0 ? null : index;
  };

  const nextHandler = () => {
    const index = checkNext();
    if (index === null) return null;
    if (getPassageResult) {
      const next = getPassageResult[index + 1];
      if (next !== null) {
        setActiveBookOnly(next.book_name);
        setActiveBookShort(next.book_id);
        setActiveChapter(next.chapter);
      }
    }
  };

  const prevHandler = () => {
    const index = checkPrev();
    if (index === null) return null;
    if (getPassageResult) {
      const prev = getPassageResult[index - 1];
      if (prev !== null) {
        setActiveBookOnly(prev.book_name);
        setActiveBookShort(prev.book_id);
        setActiveChapter(prev.chapter);
      }
    }
  };

  return (
    <Header height={56}>
      <Center
        h={56}
        px={10}
        mx="auto"
        sx={{ display: "flex", justifyContent: "space-between" }}
      >
        <Box sx={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Burger
            opened={menuOpened}
            onClick={() => setMenuOpened(!menuOpened)}
            size="sm"
            color={theme.colors.gray[6]}
            title={menuOpened ? "Close menu" : "Open menu"}
          />
          <ActionIcon
            variant="transparent"
            onClick={prevHandler}
            disabled={checkPrev() === null}
            title="prev-passage-button"
          >
            <IconArrowLeft size={rem(20)} />
          </ActionIcon>
          <ActionIcon variant="transparent" onClick={open}>
            <IconSearch size={rem(20)} />
          </ActionIcon>
          <Title
            order={4}
            onClick={() => setBibleSelectorOpened(true)}
            sx={{
              cursor: "pointer",
              "&:hover": {
                textDecoration: "underline",
              },
            }}
          >
            {activeBookShort} {activeChapter}
          </Title>
          <Button variant="transparent" onClick={() => setNoteModalOpened(true)}>
            Add Note
          </Button>
          {noteModalOpened && (
            <AddTagNoteModal
              opened={noteModalOpened}
              onClose={() => setNoteModalOpened(false)}
            />
          )}
          <Audio />
          <Switch
            checked={colorScheme === "dark"}
            onChange={toggleColorScheme}
            size="lg"
            onLabel={
              <IconSun color={theme.white} size="1.25rem" stroke={1.5} />
            }
            offLabel={
              <IconMoonStars
                color={theme.colors.gray[6]}
                size="1.25rem"
                stroke={1.5}
              />
            }
          />
          <ActionIcon
            variant="transparent"
            onClick={nextHandler}
            disabled={checkNext() === null}
            title="next-passage-button"
          >
            <IconArrowRight size={rem(20)} />
          </ActionIcon>
        </Box>
      </Center>
    </Header>
  );
};

export default MyHeader;
