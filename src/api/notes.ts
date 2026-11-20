/**
 * Notes CRUD, ordering (reorder/move/order-index), paginated
 * and linked-note fetches. `UNTAGGED_TAG_ID` is the sentinel
 * `tag_id` for notes with no tag.
 */
import type {
  Note,
  NoteImage,
  NoteOrderIndexEntry,
  NotePositionUpdate,
  MovePlacement,
  MoveNoteResponse,
  PaginatedNotesResponse,
  LinkedNotesResponse,
} from '../types';
import {
  authenticatedFetch,
  authenticatedUpload,
  fetchJson,
  publicFetch,
} from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import { clearNotesCache } from '../utils/cacheManager';
import {
  ConflictError,
  RateLimitError,
  errorDetailsOf,
  throwHttpError,
} from './errors';
import type { TrackedError } from './errors';

export const addTagNote = async (
  tagId: string,
  tagNoteText: string,
  verseReferences: { book: string; chapter: number; verse: number }[],
  isPublic?: boolean,
  isPublished?: boolean
): Promise<Note> => {
  const created = await fetchJson<Note>(
    authenticatedFetch,
    `${API_BASE_URL}/api/v1/notes/`,
    'Failed to create note',
    {
      method: 'POST',
      body: JSON.stringify({
        tag: tagId,
        note_text: tagNoteText,
        verse_references: verseReferences,
        // `public`/`published` are sent only when the caller
        // supplied them — omitting lets the server inherit
        // the tag's flags.
        ...(isPublic !== undefined ? { public: isPublic } : {}),
        ...(isPublished !== undefined
          ? { published: isPublished }
          : {}),
      }),
    }
  );
  // A new note changes the tag's cached pages (membership and
  // ordering shift) — invalidate so a cached page can't hide it.
  clearNotesCache(tagId);
  return created;
};

export const editNote = async (
  noteId: string,
  tagId: string,
  noteText: string,
  verseReferences?: { book: string; chapter: number; verse: number }[],
  isPublic?: boolean,
  isPublished?: boolean
): Promise<Note> => {
  // verse_references replaces the note's verse links when
  // present; omitting it leaves them untouched.
  const updated = await fetchJson<Note>(
    authenticatedFetch,
    `${API_BASE_URL}/api/v1/notes/${noteId}/`,
    'Failed to update note',
    {
      method: 'PATCH',
      body: JSON.stringify({
        tag: tagId,
        note_text: noteText,
        ...(verseReferences !== undefined
          ? { verse_references: verseReferences }
          : {}),
        ...(isPublic !== undefined ? { public: isPublic } : {}),
        ...(isPublished !== undefined
          ? { published: isPublished }
          : {}),
      }),
    }
  );
  // The note may have moved to a different tag — its previous
  // tag's cached pages are stale too, so invalidate broadly.
  clearNotesCache();
  return updated;
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
      throwHttpError(response, 'Failed to delete note');
    }
    // The note's tag is unknown here — clear all cached pages.
    clearNotesCache();
    // 204 No Content response
    return response.status === 204 ? '' : await response.text();
  } catch (err) {
    console.error('Error deleting note:', err);
    // Re-wrap with a friendlier message without losing the
    // failure kind: keep the RateLimitError class and copy the
    // tracked code/status/endpoint so a 429 still drops in
    // `sentryBeforeSend` instead of emitting a handled-api
    // error event.
    const details = errorDetailsOf(err);
    const wrapped = (
      err instanceof RateLimitError
        ? new RateLimitError(
            'Failed to delete your note, please try again'
          )
        : new Error(
            'Failed to delete your note, please try again'
          )
    ) as TrackedError;
    wrapped.errorCode = details.code;
    wrapped.status = details.status;
    wrapped.endpoint = details.endpoint;
    throw wrapped;
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
    throwHttpError(response, error.detail || 'Reorder failed');
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
    throwHttpError(
      response,
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
    throwHttpError(
      response,
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
    /**
     * Serve `note_text` in this language when a ready
     * translation row exists; the server falls back to the
     * original on any miss (never a 404) and reports what it
     * served via `served_language`.
     */
    lang?: string;
    /**
     * Expands the `tag_id` filter to the tag's whole subtree —
     * the merged "include sub-tags" view. Ignored by the
     * server for `untagged` and reorder stays per-tag.
     */
    includeDescendants?: boolean;
  }
): Promise<PaginatedNotesResponse> => {
  const params = new URLSearchParams();

  if (tagId) {
    params.append('tag_id', tagId);
  }

  if (options?.includeDescendants) {
    params.append('include_descendants', 'true');
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

  if (options?.lang) {
    params.append('lang', options.lang);
  }

  const url = `${API_BASE_URL}/api/v1/notes/?${params.toString()}`;

  // API returns paginated response
  return fetchJson<PaginatedNotesResponse>(
    publicFetch,
    url,
    'Failed to fetch notes'
  );
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
  return fetchJson<LinkedNotesResponse>(
    authenticatedFetch,
    url,
    'Failed to fetch linked notes',
    {
      method: 'POST',
      body: JSON.stringify({
        verse_references: verseReferences,
      }),
    }
  );
};

export const getNote = (
  noteId: string,
  lang?: string
): Promise<Note> =>
  fetchJson<Note>(
    publicFetch,
    `${API_BASE_URL}/api/v1/notes/${noteId}/` +
      (lang ? `?lang=${encodeURIComponent(lang)}` : ''),
    'Failed to fetch note'
  );

/**
 * Owner-only author verification of a machine translation:
 * POST sets it, DELETE clears it. Both idempotent — a
 * `ready` row is required; the server answers
 * `pending`/`failed`/`source` rows with 409
 * `translation_not_ready`.
 */
export const setNoteTranslationVerified = async (
  noteId: string,
  lang: string,
  verified: boolean
): Promise<void> => {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/v1/notes/${noteId}` +
      `/translations/${encodeURIComponent(lang)}/verify/`,
    { method: verified ? 'POST' : 'DELETE' }
  );
  if (!response.ok) {
    throwHttpError(
      response,
      'Failed to update translation verification'
    );
  }
};

/**
 * Owner-only retry of `failed` translation rows — re-marks
 * them `pending` and enqueues a fresh run; returns the
 * number of rows requeued.
 */
export const retranslateNote = async (
  noteId: string
): Promise<{ requeued: number }> => {
  return fetchJson<{ requeued: number }>(
    authenticatedFetch,
    `${API_BASE_URL}/api/v1/notes/${noteId}/retranslate/`,
    'Failed to retranslate note',
    { method: 'POST' }
  );
};

/**
 * Upload one image to a note. The note must already exist —
 * there is no pre-upload endpoint — so create-mode modals
 * stage files locally and upload only after the first save
 * produced `savedNoteId`.
 */
export const uploadNoteImage = async (
  noteId: string,
  file: File,
): Promise<NoteImage> => {
  const fd = new FormData();
  fd.append('file', file);
  const response = await authenticatedUpload(
    `${API_BASE_URL}/api/v1/notes/${noteId}/images/`,
    fd,
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message =
      data.detail ||
      (Array.isArray(data.file) ? data.file[0] : data.file) ||
      'Failed to upload image.';
    throwHttpError(response, message);
  }
  return response.json();
};

/**
 * A note's attached images — the only way they reach the
 * client; note payloads do not embed `images`. `NoteCard`
 * lazy-fetches this per visible card through the shared
 * `useNoteImages` store, and a failed <img> load refetches
 * it (bounded) since the signed URLs expire (600 s TTL).
 * `AllowAny` server-side: public notes' images are readable
 * anonymously.
 */
export const fetchNoteImages = (
  noteId: string
): Promise<NoteImage[]> =>
  fetchJson<NoteImage[]>(
    publicFetch,
    `${API_BASE_URL}/api/v1/notes/${noteId}/images/`,
    'Failed to fetch images.'
  );
