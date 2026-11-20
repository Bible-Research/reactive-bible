/**
 * Targeted sharing + published-directory calls.
 *
 * Username resolution is server-side and silent — the grant
 * endpoint returns the identical `{"shared": true}` body for
 * known and unknown names, so the UI only ever learns "if
 * that username exists, they'll get access" (which is also
 * the honest copy the share dialog shows).
 */
import type {
  Note,
  PaginatedNotesResponse,
  ShareGrant,
  SharedWithMeResponse,
  Tag,
} from '../types';
import {
  authenticatedFetch,
  fetchJson,
  publicFetch,
} from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import { throwHttpError } from './errors';
import { clearNotesCache } from '../utils/cacheManager';

const notePath = (id: string) =>
  `${API_BASE_URL}/api/v1/notes/${id}`;
const tagPath = (id: string) =>
  `${API_BASE_URL}/api/v1/tags/${id}`;

/** POST /notes/<id>/share/ — grant a user read access. */
export const shareNote = (
  noteId: string,
  username: string
): Promise<{ shared: boolean }> =>
  fetchJson<{ shared: boolean }>(
    authenticatedFetch,
    `${notePath(noteId)}/share/`,
    'Failed to share note',
    {
      method: 'POST',
      body: JSON.stringify({ username }),
    }
  );

/** DELETE /notes/<id>/share/<username>/ — revoke (204). */
export const unshareNote = async (
  noteId: string,
  username: string
): Promise<void> => {
  const response = await authenticatedFetch(
    `${notePath(noteId)}/share/${encodeURIComponent(username)}/`,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    throwHttpError(response, 'Failed to revoke share');
  }
};

/** GET /notes/<id>/shares/ — owner-only grant listing. */
export const getNoteShares = (
  noteId: string
): Promise<ShareGrant[]> =>
  fetchJson<ShareGrant[]>(
    authenticatedFetch,
    `${notePath(noteId)}/shares/`,
    'Failed to fetch shares'
  );

/** POST /tags/<id>/share/ — re-sharing upserts
 *  include_descendants. */
export const shareTag = (
  tagId: string,
  username: string,
  includeDescendants: boolean
): Promise<{ shared: boolean }> =>
  fetchJson<{ shared: boolean }>(
    authenticatedFetch,
    `${tagPath(tagId)}/share/`,
    'Failed to share tag',
    {
      method: 'POST',
      body: JSON.stringify({
        username,
        include_descendants: includeDescendants,
      }),
    }
  );

/** DELETE /tags/<id>/share/<username>/ — revoke (204). */
export const unshareTag = async (
  tagId: string,
  username: string
): Promise<void> => {
  const response = await authenticatedFetch(
    `${tagPath(tagId)}/share/${encodeURIComponent(username)}/`,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    throwHttpError(response, 'Failed to revoke share');
  }
};

/** GET /tags/<id>/shares/ — owner-only grant listing. */
export const getTagShares = (
  tagId: string
): Promise<ShareGrant[]> =>
  fetchJson<ShareGrant[]>(
    authenticatedFetch,
    `${tagPath(tagId)}/shares/`,
    'Failed to fetch shares'
  );

/**
 * GET /notes/shared-with-me/ — notes granted to the caller
 * plus the tag grants themselves (rendered read-only).
 */
export const getSharedWithMe =
  (): Promise<SharedWithMeResponse> =>
    fetchJson<SharedWithMeResponse>(
      authenticatedFetch,
      `${API_BASE_URL}/api/v1/notes/shared-with-me/`,
      'Failed to fetch shared notes'
    );

/**
 * GET /notes/?published=true[&q=] — the public directory.
 * `q` forces the published scope server-side; callers may
 * stay anonymous (the feed is public).
 */
export const getPublishedNotes = (
  options: { q?: string; page?: number; pageSize?: number } = {}
): Promise<PaginatedNotesResponse> => {
  const params = new URLSearchParams({ published: 'true' });
  if (options.q) params.set('q', options.q);
  if (options.page) params.set('page', String(options.page));
  if (options.pageSize) {
    params.set('page_size', String(options.pageSize));
  }
  return fetchJson<PaginatedNotesResponse>(
    publicFetch,
    `${API_BASE_URL}/api/v1/notes/?${params.toString()}`,
    'Failed to fetch published notes'
  );
};

/**
 * POST set-published: flips `tag.published` AND cascades the
 * flag to every note directly under the tag — mirrors
 * setTagPublic. Requires the publish_note permission.
 */
export const setTagPublished = (
  tagId: string,
  published: boolean
): Promise<{ tag: Tag; notes_updated: number }> =>
  fetchJson<{ tag: Tag; notes_updated: number }>(
    authenticatedFetch,
    `${tagPath(tagId)}/set-published/`,
    'Failed to update tag publication',
    {
      method: 'POST',
      body: JSON.stringify({ published }),
    }
  );

/**
 * POST /notes/<id>/copy/ — copy an accessible note into the
 * caller's account. `tagId` must be one of the caller's tags,
 * 'untagged' or undefined (no tag).
 */
export const copyNote = async (
  noteId: string,
  tagId?: string
): Promise<Note> => {
  const created = await fetchJson<Note>(
    authenticatedFetch,
    `${notePath(noteId)}/copy/`,
    'Failed to copy note',
    {
      method: 'POST',
      body: JSON.stringify({ tag_id: tagId ?? 'untagged' }),
    }
  );
  clearNotesCache(tagId);
  return created;
};

/**
 * POST /tags/<id>/copy/ — bulk-copy the accessible notes of
 * the source tag into a caller-owned destination tag.
 */
export const copyTag = async (
  tagId: string,
  targetTagId: string
): Promise<{ copied: number; notes: Note[] }> => {
  const result = await fetchJson<{
    copied: number;
    notes: Note[];
  }>(
    authenticatedFetch,
    `${tagPath(tagId)}/copy/`,
    'Failed to copy tag',
    {
      method: 'POST',
      body: JSON.stringify({ tag_id: targetTagId }),
    }
  );
  clearNotesCache(targetTagId);
  return result;
};
