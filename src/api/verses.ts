/**
 * Verse text + section-heading fetches (cache-first, KJV from
 * the bundled lazy-loaded kjv.json, other filesets from the
 * API) and the silent adjacent-chapter prefetcher.
 */
import { loadKjvData } from '../utils/kjvDataLoader';
import { toBookName } from "../utils/bibleUtils";
import type { SectionHeading, KjvBook } from '../types';
import {
  getCachedVerses,
  cacheVerses,
  getCachedHeadings,
  cacheHeadings,
} from '../utils/cacheManager';
import { reportFums } from '../utils/fums';
import { API_BASE_URL } from '../config';
import { getAdjacentChapters } from './structure';
import {
  BookNotInFilesetError,
  ProviderError,
  RateLimitError,
  errorMessageFromBody,
  isBookNotInFilesetBody,
  throwFromErrorBody,
} from './errors';

type VerseResult = {
  verses: { verse: number; text: string }[];
  headings: SectionHeading[];
};

export const getVersesInChapter = async (
  bookId: string,
  thechapter: number,
  filesetId: string
): Promise<VerseResult> => {
  if (filesetId === 'ENGKJV') {
    return getVersesInKjvChapter(bookId, thechapter);
  }
  return await getVersesFromApi(bookId, thechapter, filesetId);
};

export const getVersesInKjvChapter = async (
  bookId: string,
  thechapter: number
): Promise<VerseResult> => {
  const kjvData = await loadKjvData();
  const verses = kjvData
    .filter(
      (book: KjvBook) =>
        book.book_id === bookId &&
        book.chapter === thechapter
    )
    .map((book: KjvBook) => ({
      verse: book.verse,
      text: book.text,
    }));
  return { verses, headings: [] };
};

export const fetchHeadingsOnly = async (
  bookId: string,
  chapter: number,
  filesetId: string
): Promise<SectionHeading[]> => {
  if (filesetId === 'ENGKJV') {
    return [];
  }
  const cached = getCachedHeadings(bookId, chapter, filesetId);
  if (cached !== null) {
    return cached;
  }
  try {
    // The backend expects a book name in the passage param.
    const passage = `${toBookName(bookId) ?? bookId} ${chapter}`;
    const url =
      `${API_BASE_URL}/api/v1/bible?passage=` +
      `${encodeURIComponent(passage)}&fileset_id=${filesetId}`;
    const response = await fetch(url);
    const responseData = await response.json();
    // API.Bible responses carry a FUMS token in `meta` that must
    // be reported per their license terms (silent on failure).
    reportFums(responseData.meta);
    const headings: SectionHeading[] =
      responseData.headings ?? [];
    cacheHeadings(bookId, chapter, filesetId, headings);
    return headings;
  } catch (error) {
    console.warn(
      `Failed to fetch headings for ${bookId} ${chapter}:`,
      error
    );
    return [];
  }
};

export const getVersesFromApi = async (
  bookId: string,
  thechapter: number,
  filesetId: string
): Promise<VerseResult> => {
  const cachedVerses = getCachedVerses(
    bookId, thechapter, filesetId
  );
  if (cachedVerses) {
    const cachedHeadings =
      getCachedHeadings(bookId, thechapter, filesetId)
      ?? [];
    return { verses: cachedVerses, headings: cachedHeadings };
  }
  try {
    // The backend expects a book name in the passage param.
    const bookName = toBookName(bookId) ?? bookId;
    const passage = `${bookName} ${thechapter}`;
    const url =
      `${API_BASE_URL}/api/v1/bible?passage=` +
      `${encodeURIComponent(passage)}&fileset_id=${filesetId}`;
    const response = await fetch(url);

    // Handle rate limit errors (429)
    if (response.status === 429) {
      throw new RateLimitError(
        'The translation provider is currently rate-limited. ' +
        'Please try again in a few moments or switch to KJV.'
      );
    }

    // Handle other HTTP errors
    if (!response.ok) {
      await throwFromErrorBody(response, {
        bookNotInFileset: 'Book not available in this fileset',
        failure:
          `Failed to fetch verses (HTTP ${response.status})`,
      });
    }

    const data = await response.json();

    if (isBookNotInFilesetBody(data)) {
      throw new BookNotInFilesetError(
        errorMessageFromBody(
          data,
          'Book not available in this fileset'
        )
      );
    }

    // Provider failures carry `error`/`error_code` fields.
    if (typeof data.error === 'string' && data.error) {
      throw data.error_code === 'rate_limited'
        ? new RateLimitError(data.error)
        : new ProviderError(data.error);
    }
    // The API may also wrap provider failures (including
    // upstream rate limits) in a 200 response with empty verses
    // and a `message` field — surface it instead of silently
    // rendering an empty chapter.
    if (
      typeof data.message === 'string' &&
      (!Array.isArray(data.verses) || data.verses.length === 0)
    ) {
      throw new ProviderError(data.message);
    }
    if (!Array.isArray(data.verses)) {
      throw new Error('Malformed response from verse API');
    }

    const verses = data.verses.map(
      (v: { verse: number; text: string }) => (
        { verse: v.verse, text: v.text }
      )
    );
    const headings: SectionHeading[] =
      data.headings ?? [];
    // API.Bible responses carry a FUMS token in `meta` that must
    // be reported per their license terms (silent on failure).
    reportFums(data.meta);
    cacheVerses(bookId, thechapter, filesetId, verses);
    cacheHeadings(bookId, thechapter, filesetId, headings);
    return { verses, headings };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

/**
 * Prefetch verses and audio for adjacent chapters
 * (previous and next)
 * @param bookId - Current USFM book code
 * @param chapter - Current chapter number
 * @param filesetId - The fileset ID for the translation to prefetch
 * @param resolveFilesetId - Optional per-book resolver (adjacent
 *   chapters can cross a book boundary, and text filesets split
 *   by testament need the member for THAT book).
 */
export const prefetchAdjacentChapters = async (
  bookId: string,
  chapter: number,
  filesetId: string,
  resolveFilesetId?: (bookId: string) => string | null
): Promise<void> => {
  const { previous, next } = getAdjacentChapters(bookId, chapter);

  const prefetch = async (
    b: string,
    c: number,
    id: string,
    label: string
  ) => {
    try {
      const resolvedId = resolveFilesetId?.(b) ?? id;
      // We don't need the result, just to trigger the fetch and cache
      await getVersesInChapter(b, c, resolvedId);
      console.log(`📚 Prefetched ${label} chapter: ${b} ${c}`);
    } catch (error) {
      // Silent fail
      console.warn(`Failed to prefetch ${label} chapter ${b} ${c}:`, error);
    }
  };

  if (previous) {
    prefetch(
      previous.bookId, previous.chapter, filesetId, 'previous'
    );
  }
  if (next) {
    prefetch(next.bookId, next.chapter, filesetId, 'next');
  }
};
