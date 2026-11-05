import { useEffect, useState } from 'react';
import { Box, Text, UnstyledButton } from '@mantine/core';
import { getVersesInChapter } from '../api';
import { ScriptureRef } from '../utils/scriptureRef';
import { toUsfmCode } from '../utils/bibleUtils';
import { SectionHeading } from '../types';
import SectionHeadingComponent from './SectionHeading';

// Passage lookups from notes/comments always use ESV
const FILESET_ID = 'ENGESV_API';

type PassageVerse = { verse: number; text: string };

interface ScripturePassageProps {
  reference: ScriptureRef;
  /**
   * Render every verse of the chapter instead of only the
   * referenced ones — the popover's "Read full chapter" view.
   */
  fullChapter?: boolean;
  /**
   * When set, verses render as toggle buttons (expanded view):
   * the referenced verses stay highlighted and clicking one
   * reports it so the caller can narrow the ref.
   */
  onToggleVerse?: (verse: number) => void;
}

const ScripturePassage = ({
  reference,
  fullChapter = false,
  onToggleVerse,
}: ScripturePassageProps) => {
  const { book, chapter, verses } = reference;
  const [passages, setPassages] = useState<PassageVerse[]>([]);
  const [headings, setHeadings] = useState<SectionHeading[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Reset up front: a transient failure must not brick the
    // preview forever, and a ref change must not flash stale
    // verses while the new passage loads.
    setError(null);
    setPassages([]);
    setHeadings([]);

    const getPassage = async () => {
      try {
        // reference.book is a display name; the API helper
        // keys on USFM codes. The whole chapter is fetched so
        // expanding to "Read full chapter" needs no refetch —
        // the collapsed view filters at render time.
        const res = await getVersesInChapter(
          toUsfmCode(book) ?? book, chapter, FILESET_ID
        );
        if (cancelled) return;
        setPassages(res.verses);
        setHeadings(res.headings);
      } catch (err) {
        console.error('Failed to load passage', err);
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load passage'
          );
        }
      }
    };

    void getPassage();

    return () => {
      cancelled = true;
    };
  }, [book, chapter]);

  if (error) {
    return <Text color="red">{error}</Text>;
  }

  // null verses = a chapter-level ref — everything is shown.
  const shown =
    fullChapter || verses === null
      ? passages
      : passages.filter((v) => verses.includes(v.verse));

  return (
    // No heading of its own — the popover header already
    // carries the 'Book C[:V[-E]]' title.
    <Box data-testid="passage-container">
      {shown.map((passage) => {
        // Several headings may share one anchor — e.g. the
        // ESV Psalm 18 superscription sits at before_verse 1
        // alongside the section heading. Render them all in
        // payload order.
        const passageHeadings = headings.filter(
          (h) => h.before_verse === passage.verse
        );
        const selected =
          verses !== null && verses.includes(passage.verse);
        return (
          <Box key={passage.verse}>
            {passageHeadings.map((h, index) => (
              <SectionHeadingComponent
                key={index}
                text={h.text}
              />
            ))}
            {onToggleVerse ? (
              <UnstyledButton
                onClick={() => onToggleVerse(passage.verse)}
                aria-pressed={selected}
                title={`passage-verse-${chapter}-${passage.verse}`}
                sx={(theme) => ({
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '2px 4px',
                  borderRadius: theme.radius.sm,
                  backgroundColor: selected
                    ? theme.colorScheme === 'dark'
                      ? theme.colors.dark[5]
                      : theme.colors.gray[2]
                    : undefined,
                  '&:hover': {
                    backgroundColor:
                      theme.colorScheme === 'dark'
                        ? theme.colors.dark[4]
                        : theme.colors.gray[1],
                  },
                })}
              >
                <Text>
                  {passage.verse}
                  {'. '}
                  {passage.text}
                </Text>
              </UnstyledButton>
            ) : (
              <Text>
                {passage.verse}
                {'. '}
                {passage.text}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

export default ScripturePassage;
