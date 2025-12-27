import { useState, useEffect } from "react";
import { ScrollArea, Center, Loader, Box } from "@mantine/core";
import { useBibleStore } from "../store";
import {
  getVersesInChapter,
  prefetchAudioUrl,
  prefetchAdjacentChapters,
} from "../api";
import Verse from "./Verse";

const PassageView = () => {
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const bibleVersion = useBibleStore((state) => state.bibleVersion);
  const showAudioPlayer = useBibleStore((state) => state.showAudioPlayer);
  const [verses, setVerses] = useState<{ verse: number; text: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getVersesInChapter(activeBook, activeChapter, bibleVersion)
      .then((result) => {
        setVerses(result);
        setLoading(false);

        // Prefetch current chapter audio (parallel)
        prefetchAudioUrl(
          activeBook,
          activeChapter,
          bibleVersion
        );

        // Prefetch adjacent chapters (parallel)
        prefetchAdjacentChapters(
          activeBook,
          activeChapter,
          bibleVersion
        );
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
      <Box pb={showAudioPlayer ? 120 : 0}>
        {verses.map((verse) => (
          <Verse verse={verse.verse} key={verse.verse} text={verse.text} />
        ))}
      </Box>
    </ScrollArea>
  );
};

export default PassageView;
