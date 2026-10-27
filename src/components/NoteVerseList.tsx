import { Box, Text } from "@mantine/core";
import { Note, SectionHeading, Verse as NoteVerse } from "../types";
import Verse from "./Verse";
import SectionHeadingComponent from "./SectionHeading";
import { visibleNoteVerses } from "../utils/noteVerses";

interface NoteVerseListProps {
  note: Note;
  /** Verse selection scope — the note id, or a distinct
   *  `__overlay` scope for the drag overlay so it never shares
   *  DOM ids or selection state with the real card. */
  scope: string;
  folded: boolean;
}

const NoteVerseList = ({
  note,
  scope,
  folded,
}: NoteVerseListProps) => {
  // Use headings from the note (provided by backend)
  const noteHeadings = note.headings || [];

  // The notes API sets error/error_code when the upstream
  // Bible provider fails to resolve verse text.
  const verseError = note.error;

  // Provider text is capped at 500 verses for copyright
  // reasons; render the truncated tail as a notice instead
  // of empty verse rows.
  const {
    verses: displayedVerses,
    truncated: versesTruncated,
  } = visibleNoteVerses(note?.verses);

  // Headings are keyed to the note's first chapter — the
  // backend only fetches headings for `verses[0].chapter` —
  // so a verse number repeated in a later chapter must not
  // pick up the earlier chapter's heading.
  const headingChapter = note.verses?.[0]?.chapter;
  const headingBefore = (
    v: NoteVerse
  ): SectionHeading | undefined =>
    v.chapter === headingChapter
      ? noteHeadings.find(
          (h) => h.before_verse === v.verse
        )
      : undefined;

  const renderVerse = (
    v: NoteVerse,
    foldedVerse = false
  ) => {
    const heading = headingBefore(v);
    return (
      <Box key={`${v.book}-${v.chapter}-${v.verse}`}>
        {heading && (
          <SectionHeadingComponent text={heading.text} />
        )}
        {foldedVerse ? (
          <Verse
            scope={scope}
            book={v.book}
            chapter={v.chapter}
            verse={v.verse}
            text={v.text}
            folded
            selectable={false}
          />
        ) : (
          <Verse
            scope={scope}
            book={v.book}
            chapter={v.chapter}
            verse={v.verse}
            text={v.text}
          />
        )}
      </Box>
    );
  };

  return (
    <Box
      mt={-10}
      sx={{
        position: 'relative',
        zIndex: 0,
        // A folded verse is one unbroken nowrap line; even as
        // a scroll container it still reports that full width
        // as its min-content contribution, which propagates
        // up to the ScrollArea's shrink-to-fit (display:
        // table) wrapper and makes the whole page wider than
        // the screen. The minmax(0, 1fr) track clamps this
        // box's contribution so only the verse row scrolls.
        ...(folded && {
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
        }),
      }}
      data-verse-scope={scope}
    >
      {verseError ? (
        <Text color="red" size="sm" mt={8}>
          {verseError}
          {note.error_code === 'rate_limited'
            ? ' Try reloading in a few moments.'
            : ''}
        </Text>
      ) : folded ? (
        note?.verses?.slice(0, 1).map((v) => renderVerse(v, true))
      ) : (
        <>
          {displayedVerses.map((v) => renderVerse(v))}
          {versesTruncated && (
            <Text color="red" size="sm" mt={8}>
              Cannot display more than 500 verses of the
              Bible due to copyright restrictions.
            </Text>
          )}
        </>
      )}
    </Box>
  );
};

export default NoteVerseList;
