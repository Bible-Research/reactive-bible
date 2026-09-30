import { getBooks } from '../api';
import { findVersesInBetween } from './findVersesInBetween';

export interface ScriptureRef {
  book: string;
  chapter: number;
  verses: number[];
}

export type ParsedScriptureRef =
  | { ok: true; ref: ScriptureRef }
  | { ok: false; error: string };

export const isSameScriptureRef = (
  a: ScriptureRef | null,
  b: ScriptureRef | null
): boolean =>
  !!a &&
  !!b &&
  a.book === b.book &&
  a.chapter === b.chapter &&
  a.verses.length === b.verses.length &&
  a.verses.every((v, i) => v === b.verses[i]);

// Accepts Book.Chap:Verse or Book.Chap.Verse, optional -EndVerse
const REF_REGEX = /^([a-zA-Z0-9+]+)\.(\d+)[.:](\d+)(?:-(\d+))?$/;

export const parseScriptureRef = (
  hashtag: string
): ParsedScriptureRef => {
  const ref = hashtag.startsWith('@') ? hashtag.slice(1) : hashtag;
  const match = ref.match(REF_REGEX);

  if (!match) {
    return { ok: false, error: 'Invalid scripture format' };
  }

  const [, rawBook, chapterStr, startStr, endStr] = match;
  const bookQuery = rawBook.replaceAll('+', ' ');
  // Resolve USFM book ids (e.g. "JHN") or names (e.g. "John")
  const bookEntry = getBooks().find(
    (b) =>
      b.book_id.toUpperCase() === bookQuery.toUpperCase() ||
      b.book_name.toLowerCase() === bookQuery.toLowerCase()
  );

  if (!bookEntry) {
    return { ok: false, error: `Unknown book: ${bookQuery}` };
  }

  return {
    ok: true,
    ref: {
      book: bookEntry.book_name,
      chapter: Number(chapterStr),
      verses: endStr
        ? findVersesInBetween(startStr, endStr)
        : [Number(startStr)],
    },
  };
};
