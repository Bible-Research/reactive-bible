import { useEffect, useState } from 'react';
import { Box, Text } from '@mantine/core';
import { getVersesInChapter } from '../api';
import { ScriptureRef } from '../utils/scriptureRef';
import { toUsfmCode } from '../utils/bibleUtils';
import { SectionHeading } from '../types';
import SectionHeadingComponent from './SectionHeading';

// Passage lookups from notes/comments always use ESV
const FILESET_ID = 'ENGESV_API';

type PassageVerse = { verse: number; text: string };

const ScripturePassage = ({
  reference,
}: {
  reference: ScriptureRef;
}) => {
  const { book, chapter, verses } = reference;
  const [passages, setPassages] = useState<PassageVerse[]>([]);
  const [headings, setHeadings] = useState<SectionHeading[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const getPassage = async () => {
      try {
        // reference.book is a display name; the API helper
        // keys on USFM codes.
        const res = await getVersesInChapter(
          toUsfmCode(book) ?? book, chapter, FILESET_ID
        );
        if (cancelled) return;
        setPassages(
          res.verses.filter((v) => verses.includes(v.verse))
        );
        setHeadings(
          res.headings.filter((h) =>
            verses.includes(h.before_verse)
          )
        );
      } catch (err) {
        console.error('Failed to load passage', err);
        if (!cancelled) setError('Failed to load passage');
      }
    };

    void getPassage();

    return () => {
      cancelled = true;
    };
  }, [book, chapter, verses]);

  if (error) {
    return <Text color="red">{error}</Text>;
  }

  return (
    <Box data-testid="passage-container">
      <h1>
        {book} {chapter}
      </h1>
      {passages.map((passage) => {
        const heading = headings.find(
          (h) => h.before_verse === passage.verse
        );
        return (
          <Box key={passage.verse}>
            {heading && (
              <SectionHeadingComponent text={heading.text} />
            )}
            <Text>
              {passage.verse}
              {'. '}
              {passage.text}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

export default ScripturePassage;
