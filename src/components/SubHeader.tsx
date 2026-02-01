import { ActionIcon, Box, Title, rem } from "@mantine/core";
import { IconArrowLeft, IconArrowRight, IconSearch } from "@tabler/icons-react";
import { Button } from "@mantine/core";
import { useBibleStore } from "../store";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getPassage } from "../api";
import AddTagNoteModal from "./AddTagNoteModal";
import Audio from "./Audio";

interface SubHeaderProps {
  open?: () => void;
}

const SubHeader = ({ open }: SubHeaderProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const activeBookShort = useBibleStore((state) => state.activeBookShort);
  const activeBook = useBibleStore((state) => state.activeBook);
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
        navigate(`/bible/${next.book_id}/${next.chapter}`);
      }
    }
  };
  const prevHandler = () => {
    const index = checkPrev();
    if (index === null) return null;
    if (getPassageResult) {
      const prev = getPassageResult[index - 1];
      if (prev !== null) {
        navigate(`/bible/${prev.book_id}/${prev.chapter}`);
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
      {open && (
        <ActionIcon variant="transparent" onClick={open}>
          <IconSearch size={rem(20)} />
        </ActionIcon>
      )}
      <Title order={4}>
        {activeBookShort} {activeChapter}
      </Title>
      <Button
        variant="transparent"
        onClick={() => {
          const isNotesView = location.pathname.startsWith("/notes");
          navigate(isNotesView ? `/bible/${activeBookShort}/${activeChapter}` : "/notes");
        }}
      >
        {location.pathname.startsWith("/notes") ? "Bible" : "Notes"}
      </Button>
      <Button variant="transparent" onClick={() => setOpened(true)}>
        Add Note
      </Button>
      {opened && (
        <AddTagNoteModal opened={opened} onClose={() => setOpened(false)} />
      )}
      <Audio />
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
