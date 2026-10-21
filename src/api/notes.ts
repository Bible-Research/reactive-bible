/**
 * Notes CRUD, ordering (reorder/move/order-index), paginated
 * and linked-note fetches. `UNTAGGED_TAG_ID` is the sentinel
 * `tag_id` for notes with no tag.
 */
import type {
  Note,
  NoteOrderIndexEntry,
  NotePositionUpdate,
  MovePlacement,
  MoveNoteResponse,
  PaginatedNotesResponse,
  LinkedNotesResponse,
} from '../types';
import {
  authenticatedFetch,
  publicFetch,
} from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import { ConflictError } from './errors';
import { clearNotesCache } from '../utils/cacheManager';

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
    const created = await response.json();
    // A new note changes the tag's cached pages (membership and
    // ordering shift) — invalidate so a cached page can't hide it.
    clearNotesCache(tagId);
    return created;
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
    const updated = await response.json();
    // The note may have moved to a different tag — its previous
    // tag's cached pages are stale too, so invalidate broadly.
    clearNotesCache();
    return updated;
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
    // The note's tag is unknown here — clear all cached pages.
    clearNotesCache();
    // 204 No Content response
    return response.status === 204 ? '' : await response.text();
  } catch (error) {
    console.error('Error deleting note:', error);
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
    // A non-JSON 409 body must still surface as ConflictError —
    // callers branch on `instanceof`.
    const error = await response.json().catch(() => ({}));
    throw new ConflictError(
      error.message || 'Notes were modified elsewhere'
    );
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Reorder failed');
  }

  // Reordered pages must not keep serving the pre-reorder order.
  clearNotesCache(tagId);
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
    // A non-JSON 409 body must still surface as ConflictError —
    // callers branch on `instanceof`.
    const error = await response.json().catch(() => ({}));
    throw new ConflictError(
      error.message || 'Notes were modified elsewhere'
    );
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || error.detail || 'Move failed'
    );
  }

  const result: MoveNoteResponse = await response.json();
  // A move changes page membership/positions for the tag.
  clearNotesCache(tagId);
  return result;
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
