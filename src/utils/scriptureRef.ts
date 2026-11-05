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
  /** null = the whole chapter ('@PSA.18' style refs). */
  verses: number[] | null;
}

export type ParsedScriptureRef =
  | { ok: true; ref: ScriptureRef }
  | { ok: false; error: string };

export const isSameScriptureRef = (
  a: ScriptureRef | null,
  b: ScriptureRef | null
): boolean => {
  if (!a || !b) return false;
  if (a.book !== b.book || a.chapter !== b.chapter) return false;
  const av = a.verses;
  const bv = b.verses;
  if (av === null || bv === null) return av === bv;
  return (
    av.length === bv.length &&
    av.every((v, i) => v === bv[i])
  );
};

// Accepts Book.Chap:Verse or Book.Chap.Verse, optional -EndVerse
const REF_REGEX = /^([a-zA-Z0-9+]+)\.(\d+)[.:](\d+)(?:-(\d+))?$/;
// Chapter-level ref: Book.Chap — the whole chapter is implied.
const CHAPTER_REF_REGEX = /^([a-zA-Z0-9+]+)\.(\d+)$/;

export const parseScriptureRef = (
  hashtag: string
): ParsedScriptureRef => {
  const ref = hashtag.startsWith('@') ? hashtag.slice(1) : hashtag;
  const match = ref.match(REF_REGEX);
  const chapterMatch = match ? null : ref.match(CHAPTER_REF_REGEX);
  const found = match ?? chapterMatch;

  if (!found) {
    return { ok: false, error: 'Invalid scripture format' };
  }

  const rawBook = found[1];
  const chapterStr = found[2];
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
  const where = `${bookEntry.book_name} ${chapter}`;

  if (!getChapters(bookEntry.book_id).includes(chapter)) {
    return {
      ok: false,
      error: `No chapter ${chapter} in ${bookEntry.book_name}`,
    };
  }

  // Chapter-level refs carry no verse list — the whole chapter.
  if (!match) {
    return {
      ok: true,
      ref: { book: bookEntry.book_name, chapter, verses: null },
    };
  }

  const startStr = match[3];
  const endStr = match[4];
  const start = Number(startStr);
  const end = endStr !== undefined ? Number(endStr) : null;
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

/**
 * Canonical storage token for a resolved ref: '@USFM.C.V[-E]',
 * or '@USFM.C' when `verses` is null/empty (whole chapter).
 * Callers keep `verses` contiguous — the token grammar cannot
 * express gaps.
 */
export const buildRefToken = (
  code: string,
  chapter: number,
  verses: number[] | null
): string => {
  if (!verses || verses.length === 0) {
    return `@${code}.${chapter}`;
  }
  const sorted = [...verses].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first === last
    ? `@${code}.${chapter}.${first}`
    : `@${code}.${chapter}.${first}-${last}`;
};
