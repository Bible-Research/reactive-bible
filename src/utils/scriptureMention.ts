// Pure structure lookups — imported from the leaf module so the
// mention parser never pulls the whole api barrel (network
// modules, cache layer) into the editor chunk.
import { getBooks, getChapters, getVerses } from '../api/structure';
import { BOOK_NAME_TO_CODE } from './bibleUtils';

export interface ParsedMention {
  /** Canonical book_name (e.g. "John") once uniquely resolved. */
  bookName: string | null;
  /** Book names matching the typed prefix — drives the Books column. */
  bookMatches: string[];
  chapter: number | null;
  verseStart: number | null;
  verseEnd: number | null;
  /**
   * True for a complete, in-range ref. A book+chapter with no
   * verse counts — '@PSA.18' is a valid whole-chapter ref.
   */
  complete: boolean;
  /** 'Unknown book', 'No chapter 99 in John', … — red line in popup. */
  error: string | null;
}

interface BookEntry {
  book_name: string;
  book_id: string;
}

// getBooks() scans the bundled structure data — memoize once.
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
 * are validated against bundled bibleStructure.json via
 * getChapters/getVerses.
 */
export const parseMentionQuery = (raw: string): ParsedMention => {
  const result = emptyParsed();
  const tokens = raw.split(/[\s.:]+/).filter((t) => t.length > 0);
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

  // Book + chapter alone resolves — verses are optional
  // ('@PSA.18' previews the whole chapter). Every error path
  // above returns early, so reaching here means the ref is
  // storable.
  result.complete = result.chapter !== null;
  return result;
};

// Longest leading 'book.chap.verse[-end]' segment of a '@…'
// body. The lookahead keeps letter/digit suffixes and a
// '.'-started extra segment ('JHN.3.16x', 'JHN.3.16.4') from
// being clipped into a valid prefix — they stay one invalid
// token, matching VALID_REF_PREFIX in scriptureLinkify.
const FULL_REF_PREFIX =
  /^[a-zA-Z0-9+]+\.\d+[.:]\d+(?:-\d+)?(?![a-zA-Z_\d]|\.[a-zA-Z0-9])/;

/**
 * True when the query begins with a complete ref closed by '.'
 * or ' ' — i.e. the user finished typing the ref by hand. The
 * suggestion should stay dismissed while they keep typing
 * after it ('JHN.3.16 is true' must not reopen the picker).
 * A chapter-level ref ('JHN.3') only terminates on whitespace —
 * a '.' after the chapter means a verse may follow. Intended
 * side effect: space-separated longhand refs can no longer
 * reach a verse — '@john 3 ' seals as a chapter ref, so a verse
 * must be typed with '.' or ':' ('john 3.16', 'john 3:16').
 */
export const isTerminatedMentionQuery = (
  query: string
): boolean => {
  for (let i = 0; i < query.length; i++) {
    const ch = query[i];
    if (ch !== '.' && !/\s/.test(ch)) continue;
    const parsed = parseMentionQuery(query.slice(0, i));
    if (!parsed.complete) continue;
    if (ch === '.' && parsed.verseStart === null) continue;
    return true;
  }
  return false;
};

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
 * Canonical storage token for a parsed ref: '@USFM.C.V[-E]',
 * or '@USFM.C' when no verse was picked (whole chapter).
 * Returns null when the ref is not complete enough.
 */
export const buildScriptureToken = (
  p: ParsedMention,
): string | null => {
  if (p.bookName === null || p.chapter === null) return null;
  const code = BOOK_NAME_TO_CODE[p.bookName.toLowerCase()];
  if (!code) return null;
  if (p.verseStart === null) {
    return `@${code}.${p.chapter}`;
  }
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
