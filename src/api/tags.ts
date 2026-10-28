/**
 * Tag CRUD. Listing/creation/edit/delete are authenticated;
 * single-tag fetch is public (shared tag pages are viewable
 * anonymously).
 */
import type { Tag } from '../types';
import {
  authenticatedFetch,
  fetchJson,
  publicFetch,
} from '../utils/apiClient';
import { API_BASE_URL } from '../config';

export const getTags = (): Promise<Tag[]> =>
  fetchJson<Tag[]>(
    authenticatedFetch,
    `${API_BASE_URL}/api/v1/tags/`,
    'Failed to fetch tags'
  );

export const getTag = (tagId: string): Promise<Tag> =>
  fetchJson<Tag>(
    publicFetch,
    `${API_BASE_URL}/api/v1/tags/${tagId}/`,
    'Failed to fetch tag'
  );

export const createTag = (
  name: string,
  parentTagId?: string | null
): Promise<Tag> =>
  fetchJson<Tag>(
    authenticatedFetch,
    `${API_BASE_URL}/api/v1/tags/`,
    'Failed to create tag',
    {
      method: 'POST',
      body: JSON.stringify({
        name,
        parent_tag: parentTagId || null,
      }),
    }
  );

export const updateTag = (
  tagId: string,
  name: string,
  parentTagId?: string | null
): Promise<Tag> =>
  fetchJson<Tag>(
    authenticatedFetch,
    `${API_BASE_URL}/api/v1/tags/${tagId}/`,
    'Failed to update tag',
    {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        parent_tag: parentTagId || null,
      }),
    }
  );

/**
 * POST set-public: flips `tag.public` AND cascades the flag to
 * every note directly under the tag (descendant tags/notes are
 * untouched). The ONLY publicity write path the UI uses — a
 * plain `{public}` PATCH would leave the tag's notes stale.
 */
export const setTagPublic = (
  tagId: string,
  makePublic: boolean
): Promise<{ tag: Tag; notes_updated: number }> =>
  fetchJson<{ tag: Tag; notes_updated: number }>(
    authenticatedFetch,
    `${API_BASE_URL}/api/v1/tags/${tagId}/set-public/`,
    'Failed to update tag publicity',
    {
      method: 'POST',
      body: JSON.stringify({ public: makePublic }),
    }
  );

/**
 * PATCH `{parent_tag}` only — reparenting never rewrites the
 * name. DRF bodies (`{"parent_tag": …}`, `{"name": …}`) and
 * the `{"error","message"}` contract both surface through the
 * thrown Error so the caller can toast the server's reason
 * (e.g. a same-named sibling already exists).
 */
export const reparentTag = async (
  tagId: string,
  parentTagId: string | null
): Promise<Tag> => {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/v1/tags/${tagId}/`,
    {
      method: 'PATCH',
      body: JSON.stringify({ parent_tag: parentTagId }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const fieldError = (field: unknown): string | undefined => {
      if (Array.isArray(field)) return field[0] as string;
      return typeof field === 'string' ? field : undefined;
    };
    throw new Error(
      fieldError(error.message) ||
        fieldError(error.detail) ||
        fieldError(error.parent_tag) ||
        fieldError(error.name) ||
        'Failed to move tag'
    );
  }

  return (await response.json()) as Tag;
};

export const deleteTag = async (tagId: string): Promise<void> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/tags/${tagId}/`,
      {
        method: 'DELETE',
      }
    );
    if (!response.ok) {
      throw new Error('Failed to delete tag');
    }
  } catch (error) {
    console.error('Error deleting tag:', error);
    throw error;
  }
};
