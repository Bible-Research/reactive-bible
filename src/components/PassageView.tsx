import React, { useState, useEffect, useRef } from "react";
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
  fetchHeadingsOnly,
  prefetchAudioUrl,
  prefetchAdjacentChapters,
  getChapters,
  type SectionHeading,
  RateLimitError,
  ProviderError,
} from "../api";
import Verse from "./Verse";
import SectionHeadingComponent from "./SectionHeading";
import CopyrightNotice from "./CopyrightNotice";
import { shallow } from 'zustand/shallow';
import { useNavigate } from 'react-router-dom';
import {
  getTestament,
  toBookName,
  buildBiblePath,
  filesetCoversTestament,
} from '../utils/bibleUtils';

const PassageView = () => {
  const {
    activeBookId,
    activeChapter,
    activeTextFilesetId,
    activeAudioFilesetId,
    showAudioPlayer,
    translations,
  } = useBibleStore(
    (state) => ({
      activeBookId: state.activeBookId,
      activeChapter: state.activeChapter,
      activeTextFilesetId: state.activeTextFilesetId,
      activeAudioFilesetId: state.activeAudioFilesetId,
      showAudioPlayer: state.showAudioPlayer,
      translations: state.translations,
    }),
    shallow
  );
  const activeBookName = toBookName(activeBookId) ?? activeBookId;
  const [verses, setVerses] = useState<
    { verse: number; text: string }[]
  >([]);
  const [headings, setHeadings] = useState<SectionHeading[]>([]);
  const [headingsOnlyMode, setHeadingsOnlyMode] = useState(false);
  const [tocEntries, setTocEntries] = useState<
    { chapter: number; headings: SectionHeading[] }[]
  >([]);
  const [tocLoading, setTocLoading] = useState(false);
  const pendingScrollHeadingRef = useRef<number | null>(null);
  const tocAbortRef = useRef(false);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRateLimitError, setIsRateLimitError] = useState(false);
  const [isProviderError, setIsProviderError] = useState(false);

  const getTestamentMismatchHint = (
    filesetId: string | null,
    tls: Translation[],
  ): string | null => {
    if (!filesetId || filesetId === 'ENGKJV') return null;
    const testament = getTestament(activeBookId);
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

  const enterHeadingsOnlyMode = async (
    currentHeadings: SectionHeading[]
  ) => {
    tocAbortRef.current = false;
    setHeadingsOnlyMode(true);
    setTocEntries([{ chapter: activeChapter, headings: currentHeadings }]);

    if (!activeTextFilesetId || activeTextFilesetId === 'ENGKJV') return;

    setTocLoading(true);
    const allChapters = getChapters(activeBookId);
    const totalChapters = allChapters.length;

    const forwardEnd = Math.min(activeChapter + 30, totalChapters);
    for (let ch = activeChapter + 1; ch <= forwardEnd; ch++) {
      if (tocAbortRef.current) {
        setTocLoading(false);
        return;
      }
      try {
        const h = await fetchHeadingsOnly(
          activeBookId, ch, activeTextFilesetId
        );
        if (tocAbortRef.current) {
          setTocLoading(false);
          return;
        }
        if (h.length > 0) {
          setTocEntries((prev) => [
            ...prev, { chapter: ch, headings: h },
          ]);
        }
      } catch { /* silent */ }
    }

    const backwardStart = Math.max(activeChapter - 15, 1);
    for (let ch = activeChapter - 1; ch >= backwardStart; ch--) {
      if (tocAbortRef.current) {
        setTocLoading(false);
        return;
      }
      try {
        const h = await fetchHeadingsOnly(
          activeBookId, ch, activeTextFilesetId
        );
        if (tocAbortRef.current) {
          setTocLoading(false);
          return;
        }
        if (h.length > 0) {
          setTocEntries((prev) => [
            ...prev, { chapter: ch, headings: h },
          ]);
        }
      } catch { /* silent */ }
    }

    if (!tocAbortRef.current) {
      setTocLoading(false);
    }
  };

  const handleTocHeadingClick = (
    chapter: number,
    beforeVerse: number
  ) => {
    tocAbortRef.current = true;
    if (chapter === activeChapter) {
      setHeadingsOnlyMode(false);
      setTimeout(() => {
        document
          .getElementById(`section-heading-${beforeVerse}`)
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 50);
    } else {
      pendingScrollHeadingRef.current = beforeVerse;
      setHeadingsOnlyMode(false);
      navigate(buildBiblePath(activeBookId, chapter));
    }
  };

  useEffect(() => {
    if (!activeTextFilesetId) return;

    tocAbortRef.current = true;
    setHeadingsOnlyMode(false);
    setTocEntries([]);
    setTocLoading(false);
    setLoading(true);
    setFetchError(null);
    setIsRateLimitError(false);
    setIsProviderError(false);
    getVersesInChapter(
      activeBookId, activeChapter, activeTextFilesetId
    )
      .then((result) => {
        setVerses(result.verses);
        setHeadings(result.headings);
        setLoading(false);

        const pendingVerse = pendingScrollHeadingRef.current;
        if (pendingVerse !== null) {
          pendingScrollHeadingRef.current = null;
          setTimeout(() => {
            document
              .getElementById(`section-heading-${pendingVerse}`)
              ?.scrollIntoView({ block: "start", behavior: "smooth" });
          }, 50);
        }

        // Prefetch current chapter audio (parallel)
        prefetchAudioUrl(
          activeBookId, activeChapter, activeAudioFilesetId
        );

        // Prefetch next chapter audio (parallel)
        prefetchAudioUrl(
          activeBookId, activeChapter + 1, activeAudioFilesetId
        );

        // Prefetch adjacent chapters (parallel)
        prefetchAdjacentChapters(
          activeBookId,
          activeChapter,
          activeTextFilesetId
        );
      })
      .catch((error) => {
        console.error(error);
        const isRateLimit = error instanceof RateLimitError;
        setIsRateLimitError(isRateLimit);
        setIsProviderError(error instanceof ProviderError);
        setFetchError(
          error instanceof Error ? error.message : 'Failed to load text'
        );
        setVerses([]);
        setHeadings([]);
        setLoading(false);
      });
  }, [activeBookId, activeChapter, activeTextFilesetId, activeAudioFilesetId]);

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
    const rateLimitHint =
      'The translation provider has temporarily rate-limited ' +
      'requests. Please wait a few moments and try again, or ' +
      'switch to KJV which is always available offline.';
    const providerHint =
      'The translation provider could not deliver this ' +
      'text. Its resources are likely exhausted (rate ' +
      'limited). Try again in a few moments, or switch ' +
      'to KJV which is always available offline.';
    const genericHint =
      'Try selecting a different text version in the ' +
      'Translation Settings ("Change Translation" button).';
    return (
      <ScrollArea h="calc(100vh - 112px)">
        <Box p="md">
          <Alert
            icon={<IconAlertCircle size={16} />}
            title={
              isRateLimitError
                ? 'Rate Limit Reached'
                : isProviderError
                ? 'Provider Unavailable'
                : fetchError
                ? 'Failed to load text'
                : `No content for ` +
                  `${activeBookName} ${activeChapter}`
            }
            color={
              isRateLimitError || isProviderError
                ? 'yellow'
                : 'orange'
            }
          >
            <Stack spacing="xs">
              {fetchError && (
                <Text size="sm">{fetchError}</Text>
              )}
              <Text size="sm">
                {isRateLimitError
                  ? rateLimitHint
                  : (mismatchHint ??
                      (isProviderError
                        ? providerHint
                        : genericHint))}
              </Text>
            </Stack>
          </Alert>
        </Box>
      </ScrollArea>
    );
  }

  if (headingsOnlyMode) {
    return (
      <ScrollArea h="calc(100vh - 112px)">
        <Box pb={showAudioPlayer ? 120 : 0} px={10} pt="md">
          <Title order={5} color="dimmed" mb="xs">
            {activeBookName} — Section Outline
          </Title>
          {[...tocEntries]
            .sort((a, b) => a.chapter - b.chapter)
            .map(({ chapter, headings: chHeadings }) => (
            <React.Fragment key={chapter}>
              <Text
                size="xs"
                color="dimmed"
                mt="sm"
                mb={0}
                px={0}
                sx={{ opacity: 0.7, fontWeight: 600 }}
              >
                Chapter {chapter}
              </Text>
              {chHeadings.map((h) => (
                <SectionHeadingComponent
                  key={`${chapter}-${h.before_verse}`}
                  text={h.text}
                  onClick={() =>
                    handleTocHeadingClick(chapter, h.before_verse)
                  }
                />
              ))}
            </React.Fragment>
          ))}
          {tocLoading && (
            <Center py="md">
              <Loader size="sm" />
            </Center>
          )}
        </Box>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea h="calc(100vh - 112px)">
      <Box pb={showAudioPlayer ? 120 : 0} data-verse-scope="bible">
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
                  onClick={() =>
                    void enterHeadingsOnlyMode(headings)
                  }
                />
              )}
              <Verse
                scope="bible"
                book={activeBookId}
                chapter={activeChapter}
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
