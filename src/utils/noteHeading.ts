import { Note, Verse } from '../types';

const refText = (v: Verse): string =>
  `${v.book} ${v.chapter}:${v.verse}`;

/**
 * Heading shown on a NoteCard — "John 3:16", "John 3:16-18",
 * "John 3:16-4:2" across chapters, "Genesis 50:26 - Exodus
 * 1:1" across books.
 *
 * Verse-less notes fall back to the tag name; the previous
 * inline logic rendered a bogus " 1:1" for them, and a
 * multi-chapter range produced nonsense like
 * "Genesis 1:31-1" because only the first chapter was used.
 */
export const noteHeading = (note: Note): string => {
  const verses = note.verses ?? [];
  if (verses.length === 0) {
    return note.tag?.name ?? '';
  }

  const first = verses[0];
  const last = verses[verses.length - 1];

  if (
    first.book === last.book &&
    first.chapter === last.chapter &&
    first.verse === last.verse
  ) {
    return refText(first);
  }
  if (first.book === last.book && first.chapter === last.chapter) {
    return (
      `${first.book} ` +
      `${first.chapter}:${first.verse}-${last.verse}`
    );
  }
  if (first.book === last.book) {
    return (
      `${first.book} ` +
      `${first.chapter}:${first.verse}-` +
      `${last.chapter}:${last.verse}`
    );
  }
  return `${refText(first)} - ${refText(last)}`;
};
