/**
 * SavedNote bookmarks — POST is idempotent, DELETE removes
 * the pointer (works even after access was lost, which is
 * how `available: false` rows get cleaned up).
 */
import type { BookmarkEntry } from '../types';
import {
  authenticatedFetch,
  fetchJson,
} from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import { throwHttpError } from './errors';

/** POST /notes/<id>/bookmark/ — 201 first save, 200 repeat. */
export const bookmarkNote = async (
  noteId: string
): Promise<void> => {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/v1/notes/${noteId}/bookmark/`,
    { method: 'POST' }
  );
  if (!response.ok) {
    throwHttpError(response, 'Failed to bookmark note');
  }
};

/** DELETE /notes/<id>/bookmark/ — 204, idempotent. */
export const unbookmarkNote = async (
  noteId: string
): Promise<void> => {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/v1/notes/${noteId}/bookmark/`,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    throwHttpError(response, 'Failed to remove bookmark');
  }
};

/** GET /notes/bookmarks/ — newest first. */
export const getBookmarks = (): Promise<BookmarkEntry[]> =>
  fetchJson<BookmarkEntry[]>(
    authenticatedFetch,
    `${API_BASE_URL}/api/v1/notes/bookmarks/`,
    'Failed to fetch bookmarks'
  );
