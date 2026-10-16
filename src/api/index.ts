import { toBookName, toUsfmCode } from "../utils/bibleUtils";
import type {
  ReadingPosition,
  GroupedSearchResponse,
  ReadingPositionValue,
} from '../types';

import { authenticatedFetch } from '../utils/apiClient';
import { API_BASE_URL } from '../config';

export * from './errors';
export * from './structure';
export * from './verses';
export * from './audio';
export * from './translations';
export * from './notes';
export * from './tags';
export * from './comments';

// Shared API/domain types live in `../types`; re-export them
// here so every existing `from '../api'` type import (and the
// vi.mock barrels) keeps working unchanged.
export type {
  SectionHeading,
  KjvBook,
  Note,
  Tag,
  NotePositionUpdate,
  MovePlacement,
  MoveNoteResponse,
  PaginatedNotesResponse,
  LinkedNotesResponse,
  Comment,
  CommentAuthor,
  CommentCounts,
  CommentImage,
  SearchVerse,
  SearchPagination,
  SearchResponse,
  SearchVerseGroup,
  GroupedSearchResponse,
  ReadingPositionValue,
} from '../types';

// ============================================
// SEARCH FUNCTIONS
// ============================================

export const searchBibleGrouped = async (
  query: string,
  filesetId: string,
  signal?: AbortSignal,
): Promise<GroupedSearchResponse> => {
  const params = new URLSearchParams({
    query,
    fileset_id: filesetId,
    group_by: 'book',
  });
  const url =
    `${API_BASE_URL}/api/v1/bible/search/?` +
    params.toString();
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Search failed: ${response.statusText}`
    );
  }
  const json = await response.json();
  return {
    groups: json.data?.groups ?? [],
    meta: json.data?.meta ?? { total: 0, truncated: false },
  };
};

// ============================================
// READING POSITION FUNCTIONS
// ============================================
//
// The backend stores positions keyed by book NAME (validated via
// get_dbt_book_id), so every function below maps the USFM bookId
// to a display name before calling the API and maps names back
// to USFM codes in responses.

/**
 * Get the saved reading position for a book. `bookId` is a USFM
 * code; the backend `?book=` filter expects the book name and
 * returns a (filtered) list, not a single object.
 */
export const getReadingPosition = async (
  bookId: string
): Promise<ReadingPosition | null> => {
  const bookName = toBookName(bookId);
  if (!bookName) return null;
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/reading-positions/` +
        `?book=${encodeURIComponent(bookName)}`
    );
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch reading position');
    }
    const data: ReadingPosition[] = await response.json();
    return data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error fetching reading position:', error);
    // Rethrow so callers can distinguish "fetch failed" (retry
    // later) from "no saved position" (returned as null above).
    throw error;
  }
};

/**
 * Upsert the reading position for a book (USFM `bookId`; the
 * backend expects the book name).
 */
export const updateReadingPosition = async (
  bookId: string,
  chapter: number,
  verse = 1
): Promise<void> => {
  const bookName = toBookName(bookId);
  if (!bookName) return;
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/reading-positions/`,
      {
        method: 'POST',
        body: JSON.stringify({
          book: bookName,
          chapter,
          verse,
        }),
      }
    );
    if (!response.ok) {
      throw new Error('Failed to update reading position');
    }
  } catch (error) {
    console.error('Error updating reading position:', error);
  }
};

/**
 * Bulk-fetch reading positions for USFM `bookIds`. The backend
 * request and response are keyed by book name; the returned map
 * is re-keyed by USFM code and keeps explicit nulls for books
 * with no saved position so callers can tell "checked, empty"
 * from "never fetched".
 */
export const getBulkReadingPositions = async (
  bookIds: string[]
): Promise<Record<string, ReadingPositionValue | null>> => {
  try {
    const bookNames = bookIds
      .map((id) => toBookName(id))
      .filter((n): n is string => n !== null);
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/reading-positions/bulk/`,
      {
        method: 'POST',
        body: JSON.stringify({ books: bookNames }),
      }
    );
    if (!response.ok) {
      throw new Error('Failed to fetch bulk reading positions');
    }
    const byName: Record<string, ReadingPositionValue | null> =
      await response.json();
    const byId: Record<string, ReadingPositionValue | null> = {};
    for (const [name, position] of Object.entries(byName)) {
      const code = toUsfmCode(name);
      if (code) byId[code] = position;
    }
    return byId;
  } catch (error) {
    console.error('Error fetching bulk reading positions:', error);
    return {};
  }
};
