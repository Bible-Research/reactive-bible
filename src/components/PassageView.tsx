import React, { useState, useEffect } from "react";
import { ScrollArea, Center, Loader, Box } from "@mantine/core";
import { useBibleStore } from "../store";
import {
  getVersesInChapter,
  prefetchAudioUrl,
  prefetchAdjacentChapters,
} from "../api";
import Verse from "./Verse";
import { shallow } from 'zustand/shallow';

const PassageView = () => {
  const {
    activeBook,
    activeChapter,
    activeTextFilesetId,
    activeAudioFilesetId,
    showAudioPlayer,
  } = useBibleStore(
    (state) => ({
      activeBook: state.activeBook,
      activeChapter: state.activeChapter,
      activeTextFilesetId: state.activeTextFilesetId,
      activeAudioFilesetId: state.activeAudioFilesetId,
      showAudioPlayer: state.showAudioPlayer,
    }),
    shallow
  );
  const [verses, setVerses] = useState<{ verse: number; text: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeTextFilesetId) return;

    setLoading(true);
    getVersesInChapter(activeBook, activeChapter, activeTextFilesetId)
      .then((result) => {
        setVerses(result);
        setLoading(false);

        // Prefetch current chapter audio (parallel)
        prefetchAudioUrl(activeBook, activeChapter, activeAudioFilesetId);

        // Prefetch next chapter audio (parallel)
        prefetchAudioUrl(activeBook, activeChapter + 1, activeAudioFilesetId);

        // Prefetch adjacent chapters (parallel)
        prefetchAdjacentChapters(
          activeBook,
          activeChapter,
          activeTextFilesetId
        );
      })
      .catch((error) => {
        console.error(error);
        setLoading(false);
      });
  }, [activeBook, activeChapter, activeTextFilesetId, activeAudioFilesetId]);

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

export default React.memo(PassageView);
