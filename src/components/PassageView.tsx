import React, { useState, useEffect } from "react";
import {
  ScrollArea,
  Center,
  Loader,
  Box,
  Alert,
  Text,
  Stack,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useBibleStore, type Translation } from "../store";
import {
  getVersesInChapter,
  prefetchAudioUrl,
  prefetchAdjacentChapters,
} from "../api";
import Verse from "./Verse";
import CopyrightNotice from "./CopyrightNotice";
import { shallow } from 'zustand/shallow';
import {
  getTestamentByBookName,
  filesetCoversTestament,
} from '../utils/bibleUtils';

const PassageView = () => {
  const {
    activeBook,
    activeChapter,
    activeTextFilesetId,
    activeAudioFilesetId,
    showAudioPlayer,
    translations,
  } = useBibleStore(
    (state) => ({
      activeBook: state.activeBook,
      activeChapter: state.activeChapter,
      activeTextFilesetId: state.activeTextFilesetId,
      activeAudioFilesetId: state.activeAudioFilesetId,
      showAudioPlayer: state.showAudioPlayer,
      translations: state.translations,
    }),
    shallow
  );
  const [verses, setVerses] = useState<{ verse: number; text: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const getTestamentMismatchHint = (
    filesetId: string | null,
    tls: Translation[],
  ): string | null => {
    if (!filesetId || filesetId === 'ENGKJV') return null;
    const testament = getTestamentByBookName(activeBook);
    if (!testament) return null;
    const fileset = tls
      .flatMap((t) => t.filesets)
      .find((f) => f.id === filesetId);
    if (!fileset) return null;
    if (filesetCoversTestament(fileset.size, testament)) return null;
    const covered =
      fileset.size.toUpperCase().startsWith('NT')
        ? 'New Testament'
        : 'Old Testament';
    const needed =
      testament === 'OT' ? 'Old Testament' : 'New Testament';
    return (
      `The selected text version (${filesetId}) only covers the ` +
      `${covered}. Try selecting a ${needed} text version in the ` +
      `Translation Settings.`
    );
  };

  useEffect(() => {
    if (!activeTextFilesetId) return;

    setLoading(true);
    setFetchError(null);
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
        setFetchError(
          error instanceof Error ? error.message : 'Failed to load text'
        );
        setVerses([]);
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

  const isNonKjv =
    activeTextFilesetId && activeTextFilesetId !== 'ENGKJV';
  const showEmptyHint =
    isNonKjv && (fetchError !== null || verses.length === 0);

  if (showEmptyHint) {
    const mismatchHint = getTestamentMismatchHint(
      activeTextFilesetId,
      translations,
    );
    const genericHint =
      'Try selecting a different text version in the ' +
      'Translation Settings ("Change Translation" button).';
    return (
      <ScrollArea h="80vh">
        <Box p="md">
          <Alert
            icon={<IconAlertCircle size={16} />}
            title={
              fetchError
                ? 'Failed to load text'
                : `No content for ${activeBook} ${activeChapter}`
            }
            color="orange"
          >
            <Stack spacing="xs">
              {fetchError && (
                <Text size="sm">{fetchError}</Text>
              )}
              <Text size="sm">
                {mismatchHint ?? genericHint}
              </Text>
            </Stack>
          </Alert>
        </Box>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea h="80vh">
      <Box pb={showAudioPlayer ? 120 : 0}>
        {verses.map((verse) => (
          <Verse verse={verse.verse} key={verse.verse} text={verse.text} />
        ))}
        <CopyrightNotice />
      </Box>
    </ScrollArea>
  );
};

export default React.memo(PassageView);
