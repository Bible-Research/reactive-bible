/**
 * Tag CRUD. Listing/creation/edit/delete are authenticated;
 * single-tag fetch is public (shared tag pages are viewable
 * anonymously).
 */
import type { Tag } from '../types';
import {
  authenticatedFetch,
  publicFetch,
} from '../utils/apiClient';
import { API_BASE_URL } from '../config';

export const getTags = async (): Promise<Tag[]> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/tags/`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch tags');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching tags:', error);
    throw error;
  }
};

export const getTag = async (tagId: string): Promise<Tag> => {
  try {
    const response = await publicFetch(
      `${API_BASE_URL}/api/v1/tags/${tagId}/`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch tag');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching tag:', error);
    throw error;
  }
};

export const createTag = async (
  name: string,
  parentTagId?: string | null
): Promise<Tag> => {
  const body = JSON.stringify({
    name,
    parent_tag: parentTagId || null,
  });
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/tags/`,
      {
        method: 'POST',
        body: body,
      }
    );
    if (!response.ok) {
      throw new Error('Failed to create tag');
    }
    return await response.json();
  } catch (error) {
    console.error('Error creating tag:', error);
    throw error;
  }
};

export const updateTag = async (
  tagId: string,
  name: string,
  parentTagId?: string | null
): Promise<Tag> => {
  const body = JSON.stringify({
    name,
    parent_tag: parentTagId || null,
  });
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/tags/${tagId}/`,
      {
        method: 'PATCH',
        body: body,
      }
    );
    if (!response.ok) {
      throw new Error('Failed to update tag');
    }
    return await response.json();
  } catch (error) {
    console.error('Error updating tag:', error);
    throw error;
  }
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
