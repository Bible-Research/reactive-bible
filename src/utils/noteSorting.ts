import type { Note } from '../types';
import { BOOK_NAME_TO_ORDER } from './bibleUtils';

/**
 * Sort orders supported by the tag-notes view. `custom_*` sort
 * by the user-managed `tag_position`, `created_*` by creation
 * time, `verse_*` by the note's first verse in canonical book
 * order. The URL `?sort=` param and the sort dropdown use
 * these values verbatim.
 */
export type SortOrder =
  | 'custom_asc'
  | 'custom_desc'
  | 'created_desc'
  | 'created_asc'
  | 'verse_asc'
  | 'verse_desc';

export const SORT_ORDERS: SortOrder[] = [
  'custom_asc',
  'custom_desc',
  'created_desc',
  'created_asc',
  'verse_asc',
  'verse_desc',
];

/** Map a frontend sort order to the API `ordering` param. */
export const getApiOrdering = (sortOrder: SortOrder): string => {
  const orderingMap: Record<SortOrder, string> = {
    custom_asc: 'custom',
    custom_desc: '-custom',
    created_desc: '-created',
    created_asc: 'created',
    verse_asc: 'verse',
    verse_desc: '-verse',
  };
  return orderingMap[sortOrder];
};

const createdAtMs = (note: Note): number =>
  new Date(note.created_at).getTime();

/**
 * Orders notes by their first verse: canonical book order,
 * then chapter, then verse, in `direction` (1 = asc, -1 =
 * desc). Verse-less notes sort last in BOTH directions —
 * the missing-verse guards are not affected by direction.
 */
const compareFirstVerse = (
  a: Note,
  b: Note,
  direction: 1 | -1
): number => {
  const aV = a.verses?.[0];
  const bV = b.verses?.[0];
  if (!aV) return 1;
  if (!bV) return -1;
  const aBook = BOOK_NAME_TO_ORDER[aV.book.toLowerCase()] ?? 999;
  const bBook = BOOK_NAME_TO_ORDER[bV.book.toLowerCase()] ?? 999;
  if (aBook !== bBook) return (aBook - bBook) * direction;
  if (aV.chapter !== bV.chapter) {
    return (aV.chapter - bV.chapter) * direction;
  }
  return (aV.verse - bV.verse) * direction;
};

/**
 * Returns a new array of the notes sorted per `sortOrder`;
 * the input array is left untouched.
 *
 * `custom_*` ties (equal or missing `tag_position`) fall back
 * to recency: newest first ascending, oldest first descending,
 * matching the backend's canonical order-index semantics.
 */
export const sortNotes = (
  notes: Note[],
  sortOrder: SortOrder
): Note[] =>
  [...notes].sort((a, b) => {
    switch (sortOrder) {
      case 'custom_asc': {
        const aPos = a.tag_position ?? 0;
        const bPos = b.tag_position ?? 0;
        if (aPos !== bPos) return aPos - bPos;
        return createdAtMs(b) - createdAtMs(a);
      }
      case 'custom_desc': {
        const aPos = a.tag_position ?? 0;
        const bPos = b.tag_position ?? 0;
        if (aPos !== bPos) return bPos - aPos;
        return createdAtMs(a) - createdAtMs(b);
      }
      case 'created_desc':
        return createdAtMs(b) - createdAtMs(a);
      case 'created_asc':
        return createdAtMs(a) - createdAtMs(b);
      case 'verse_asc':
        return compareFirstVerse(a, b, 1);
      case 'verse_desc':
        return compareFirstVerse(a, b, -1);
      default:
        return 0;
    }
  });
