/**
 * Comment threads on notes: CRUD, image uploads, and the
 * batched comment-count endpoint (chunks >200 note ids).
 */
import type {
  Comment,
  CommentCounts,
  CommentImage,
} from '../types';
import {
  authenticatedFetch,
  authenticatedUpload,
  publicFetch,
} from '../utils/apiClient';
import { API_BASE_URL } from '../config';

export const fetchComments = async (
  noteId: string
): Promise<Comment[]> => {
  try {
    const response = await publicFetch(
      `${API_BASE_URL}/api/v1/notes/${noteId}/comments/`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch comments');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching comments:', error);
    throw error;
  }
};

export const createComment = async (
  noteId: string,
  content: string,
  parentCommentId?: string | null
): Promise<Comment> => {
  const body: Record<string, string> = { content };
  if (parentCommentId) {
    body.parent_comment = parentCommentId;
  }
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/notes/${noteId}/comments/`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
    if (!response.ok) {
      throw new Error('Failed to create comment');
    }
    return await response.json();
  } catch (error) {
    console.error('Error creating comment:', error);
    throw error;
  }
};

export const updateComment = async (
  noteId: string,
  commentId: string,
  content: string
): Promise<Comment> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/notes/${noteId}/comments/${commentId}/`,
      {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }
    );
    if (!response.ok) {
      throw new Error('Failed to update comment');
    }
    return await response.json();
  } catch (error) {
    console.error('Error updating comment:', error);
    throw error;
  }
};

export const deleteComment = async (
  noteId: string,
  commentId: string
): Promise<void> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/notes/${noteId}/comments/${commentId}/`,
      { method: 'DELETE' }
    );
    if (!response.ok && response.status !== 204) {
      throw new Error('Failed to delete comment');
    }
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }
};

export const uploadCommentImage = async (
  noteId: string,
  commentId: string,
  file: File,
): Promise<CommentImage> => {
  const fd = new FormData();
  fd.append('file', file);
  const response = await authenticatedUpload(
    `${API_BASE_URL}/api/v1/notes/${noteId}/comments/${commentId}/images/`,
    fd,
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message =
      data.detail ||
      (Array.isArray(data.file) ? data.file[0] : data.file) ||
      'Failed to upload image.';
    throw new Error(message);
  }
  return response.json();
};

export const deleteImage = async (
  imageId: string,
): Promise<void> => {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/v1/images/${imageId}/`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    throw new Error('Failed to delete image.');
  }
};

export const fetchCommentImages = async (
  noteId: string,
  commentId: string,
): Promise<CommentImage[]> => {
  const response = await publicFetch(
    `${API_BASE_URL}/api/v1/notes/${noteId}/comments/${commentId}/images/`,
  );
  if (!response.ok) {
    throw new Error('Failed to fetch images.');
  }
  return response.json();
};

export const fetchCommentCounts = async (params: {
  tagId?: string;
  noteIds?: string[];
  includeDeleted?: boolean;
}): Promise<CommentCounts> => {
  const { tagId, noteIds, includeDeleted } = params;

  const buildUrl = (ids?: string): string => {
    const searchParams = new URLSearchParams();
    if (tagId) {
      searchParams.set('tag_id', tagId);
    } else if (ids) {
      searchParams.set('note_ids', ids);
    }
    if (includeDeleted) {
      searchParams.set('include_deleted', 'true');
    }
    return (
      `${API_BASE_URL}/api/v1/comments/counts/?` +
      searchParams.toString()
    );
  };

  const fetchBatch = async (
    ids?: string
  ): Promise<CommentCounts> => {
    const response = await publicFetch(buildUrl(ids));
    if (!response.ok) {
      throw new Error('Failed to fetch comment counts');
    }
    const data = await response.json();
    return data.counts as CommentCounts;
  };

  try {
    if (tagId) {
      return await fetchBatch();
    }
    if (!noteIds || noteIds.length === 0) {
      return await fetchBatch();
    }
    const CHUNK_SIZE = 200;
    if (noteIds.length <= CHUNK_SIZE) {
      return await fetchBatch(noteIds.join(','));
    }
    const chunks: string[][] = [];
    for (let i = 0; i < noteIds.length; i += CHUNK_SIZE) {
      chunks.push(noteIds.slice(i, i + CHUNK_SIZE));
    }
    const results = await Promise.all(
      chunks.map((chunk) => fetchBatch(chunk.join(',')))
    );
    return Object.assign({}, ...results) as CommentCounts;
  } catch (error) {
    console.error('Error fetching comment counts:', error);
    throw error;
  }
};
