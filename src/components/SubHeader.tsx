import {
  ActionIcon,
  Box,
  ColorScheme,
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
import { Button } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useBibleStore } from "../store";
import { useState } from "react";
import { getPassage } from "../api";
import AddTagNoteModal from "./AddTagNoteModal";
import Audio from "./Audio";

interface SubHeaderProps {
  open: () => void;
  setBibleSelectorOpened: (opened: boolean) => void;
  colorScheme: ColorScheme;
  toggleColorScheme: () => void;
}

const SubHeader = ({
  open,
  setBibleSelectorOpened,
  colorScheme,
  toggleColorScheme,
}: SubHeaderProps) => {
  const theme = useMantineTheme();
  const navigate = useNavigate();
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const activeBookShort = useBibleStore((state) => state.activeBookShort);
  const activeBook = useBibleStore((state) => state.activeBook);
  const setActiveBookShort = useBibleStore((state) => state.setActiveBookShort);
  const getPassageResult = getPassage();
  const [opened, setOpened] = useState(false);
  const checkNext = (): number | null => {
    const index = getPassageResult.findIndex(
      (book) => book.book_name === activeBook && book.chapter === activeChapter
    );
    return index === -1 || index === getPassageResult.length - 1 ? null : index;
  };
  const checkPrev = (): number | null => {
    const index = getPassageResult.findIndex(
      (book) => book.book_name === activeBook && book.chapter === activeChapter
    );
    return index === -1 || index === 0 ? null : index;
  };
  const nextHandler = () => {
    const index = checkNext();
    if (index === null) return null;
    if (getPassageResult) {
      const next = getPassageResult[index + 1];
      if (next !== null) {
        console.log(`🔗 Next: /bible/${next.book_name}/${next.chapter}`);
        setActiveBookShort(next.book_id);
        navigate(`/bible/${next.book_name}/${next.chapter}`);
      }
    }
  };
  const prevHandler = () => {
    const index = checkPrev();
    if (index === null) return null;
    if (getPassageResult) {
      const prev = getPassageResult[index - 1];
      if (prev !== null) {
        console.log(`🔗 Prev: /bible/${prev.book_name}/${prev.chapter}`);
        setActiveBookShort(prev.book_id);
        navigate(`/bible/${prev.book_name}/${prev.chapter}`);
      }
    }
  };

  return (
    <Box
      sx={{
        height: rem(15),
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
      mb={20}
    >
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
      <Button variant="transparent" onClick={() => setOpened(true)}>
        Add Note
      </Button>
      {opened && (
        <AddTagNoteModal opened={opened} onClose={() => setOpened(false)} />
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
  );
};

export default SubHeader;
