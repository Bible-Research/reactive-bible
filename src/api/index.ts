import { toBookName, toUsfmCode } from "../utils/bibleUtils";
import type {
  Comment,
  CommentCounts,
  CommentImage,
  NoteOrderIndexEntry,
  ReadingPosition,
  Note,
  Tag,
  NotePositionUpdate,
  MovePlacement,
  MoveNoteResponse,
  PaginatedNotesResponse,
  LinkedNotesResponse,
  GroupedSearchResponse,
  ReadingPositionValue,
} from '../types';

import {
  authenticatedFetch,
  authenticatedUpload,
  publicFetch,
} from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import { ConflictError } from './errors';

export * from './errors';
export * from './structure';
export * from './verses';
export * from './audio';
export * from './translations';

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

export const addTagNote = async (
  tagId: string,
  tagNoteText: string,
  verseReferences: { book: string; chapter: number; verse: number }[]
) => {
  const body = JSON.stringify({ 
    tag: tagId, 
    note_text: tagNoteText, 
    verse_references: verseReferences 
  });
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/notes/`,
      {
        method: 'POST',
        body: body,
      }
    );
    if (!response.ok) {
      throw new Error('Failed to create note');
    }
    return await response.json();
  } catch (error) {
    console.error('Error creating note:', error);
    throw error;
  }
};

export const editNote = async (
  noteId: string,
  tagId: string,
  noteText: string,
  verseReferences?: { book: string; chapter: number; verse: number }[]
) => {
  // verse_references replaces the note's verse links when present;
  // omitting it leaves them untouched.
  const body = JSON.stringify({
    tag: tagId,
    note_text: noteText,
    ...(verseReferences !== undefined
      ? { verse_references: verseReferences }
      : {}),
  });
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/notes/${noteId}/`,
      {
        method: 'PATCH',
        body: body,
      }
    );
    if (!response.ok) {
      throw new Error('Failed to update note');
    }
    return await response.json();
  } catch (error) {
    console.error('Error updating note:', error);
    throw error;
  }
};

export const deleteNote = async (noteId: string) => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/notes/${noteId}/`,
      {
        method: 'DELETE',
      }
    );
    if (!response.ok) {
      throw new Error('Failed to delete note');
    }
    // 204 No Content response
    return response.status === 204 ? '' : await response.text();
  } catch (err) {
    console.error('Error deleting note:', err);
    throw new Error('Failed to delete your note, please try again');
  }
}

export const reorderNotes = async (
  tagId: string,
  updates: NotePositionUpdate[]
): Promise<void> => {
  const url = `${API_BASE_URL}/api/v1/notes/reorder/`;
  
  const response = await authenticatedFetch(url, {
    method: 'POST',
    body: JSON.stringify({
      tag_id: tagId,
      updates,
    }),
  });
  
  if (response.status === 409) {
    const error = await response.json();
    throw new ConflictError(error.message);
  }
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Reorder failed');
  }
};

/**
 * Compact, unpaginated index of every note in a tag in
 * canonical ascending order. Powers the order-ID badge
 * dropdown; the order ID is the 1-based array index.
 */
export const getNoteOrderIndex = async (
  tagId: string
): Promise<NoteOrderIndexEntry[]> => {
  const url =
    `${API_BASE_URL}/api/v1/notes/order-index/` +
    `?tag_id=${encodeURIComponent(tagId)}`;

  const response = await authenticatedFetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message ||
        error.detail ||
        'Failed to fetch note order index'
    );
  }

  const data: unknown = await response.json();
  // A malformed non-array 200 must not crash the
  // order-index memo at render — treat it as empty.
  return Array.isArray(data)
    ? (data as NoteOrderIndexEntry[])
    : [];
};

/**
 * Move a single note to before/after `targetNoteId` in
 * canonical ascending order. The server computes the midpoint
 * (and rebalances when the float gap is exhausted); unlike
 * `reorderNotes` it returns 200 with the new position.
 */
export const moveNote = async (
  tagId: string,
  noteId: string,
  targetNoteId: string,
  placement: MovePlacement
): Promise<MoveNoteResponse> => {
  const url = `${API_BASE_URL}/api/v1/notes/move/`;

  const response = await authenticatedFetch(url, {
    method: 'POST',
    body: JSON.stringify({
      tag_id: tagId,
      note_id: noteId,
      target_note_id: targetNoteId,
      placement,
    }),
  });

  if (response.status === 409) {
    const error = await response.json();
    throw new ConflictError(error.message);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || error.detail || 'Move failed'
    );
  }

  return await response.json();
};

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

/**
 * `tag_id` sentinel the API understands as "notes with no
 * tag". Real tag ids are `TAG…` strings and cannot collide.
 * An older backend that does not know the sentinel simply
 * matches no tag and returns an empty page — it never falls
 * back to returning every note.
 */
export const UNTAGGED_TAG_ID = 'untagged';

export const getNotes = async (
  tagId?: string,
  options?: {
    ordering?: string;
    page?: number;
    pageSize?: number;
    filesetId?: string;
  }
): Promise<PaginatedNotesResponse> => {
  const params = new URLSearchParams();
  
  if (tagId) {
    params.append('tag_id', tagId);
  }
  
  if (options?.ordering) {
    params.append('ordering', options.ordering);
  }
  
  if (options?.page) {
    params.append('page', options.page.toString());
  }
  
  if (options?.pageSize) {
    params.append('page_size', options.pageSize.toString());
  }
  
  if (options?.filesetId) {
    params.append('fileset_id', options.filesetId);
  }
  
  const url = `${API_BASE_URL}/api/v1/notes/?${params.toString()}`;
  
  try {
    const response = await publicFetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch notes');
    }
    const data = await response.json();
    
    // API returns paginated response
    return data;
  } catch (error) {
    console.error('Error fetching notes:', error);
    throw error;
  }
};

export const getLinkedNotes = async (
  verseReferences: { book: string; chapter: number; verse: number }[],
  filesetId?: string
): Promise<LinkedNotesResponse> => {
  const params = new URLSearchParams();
  if (filesetId) {
    params.append('fileset_id', filesetId);
  }
  const query = params.toString();
  const url =
    `${API_BASE_URL}/api/v1/notes/linked/` +
    (query ? `?${query}` : '');
  try {
    const response = await authenticatedFetch(url, {
      method: 'POST',
      body: JSON.stringify({
        verse_references: verseReferences,
      }),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch linked notes');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching linked notes:', error);
    throw error;
  }
};

export const getNote = async (noteId: string): Promise<Note> => {
  try {
    const response = await publicFetch(
      `${API_BASE_URL}/api/v1/notes/${noteId}/`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch note');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching note:', error);
    throw error;
  }
};

// ============================================
// COMMENT FUNCTIONS
// ============================================

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
