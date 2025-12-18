import { useState, useEffect } from "react";
import { ScrollArea, Center, Loader } from "@mantine/core";
import { useBibleStore } from "../store";
import { getVersesInChapter } from "../api";
import Verse from "./Verse";

const PassageView = () => {
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const bibleVersion = useBibleStore((state) => state.bibleVersion);
  const [verses, setVerses] = useState<{ verse: number; text: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getVersesInChapter(activeBook, activeChapter, bibleVersion)
      .then((result) => {
        setVerses(result);
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setLoading(false);
      });
  }, [activeBook, activeChapter, bibleVersion]);

  if (loading) {
    return (
      <Center h="80vh">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <ScrollArea h="80vh">
      {verses.map((verse) => (
        <Verse verse={verse.verse} key={verse.verse} text={verse.text} />
      ))}
    </ScrollArea>
  );
};

export default PassageView;
