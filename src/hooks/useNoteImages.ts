import {
  useCallback,
  useEffect,
  useSyncExternalStore,
} from 'react';
import { fetchNoteImages } from '../api';
import type { NoteImage } from '../types';

/**
 * Session-scoped, per-note store for attached images. Note
 * payloads do not embed `images` — every consumer reads this
 * store instead, so one `GET /notes/{id}/images/` fetch serves
 * the card, the drag overlay's second card, and the edit modal
 * together. Entries live for the page session: pagination,
 * modal open/close, and remounts reuse the warm entry rather
 * than refetching. Signed-URL expiry inside a session is
 * handled by the bounded refresh below.
 *
 * The store is intentionally NOT in the persisted Zustand
 * store — signed URLs expire, so persisting them would serve
 * dead links (and force a persisted-schema bump).
 */

// A note's images are refetched at most this many times per
// image set — bounds the retry loop when the backend keeps
// minting signed URLs that still fail to load.
const MAX_IMAGE_REFRESHES = 3;

type NoteImagesStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface NoteImagesEntry {
  images: NoteImage[];
  status: NoteImagesStatus;
  /**
   * In-flight fetch — a second consumer (or an <img> onError
   * during the initial load) joins it instead of starting a
   * new request. Never rejects: failures flip `status` to
   * 'error' so callers can fire-and-forget safely.
   */
  promise: Promise<NoteImage[]> | null;
  /**
   * Signed-URL refresh budget, keyed to the image-set
   * signature: a refresh that mints new signed URLs resets
   * the count, and a failed fetch refunds its attempt so a
   * flaky network can't permanently burn it.
   */
  attempts: { sig: string; count: number };
  /**
   * Bumped on every `mutateNoteImages` write — a fetch that
   * resolves after a mutation is stale and must not
   * overwrite the mutated list.
   */
  gen: number;
  /** Bumped on every emit so useSyncExternalStore sees it. */
  version: number;
}

const entries = new Map<string, NoteImagesEntry>();
const subscribers = new Map<string, Set<() => void>>();

const getEntry = (noteId: string): NoteImagesEntry => {
  let entry = entries.get(noteId);
  if (!entry) {
    entry = {
      images: [],
      status: 'idle',
      promise: null,
      attempts: { sig: '', count: 0 },
      gen: 0,
      version: 0,
    };
    entries.set(noteId, entry);
  }
  return entry;
};

const emit = (noteId: string, entry: NoteImagesEntry) => {
  entry.version += 1;
  subscribers.get(noteId)?.forEach((cb) => cb());
};

const signatureOf = (images: NoteImage[]): string =>
  images.map((i) => i.signed_url ?? '').join('|');

/**
 * Runs a fetch through the entry: single-flight via
 * `entry.promise`, generation-checked so a mutation that
 * lands mid-flight wins. `sig` null = the unbudgeted initial
 * load; a signature = a budgeted refresh whose attempt is
 * refunded when the fetch itself fails (same semantics as
 * the per-component logic this replaces).
 */
const requestImages = (
  noteId: string,
  entry: NoteImagesEntry,
  sig: string | null
): Promise<NoteImage[]> => {
  const gen = entry.gen;
  entry.status = 'loading';
  emit(noteId, entry);
  const promise = fetchNoteImages(noteId)
    .then((images) => {
      if (entry.gen === gen) {
        entry.images = images;
        entry.status = 'loaded';
        emit(noteId, entry);
      }
      return images;
    })
    .catch(() => {
      if (entry.gen === gen) {
        entry.status = 'error';
        if (sig !== null && entry.attempts.sig === sig) {
          const count = entry.attempts.count;
          entry.attempts =
            count <= 1
              ? { sig: '', count: 0 }
              : { sig, count: count - 1 };
        }
        emit(noteId, entry);
      }
      // Resolve (not reject) with the last known list —
      // consumers never await, and an unhandled rejection
      // would reach the global error reporter.
      return entry.images;
    })
    .finally(() => {
      entry.promise = null;
    });
  entry.promise = promise;
  return promise;
};

/**
 * Bounded refetch for the <img> onError path — an expired
 * signed URL (600 s TTL) refetches the note's image list.
 * Joins an in-flight fetch instead of double-fetching, and
 * gives up after MAX_IMAGE_REFRESHES consecutive refreshes
 * that return the same failing signature.
 */
const refreshNoteImages = (
  noteId: string
): Promise<NoteImage[]> | null => {
  const entry = getEntry(noteId);
  if (entry.promise) return entry.promise;
  const sig = signatureOf(entry.images);
  const count =
    entry.attempts.sig === sig ? entry.attempts.count : 0;
  if (count >= MAX_IMAGE_REFRESHES) return null;
  entry.attempts = { sig, count: count + 1 };
  return requestImages(noteId, entry, sig);
};

/**
 * Enabled-edge trigger: an idle entry fetches; an errored
 * entry gets one re-armed retry per mount. The retry resets
 * the attempt budget so a card remounted after a dead-URL
 * streak isn't permanently silent.
 */
const ensureNoteImages = (noteId: string): void => {
  const entry = getEntry(noteId);
  if (entry.promise) return;
  if (entry.status === 'idle') {
    void requestImages(noteId, entry, null);
  } else if (entry.status === 'error') {
    entry.attempts = { sig: '', count: 0 };
    void refreshNoteImages(noteId);
  }
};

/**
 * Write path for uploads/deletes — the upload response is an
 * ImageSerializer object identical to the list elements, so
 * appending it locally avoids a refetch; deletes filter by
 * id. A mutation invalidates in-flight fetch results (gen
 * bump) and re-arms the refresh budget.
 */
export const mutateNoteImages = (
  noteId: string,
  updater: (images: NoteImage[]) => NoteImage[]
): void => {
  const entry = getEntry(noteId);
  entry.gen += 1;
  entry.images = updater(entry.images);
  entry.attempts = { sig: '', count: 0 };
  entry.status = 'loaded';
  emit(noteId, entry);
};

/**
 * Test helper: forgets every entry — suites share this
 * module, so entries persist between tests unless reset.
 */
export const resetNoteImages = () => {
  entries.clear();
};

export interface UseNoteImagesResult {
  images: NoteImage[];
  /** True while a fetch is in flight (initial or refresh). */
  loading: boolean;
  /** True when the last fetch failed. */
  error: boolean;
  /** Bounded, single-flight refetch for the onError path. */
  refresh: () => void;
}

/**
 * Subscribes to a note's image entry. The fetch starts when
 * `enabled` flips true (viewport gating lives in the caller);
 * while disabled nothing is fetched. All subscribers of one
 * note re-render together.
 */
export const useNoteImages = (
  noteId: string | undefined,
  enabled: boolean
): UseNoteImagesResult => {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!noteId) return () => undefined;
      let set = subscribers.get(noteId);
      if (!set) {
        set = new Set();
        subscribers.set(noteId, set);
      }
      set.add(onStoreChange);
      return () => {
        set.delete(onStoreChange);
      };
    },
    [noteId]
  );
  const getVersion = useCallback(
    () => (noteId ? getEntry(noteId).version : -1),
    [noteId]
  );
  useSyncExternalStore(subscribe, getVersion);

  useEffect(() => {
    if (enabled && noteId) ensureNoteImages(noteId);
  }, [enabled, noteId]);

  const refresh = useCallback(() => {
    if (noteId) void refreshNoteImages(noteId);
  }, [noteId]);

  const entry = noteId ? getEntry(noteId) : undefined;
  return {
    images: entry?.images ?? [],
    loading: entry?.status === 'loading',
    error: entry?.status === 'error',
    refresh,
  };
};
