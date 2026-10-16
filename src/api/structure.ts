/**
 * Book/chapter/verse structure lookups built from the bundled
 * `bibleStructure.json`. Pure synchronous functions with no
 * network/cache/store dependencies — safe to import from
 * anywhere (including non-async UI and pure utils).
 */
import bibleStructure from '../assets/bibleStructure.json';

interface BibleStructureEntry {
  book_id: string;
  book_name: string;
  chapter: number;
  max_verse: number;
}

// Book/chapter/verse-count metadata only — verse text is
// lazy-loaded from kjv.json via kjvDataLoader.
const structure = bibleStructure as BibleStructureEntry[];

/**
 * Get list of all Bible books from lightweight structure data
 */
export const getBooks = (): { book_name: string; book_id: string }[] => {
  const bookMap = new Map<string, { book_name: string; book_id: string }>();
  structure.forEach((entry) => {
    if (!bookMap.has(entry.book_id)) {
      bookMap.set(entry.book_id, {
        book_name: entry.book_name,
        book_id: entry.book_id,
      });
    }
  });
  return Array.from(bookMap.values());
};

export const getChapters = (bookId: string): number[] => {
  return structure
    .filter((entry) => entry.book_id === bookId)
    .map((entry) => entry.chapter);
};

export const getVerses = (
  bookId: string,
  thechapter: number
): number[] => {
  // KJV verse numbering is contiguous, so verse numbers can be
  // synthesized as 1..max_verse from structure data.
  const entry = structure.find(
    (e) => e.book_id === bookId && e.chapter === thechapter
  );
  if (!entry) return [];
  return Array.from({ length: entry.max_verse }, (_, i) => i + 1);
};

export const getPassage = (): {
  book_name: string;
  book_id: string;
  chapter: number;
}[] => {
  return structure.map((entry) => ({
    book_name: entry.book_name,
    book_id: entry.book_id,
    chapter: entry.chapter,
  }));
};

/**
 * Get adjacent chapter info (previous/next)
 * @param bookId - Current USFM book code
 * @param chapter - Current chapter number
 * @returns Object with previous and next chapter info
 */
export const getAdjacentChapters = (
  bookId: string,
  chapter: number
): {
  previous: { bookId: string; chapter: number } | null;
  next: { bookId: string; chapter: number } | null;
} => {
  const passages = getPassage();
  const currentIndex = passages.findIndex(
    (p) => p.book_id === bookId && p.chapter === chapter
  );

  if (currentIndex === -1) {
    return { previous: null, next: null };
  }

  const previous =
    currentIndex > 0
      ? {
          bookId: passages[currentIndex - 1].book_id,
          chapter: passages[currentIndex - 1].chapter,
        }
      : null;

  const next =
    currentIndex < passages.length - 1
      ? {
          bookId: passages[currentIndex + 1].book_id,
          chapter: passages[currentIndex + 1].chapter,
        }
      : null;

  return { previous, next };
};
