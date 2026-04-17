import {
  ActionIcon,
  Box,
  Footer,
  Title,
  rem,
} from "@mantine/core";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useBibleStore } from "../store";
import { getPassage } from "../api";

interface BottomNavProps {
  setBibleSelectorOpened: (opened: boolean) => void;
}

const BottomNav = ({ setBibleSelectorOpened }: BottomNavProps) => {
  const navigate = useNavigate();
  const showAudioPlayer = useBibleStore((state) => state.showAudioPlayer);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const activeBookShort = useBibleStore((state) => state.activeBookShort);
  const activeBook = useBibleStore((state) => state.activeBook);
  const setActiveBookShort = useBibleStore((state) => state.setActiveBookShort);
  const [passages, setPassages] = useState<{ book_name: string; book_id: string; chapter: number }[]>([]);

  useEffect(() => {
    getPassage().then(setPassages);
  }, []);

  const checkNext = (): number | null => {
    const index = passages.findIndex(
      (book) => book.book_name === activeBook && book.chapter === activeChapter
    );
    return index === -1 || index === passages.length - 1 ? null : index;
  };

  const checkPrev = (): number | null => {
    const index = passages.findIndex(
      (book) => book.book_name === activeBook && book.chapter === activeChapter
    );
    return index === -1 || index === 0 ? null : index;
  };

  const nextHandler = () => {
    const index = checkNext();
    if (index === null) return;
    if (passages) {
      const next = passages[index + 1];
      if (next) {
        console.log(`🔗 BottomNav Next: /bible/${next.book_name}/${next.chapter}`);
        setActiveBookShort(next.book_id);
        navigate(`/bible/${next.book_name}/${next.chapter}`);
      }
    }
  };

  const prevHandler = () => {
    const index = checkPrev();
    if (index === null) return;
    if (passages) {
      const prev = passages[index - 1];
      if (prev) {
        console.log(`🔗 BottomNav Prev: /bible/${prev.book_name}/${prev.chapter}`);
        setActiveBookShort(prev.book_id);
        navigate(`/bible/${prev.book_name}/${prev.chapter}`);
      }
    }
  };

  return (
    <Footer
      height={56}
      sx={{
        bottom: showAudioPlayer ? '120px' : '0',
        transition: 'bottom 0.3s ease-in-out',
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          gap: "1rem",
        }}
      >
        <ActionIcon
          variant="transparent"
          onClick={prevHandler}
          disabled={checkPrev() === null}
          title="prev-passage-button"
        >
          <IconArrowLeft size={rem(20)} />
        </ActionIcon>
        <Title
          order={4}
          onClick={() => setBibleSelectorOpened(true)}
          sx={{
            cursor: "pointer",
            minWidth: "120px",
            textAlign: "center",
            "&:hover": {
              textDecoration: "underline",
            },
          }}
        >
          {activeBookShort} {activeChapter}
        </Title>
        <ActionIcon
          variant="transparent"
          onClick={nextHandler}
          disabled={checkNext() === null}
          title="next-passage-button"
        >
          <IconArrowRight size={rem(20)} />
        </ActionIcon>
      </Box>
    </Footer>
  );
};

export default BottomNav;
