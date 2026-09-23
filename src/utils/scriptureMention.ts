import { getBooks, getChapters, getVerses } from '../api';
import { BOOK_NAME_TO_CODE } from './bibleUtils';

export interface ParsedMention {
  /** Canonical book_name (e.g. "John") once uniquely resolved. */
  bookName: string | null;
  /** Book names matching the typed prefix — drives the Books column. */
  bookMatches: string[];
  chapter: number | null;
  verseStart: number | null;
  verseEnd: number | null;
  /** True only for a complete, in-range ref. */
  complete: boolean;
  /** 'Unknown book', 'No chapter 99 in John', … — red line in popup. */
  error: string | null;
}

interface BookEntry {
  book_name: string;
  book_id: string;
}

// getBooks() scans all of kjv.json — memoize once.
let booksCache: BookEntry[] | null = null;
export const getAllBooks = (): BookEntry[] => {
  if (!booksCache) booksCache = getBooks();
  return booksCache;
};

// "1 Corinthians" -> "1corinthians"; '+' escapes spaces in book names.
const compact = (s: string): string =>
  s.toLowerCase().replace(/[\s+]+/g, '');

const bookMatchesFor = (query: string): BookEntry[] => {
  const q = compact(query);
  if (!q) return getAllBooks();
  return getAllBooks().filter(
    (b) =>
      compact(b.book_name).startsWith(q) ||
      b.book_id.toLowerCase().startsWith(q),
  );
};

const exactBook = (query: string): BookEntry | undefined => {
  const q = compact(query);
  return getAllBooks().find(
    (b) =>
      compact(b.book_name) === q || b.book_id.toLowerCase() === q,
  );
};

/**
 * Book list filter for the Books column while the user is typing
 * a name/code prefix. Empty query -> all books.
 */
export const matchBookNames = (query: string): string[] =>
  bookMatchesFor(query).map((b) => b.book_name);

const emptyParsed = (): ParsedMention => ({
  bookName: null,
  bookMatches: getAllBooks().map((b) => b.book_name),
  chapter: null,
  verseStart: null,
  verseEnd: null,
  complete: false,
  error: null,
});

/**
 * Lenient live parser for the text after '@'. ' ', '.' and ':' are
 * equivalent segment separators; '+' escapes spaces inside book
 * names; the longest unique book prefix wins. Chapter/verse bounds
 * are validated against bundled kjv.json via getChapters/getVerses.
 */
export const parseMentionQuery = (raw: string): ParsedMention => {
  const result = emptyParsed();
  const tokens = raw.split(/[ .:]+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return result;

  // Consume as many leading tokens as still prefix-match a book.
  const bookTokens: string[] = [];
  let consumed = 0;
  for (let i = 0; i < tokens.length; i++) {
    const candidate = compact([...bookTokens, tokens[i]].join(' '));
    if (bookMatchesFor(candidate).length === 0) break;
    bookTokens.push(tokens[i]);
    consumed = i + 1;
    // An exact name/code resolves immediately — don't let it
    // swallow a following token (e.g. "john 3" -> book "John", ch 3).
    if (exactBook(candidate)) break;
  }

  if (bookTokens.length === 0) {
    result.error = `Unknown book: ${tokens[0].replaceAll('+', ' ')}`;
    return result;
  }

  const bookStr = compact(bookTokens.join(' '));
  const exact = exactBook(bookStr);
  const prefixMatches = bookMatchesFor(bookStr);

  if (exact) {
    result.bookName = exact.book_name;
  } else if (prefixMatches.length === 1) {
    result.bookName = prefixMatches[0].book_name;
  } else {
    // Ambiguous prefix — filtered list, not an error.
    result.bookMatches = prefixMatches.map((b) => b.book_name);
    return result;
  }

  // getChapters/getVerses key on the USFM book_id, not the name.
  const bookId = exact?.book_id ?? prefixMatches[0].book_id;

  const rest = tokens.slice(consumed);
  const [chapterToken, verseToken, ...extra] = rest;

  if (chapterToken !== undefined) {
    if (!/^\d+$/.test(chapterToken)) {
      result.error = `Invalid chapter: ${chapterToken}`;
      return result;
    }
    const chapter = Number(chapterToken);
    if (!getChapters(bookId).includes(chapter)) {
      result.error =
        `No chapter ${chapter} in ${result.bookName}`;
      return result;
    }
    result.chapter = chapter;
  }

  if (result.chapter !== null && verseToken !== undefined) {
    const partialRange = verseToken.match(/^(\d+)-$/);
    const verseMatch =
      verseToken.match(/^(\d+)(?:-(\d+))?$/) ?? partialRange;
    if (!verseMatch) {
      result.error = `Invalid verse: ${verseToken}`;
      return result;
    }
    const start = Number(verseMatch[1]);
    const end =
      verseMatch[2] !== undefined ? Number(verseMatch[2]) : null;
    const verses = getVerses(bookId, result.chapter);
    const ref = `${result.bookName} ${result.chapter}`;
    if (!verses.includes(start)) {
      result.error = `No verse ${start} in ${ref}`;
      return result;
    }
    if (end !== null && !verses.includes(end)) {
      result.error = `No verse ${end} in ${ref}`;
      return result;
    }
    if (end !== null && end < start) {
      result.error = `Invalid verse range ${start}-${end}`;
      return result;
    }
    result.verseStart = start;
    result.verseEnd = end;
  }

  if (extra.length > 0) {
    result.error = `Unexpected text: ${extra.join(' ')}`;
    return result;
  }

  result.complete =
    result.verseStart !== null && verseToken !== undefined &&
    !/^\d+-$/.test(verseToken);
  return result;
};

// Longest leading 'book.chap.verse[-end]' segment of a '@…' body.
const FULL_REF_PREFIX = /^[a-zA-Z0-9+]+\.\d+[.:]\d+(?:-\d+)?/;

/**
 * True when a '@…' token resolves to a complete, in-range
 * scripture ref. Trailing punctuation after a full ref
 * ('@JHN.3.16.') doesn't invalidate it — callers split it off.
 */
export const isValidScriptureToken = (token: string): boolean => {
  const body = token.startsWith('@') ? token.slice(1) : token;
  const ref = body.match(FULL_REF_PREFIX)?.[0] ?? body;
  return parseMentionQuery(ref).complete;
};

/**
 * Canonical storage token for a parsed ref: '@USFM.C.V[-E]'.
 * Returns null when the ref is not complete enough.
 */
export const buildScriptureToken = (
  p: ParsedMention,
): string | null => {
  if (p.bookName === null || p.chapter === null) return null;
  if (p.verseStart === null) return null;
  const code = BOOK_NAME_TO_CODE[p.bookName.toLowerCase()];
  if (!code) return null;
  const range = p.verseEnd !== null ? `-${p.verseEnd}` : '';
  return `@${code}.${p.chapter}.${p.verseStart}${range}`;
};

/**
 * Human-readable preview: 'John 3:16-18'. Shows the resolved
 * prefix for partial refs ('John 3').
 */
export const formatMentionPreview = (p: ParsedMention): string => {
  if (!p.bookName) return '';
  let out = p.bookName;
  if (p.chapter !== null) {
    out += ` ${p.chapter}`;
    if (p.verseStart !== null) {
      out += `:${p.verseStart}`;
      if (p.verseEnd !== null) out += `-${p.verseEnd}`;
    }
  }
  return out;
};
