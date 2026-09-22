import type { VerseRef, VerseScope } from '../types';
import { BOOK_NAME_TO_ORDER } from './bibleUtils';

/** Structural equality for qualified verse references. */
export const sameRef = (a: VerseRef, b: VerseRef): boolean =>
  a.book === b.book &&
  a.chapter === b.chapter &&
  a.verse === b.verse;

export const refsInclude = (
  refs: VerseRef[],
  ref: VerseRef,
): boolean => refs.some((r) => sameRef(r, ref));

/** Canonical ordering: Bible book order, then chapter, then verse. */
export const sortRefs = (refs: VerseRef[]): VerseRef[] =>
  [...refs].sort((a, b) => {
    const aBook = BOOK_NAME_TO_ORDER[a.book.toLowerCase()] ?? 999;
    const bBook = BOOK_NAME_TO_ORDER[b.book.toLowerCase()] ?? 999;
    return (
      aBook - bBook ||
      a.chapter - b.chapter ||
      a.verse - b.verse
    );
  });

/** True when both ref arrays contain the same set of references. */
export const sameRefSet = (a: VerseRef[], b: VerseRef[]): boolean => {
  if (a.length !== b.length) return false;
  const sa = sortRefs(a);
  const sb = sortRefs(b);
  return sa.every((r, i) => sameRef(r, sb[i]));
};

/** Sorted verse numbers of refs within one book/chapter. */
export const verseNumbersFor = (
  refs: VerseRef[],
  book: string,
  chapter: number,
): number[] =>
  refs
    .filter((r) => r.book === book && r.chapter === chapter)
    .map((r) => r.verse)
    .sort((a, b) => a - b);

/** Groups refs by book+chapter, preserving canonical order. */
export const groupRefsByChapter = (
  refs: VerseRef[],
): { book: string; chapter: number; verses: number[] }[] => {
  const groups = new Map<
    string,
    { book: string; chapter: number; verses: number[] }
  >();
  for (const ref of sortRefs(refs)) {
    const key = `${ref.book}|${ref.chapter}`;
    const group = groups.get(key);
    if (group) {
      group.verses.push(ref.verse);
    } else {
      groups.set(key, {
        book: ref.book,
        chapter: ref.chapter,
        verses: [ref.verse],
      });
    }
  }
  return [...groups.values()];
};

/** Slugifies a scope/book for use in DOM ids. */
export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'x';

/**
 * DOM id unique per scope + coordinate, e.g.
 * `verse-bible-john-3-16` or `verse-<note-id>-john-3-16`.
 */
export const verseDomId = (
  scope: VerseScope,
  ref: VerseRef,
): string =>
  `verse-${slug(scope)}-${slug(ref.book)}-${ref.chapter}-${ref.verse}`;
