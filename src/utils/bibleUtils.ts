// src/utils/bibleUtils.ts

/**
 * Encodes an array of verse numbers into a compact URL string.
 * e.g. [16,17,18] → "16-18", [16,18] → "16,18"
 */
export function encodeVerses(verses: number[]): string {
  if (verses.length === 0) return '';
  const sorted = [...verses].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(',');
}

/**
 * Decodes a URL verse string back into an array of verse numbers.
 * e.g. "16-18" → [16,17,18], "16,18" → [16,18]
 */
export function decodeVerses(verseStr: string): number[] {
  const verses: number[] = [];
  for (const part of verseStr.split(',')) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let v = start; v <= end; v++) verses.push(v);
      }
    } else {
      const v = parseInt(trimmed, 10);
      if (!isNaN(v)) verses.push(v);
    }
  }
  return verses;
}

export type Testament = 'OT' | 'NT';

export interface BibleBook {
  name: string;
  code: string;
  testament: Testament;
}

const BIBLE_BOOKS: BibleBook[] = [
  // Old Testament
  { name: 'genesis', code: 'GEN', testament: 'OT' },
  { name: 'exodus', code: 'EXO', testament: 'OT' },
  { name: 'leviticus', code: 'LEV', testament: 'OT' },
  { name: 'numbers', code: 'NUM', testament: 'OT' },
  { name: 'deuteronomy', code: 'DEU', testament: 'OT' },
  { name: 'joshua', code: 'JOS', testament: 'OT' },
  { name: 'judges', code: 'JDG', testament: 'OT' },
  { name: 'ruth', code: 'RUT', testament: 'OT' },
  { name: '1 samuel', code: '1SA', testament: 'OT' },
  { name: '2 samuel', code: '2SA', testament: 'OT' },
  { name: '1 kings', code: '1KI', testament: 'OT' },
  { name: '2 kings', code: '2KI', testament: 'OT' },
  { name: '1 chronicles', code: '1CH', testament: 'OT' },
  { name: '2 chronicles', code: '2CH', testament: 'OT' },
  { name: 'ezra', code: 'EZR', testament: 'OT' },
  { name: 'nehemiah', code: 'NEH', testament: 'OT' },
  { name: 'esther', code: 'EST', testament: 'OT' },
  { name: 'job', code: 'JOB', testament: 'OT' },
  { name: 'psalms', code: 'PSA', testament: 'OT' },
  { name: 'proverbs', code: 'PRO', testament: 'OT' },
  { name: 'ecclesiastes', code: 'ECC', testament: 'OT' },
  { name: 'song of solomon', code: 'SNG', testament: 'OT' },
  { name: 'isaiah', code: 'ISA', testament: 'OT' },
  { name: 'jeremiah', code: 'JER', testament: 'OT' },
  { name: 'lamentations', code: 'LAM', testament: 'OT' },
  { name: 'ezekiel', code: 'EZK', testament: 'OT' },
  { name: 'daniel', code: 'DAN', testament: 'OT' },
  { name: 'hosea', code: 'HOS', testament: 'OT' },
  { name: 'joel', code: 'JOL', testament: 'OT' },
  { name: 'amos', code: 'AMO', testament: 'OT' },
  { name: 'obadiah', code: 'OBA', testament: 'OT' },
  { name: 'jonah', code: 'JON', testament: 'OT' },
  { name: 'micah', code: 'MIC', testament: 'OT' },
  { name: 'nahum', code: 'NAM', testament: 'OT' },
  { name: 'habakkuk', code: 'HAB', testament: 'OT' },
  { name: 'zephaniah', code: 'ZEP', testament: 'OT' },
  { name: 'haggai', code: 'HAG', testament: 'OT' },
  { name: 'zechariah', code: 'ZEC', testament: 'OT' },
  { name: 'malachi', code: 'MAL', testament: 'OT' },
  // New Testament
  { name: 'matthew', code: 'MAT', testament: 'NT' },
  { name: 'mark', code: 'MRK', testament: 'NT' },
  { name: 'luke', code: 'LUK', testament: 'NT' },
  { name: 'john', code: 'JHN', testament: 'NT' },
  { name: 'acts', code: 'ACT', testament: 'NT' },
  { name: 'romans', code: 'ROM', testament: 'NT' },
  { name: '1 corinthians', code: '1CO', testament: 'NT' },
  { name: '2 corinthians', code: '2CO', testament: 'NT' },
  { name: 'galatians', code: 'GAL', testament: 'NT' },
  { name: 'ephesians', code: 'EPH', testament: 'NT' },
  { name: 'philippians', code: 'PHP', testament: 'NT' },
  { name: 'colossians', code: 'COL', testament: 'NT' },
  { name: '1 thessalonians', code: '1TH', testament: 'NT' },
  { name: '2 thessalonians', code: '2TH', testament: 'NT' },
  { name: '1 timothy', code: '1TI', testament: 'NT' },
  { name: '2 timothy', code: '2TI', testament: 'NT' },
  { name: 'titus', code: 'TIT', testament: 'NT' },
  { name: 'philemon', code: 'PHM', testament: 'NT' },
  { name: 'hebrews', code: 'HEB', testament: 'NT' },
  { name: 'james', code: 'JAS', testament: 'NT' },
  { name: '1 peter', code: '1PE', testament: 'NT' },
  { name: '2 peter', code: '2PE', testament: 'NT' },
  { name: '1 john', code: '1JN', testament: 'NT' },
  { name: '2 john', code: '2JN', testament: 'NT' },
  { name: '3 john', code: '3JN', testament: 'NT' },
  { name: 'jude', code: 'JUD', testament: 'NT' },
  { name: 'revelation', code: 'REV', testament: 'NT' },
];

/**
 * Map of lowercase book names to their canonical order index.
 * Derived from BIBLE_BOOKS array.
 * Example: { 'genesis': 0, 'exodus': 1, ... }
 */
export const BOOK_NAME_TO_ORDER: Record<string, number> =
  BIBLE_BOOKS.reduce(
    (acc, book, idx) => {
      acc[book.name] = idx;
      return acc;
    },
    {} as Record<string, number>,
  );

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Map of USFM book codes to title-cased display names.
 * Derived from BIBLE_BOOKS array.
 * Example: { 'GEN': 'Genesis', 'JHN': 'John', ... }
 */
export const BOOK_CODE_TO_NAME: Record<string, string> =
  BIBLE_BOOKS.reduce(
    (acc, b) => {
      acc[b.code] = titleCase(b.name);
      return acc;
    },
    {} as Record<string, string>,
  );

/**
 * Map of USFM book codes to their canonical order index.
 * Derived from BIBLE_BOOKS array.
 * Example: { 'GEN': 0, 'EXO': 1, 'JHN': 42, ... }
 */
export const BOOK_CODE_TO_ORDER: Record<string, number> =
  BIBLE_BOOKS.reduce(
    (acc, b, i) => {
      acc[b.code] = i;
      return acc;
    },
    {} as Record<string, number>,
  );

export const BOOK_NAME_TO_CODE = BIBLE_BOOKS.reduce(
  (acc, book) => {
    acc[book.name] = book.code;
    return acc;
  },
  {} as { [name: string]: string },
);

export const BOOK_CODE_TO_TESTAMENT = BIBLE_BOOKS.reduce(
  (acc, book) => {
    acc[book.code] = book.testament;
    return acc;
  },
  {} as { [code: string]: Testament },
);

export const OLD_TESTAMENT_BOOKS = new Set(
  BIBLE_BOOKS.filter((b) => b.testament === 'OT').map((b) => b.code),
);

export const NEW_TESTAMENT_BOOKS = new Set(
  BIBLE_BOOKS.filter((b) => b.testament === 'NT').map((b) => b.code),
);

/**
 * Determines the testament of a given Bible book code.
 * @param bookCode - The 3-letter code for the Bible book (e.g., 'GEN').
 * @returns The testament ('OT' or 'NT') or null if not found.
 */
export const getTestament = (bookCode: string): Testament | null => {
  return BOOK_CODE_TO_TESTAMENT[bookCode.toUpperCase()] || null;
};

/**
 * Checks whether a fileset's size field covers the given testament.
 * DBT size values: "C" = complete, "NT"/"NT1"/"NT2" = New Testament,
 * "OT"/"OT1"/"OT2" = Old Testament.
 * Returns true if compatible or if the size is unknown/ambiguous.
 */
export const filesetCoversTestament = (
  filesetSize: string | null,
  testament: Testament | null,
): boolean => {
  if (!filesetSize || !testament) return true;
  const s = filesetSize.toUpperCase();
  if (s === 'C') return true;
  if (testament === 'OT') return s.startsWith('OT');
  if (testament === 'NT') return s.startsWith('NT');
  return true;
};

/**
 * Given a full book name (e.g. "Genesis"), returns its testament or null.
 */
export const getTestamentByBookName = (
  bookName: string,
): Testament | null => {
  const code = BOOK_NAME_TO_CODE[bookName.toLowerCase()];
  return code ? getTestament(code) : null;
};

/**
 * Resolves the fileset ID to use for fetching verse timestamps.
 * When the active text fileset is ENGESV_API (text-only),
 * timestamps come from the corresponding ESV audio fileset
 * based on the book's testament. Otherwise strips the codec
 * suffix from the audio fileset ID.
 */
export const resolveTimestampsFilesetId = (
  audioFilesetId: string | null,
  textFilesetId: string | null,
  book: string,
): string | null => {
  if (textFilesetId === 'ENGESV_API') {
    const testament = getTestamentByBookName(book);
    if (testament === 'OT') return 'ENGESVO1DA';
    if (testament === 'NT') return 'ENGESVN1DA';
  }
  if (!audioFilesetId) return null;
  return audioFilesetId.split('-')[0];
};
