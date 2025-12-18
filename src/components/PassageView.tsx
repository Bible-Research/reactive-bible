import { useState, useEffect } from "react";
import { ScrollArea } from "@mantine/core";
import { useBibleStore } from "../store";
import { getVersesInChapter } from "../api";
import Verse from "./Verse";

const PassageView = () => {
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const bibleVersion = useBibleStore((state) => state.bibleVersion);
  const [verses, setVerses] = useState<{ verse: number; text: string }[]>([]);

  useEffect(() => {
    getVersesInChapter(activeBook, activeChapter, bibleVersion)
      .then((result) => setVerses(result))
      .catch((error) => console.error(error));
  }, [activeBook, activeChapter, bibleVersion]);

  return (
    <ScrollArea h="80vh">
      {verses.map((verse) => (
        <Verse verse={verse.verse} key={verse.verse} text={verse.text} />
      ))}
    </ScrollArea>
  );
};

export default PassageView;
