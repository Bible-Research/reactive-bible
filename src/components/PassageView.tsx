import React, { useState, useEffect } from "react";
import {
  ScrollArea,
  Center,
  Loader,
  Box,
  Alert,
  Text,
  Stack,
  Title,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useBibleStore, type Translation } from "../store";
import {
  getVersesInChapter,
  prefetchAudioUrl,
  prefetchAdjacentChapters,
  type SectionHeading,
} from "../api";
import Verse from "./Verse";
import SectionHeadingComponent from "./SectionHeading";
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
  const [verses, setVerses] = useState<
    { verse: number; text: string }[]
  >([]);
  const [headings, setHeadings] = useState<SectionHeading[]>([]);
  const [headingsOnlyMode, setHeadingsOnlyMode] = useState(false);
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

  const handleTocHeadingClick = (beforeVerse: number) => {
    setHeadingsOnlyMode(false);
    setTimeout(() => {
      document
        .getElementById(`section-heading-${beforeVerse}`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 50);
  };

  useEffect(() => {
    if (!activeTextFilesetId) return;

    setHeadingsOnlyMode(false);
    setLoading(true);
    setFetchError(null);
    getVersesInChapter(activeBook, activeChapter, activeTextFilesetId)
      .then((result) => {
        setVerses(result.verses);
        setHeadings(result.headings);
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
        setHeadings([]);
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
      <ScrollArea h="calc(100vh - 112px)">
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

  if (headingsOnlyMode && headings.length > 0) {
    return (
      <ScrollArea h="calc(100vh - 112px)">
        <Box pb={showAudioPlayer ? 120 : 0} px={10} pt="md">
          <Title order={5} color="dimmed" mb="xs">
            {activeBook} {activeChapter} — Section Outline
          </Title>
          {headings.map((heading) => (
            <SectionHeadingComponent
              key={heading.before_verse}
              text={heading.text}
              onClick={() =>
                handleTocHeadingClick(heading.before_verse)
              }
            />
          ))}
        </Box>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea h="calc(100vh - 112px)">
      <Box pb={showAudioPlayer ? 120 : 0}>
        {verses.map((verse) => {
          const heading = headings.find(
            (h) => h.before_verse === verse.verse
          );
          return (
            <React.Fragment key={verse.verse}>
              {heading && (
                <SectionHeadingComponent
                  text={heading.text}
                  id={`section-heading-${heading.before_verse}`}
                  onClick={() => setHeadingsOnlyMode(true)}
                />
              )}
              <Verse
                verse={verse.verse}
                text={verse.text}
              />
            </React.Fragment>
          );
        })}
        <CopyrightNotice />
      </Box>
    </ScrollArea>
  );
};

export default React.memo(PassageView);
