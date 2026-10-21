// Leaf import: keeps the network/cache barrel out of pure ref
// parsing (bundle-split friendly).
import {
  getBooks,
  getChapters,
  getVerses,
} from '../api/structure';
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

  // Range validation against the bundled structure data — the
  // same source parseMentionQuery uses, so a stored '@' token
  // and a typed mention agree on what is in range.
  const chapter = Number(chapterStr);
  const start = Number(startStr);
  const end = endStr !== undefined ? Number(endStr) : null;
  const where = `${bookEntry.book_name} ${chapter}`;

  if (!getChapters(bookEntry.book_id).includes(chapter)) {
    return {
      ok: false,
      error: `No chapter ${chapter} in ${bookEntry.book_name}`,
    };
  }
  const chapterVerses = getVerses(bookEntry.book_id, chapter);
  if (!chapterVerses.includes(start)) {
    return { ok: false, error: `No verse ${start} in ${where}` };
  }
  if (end !== null && !chapterVerses.includes(end)) {
    return { ok: false, error: `No verse ${end} in ${where}` };
  }
  if (end !== null && end < start) {
    return {
      ok: false,
      error: `Invalid verse range ${start}-${end}`,
    };
  }

  return {
    ok: true,
    ref: {
      book: bookEntry.book_name,
      chapter,
      verses: endStr
        ? findVersesInBetween(startStr, endStr)
        : [start],
    },
  };
};
