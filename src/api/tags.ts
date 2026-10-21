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
