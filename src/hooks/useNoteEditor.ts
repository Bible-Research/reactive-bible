import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { showNotification } from '@mantine/notifications';
import { addTagNote, editNote, UNTAGGED_TAG_ID } from '../api';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
import { clearNotesCache } from '../utils/cacheManager';
import { toPlainText } from '../utils/tiptapContent';
import type { Note } from '../types';

/** The `verse_references` item shape the notes API expects. */
export interface NoteVerseReference {
  book: string;
  chapter: number;
  verse: number;
}

/**
 * Save state for one editor session. In create mode it holds
 * the note id the first save POSTed plus the latest form
 * contents; in edit mode it pins the note id up front. Either
 * way `queue` serializes writes so a save can never run beside
 * a still-pending one and double-POST a draft.
 */
export interface NoteEditorDraft {
  /** Server id of the note saves PATCH. Null until a POST
   *  created the note (create mode only). */
  savedNoteId: string | null;
  /** Latest form contents — saved or still being typed. */
  tagId: string;
  text: string;
  /**
   * Serializes saves across modal mounts: the add/edit modals
   * unmount on close, so a remounted form's own save lock
   * starts empty — each save must chain onto a still-pending
   * write from the previous mount rather than race it.
   */
  queue: Promise<unknown>;
}

// Drafts are session state, not component state: the parents
// gate the modals on `opened`, so component-local state dies on
// close and reopening would POST a duplicate of the note
// autosave already created. Keyed by the caller's draftKey AND
// the auth token so one user's draft can never resume in
// another account's session on the same device.
const drafts = new Map<string, NoteEditorDraft>();

// Drafts are keyed by the session token — a token change
// (logout, or a different account logging in) makes every
// stored entry unreachable, so drop them instead of letting
// the Map accumulate abandoned drafts for the rest of the
// page session. In-flight saves are unaffected: their queue
// closures hold direct references to the draft objects.
useAuthStore.subscribe((state, prev) => {
  if (state.token !== prev.token) drafts.clear();
});

/**
 * Test helper: forgets every draft. Suites share this module,
 * so drafts persist between tests unless reset.
 */
export const resetNoteEditorDrafts = () => {
  drafts.clear();
};

interface UseNoteEditorOptions {
  /**
   * 'create' POSTs the first save and PATCHes that note after;
   * 'edit' always PATCHes `note.id`.
   */
  mode: 'create' | 'edit';
  /** Edit mode: the note being edited. */
  note?: Note | null;
  /**
   * Draft slot for create mode — keeps the autosaved note id
   * and contents alive across the modal's unmount so a reopen
   * resumes the draft instead of POSTing a duplicate. Include
   * the verse selection in the key: a draft about one passage
   * must not surface when adding a note to another.
   */
  draftKey?: string;
  /**
   * Verse links sent with every save. The LATEST array is read
   * at save time — in edit mode it must reflect the picker's
   * current refs or an autosave/X-close would silently drop
   * verse-link changes.
   */
  verseReferences: NoteVerseReference[];
  /**
   * Runs after a successful submit — the modal's close
   * side-effects (clear the selection, remember the tag,
   * close). Not run when the save failed.
   */
  onSubmitted?: (tagId: string) => void;
}

interface UseNoteEditorResult {
  /**
   * Autosave tick / unmount-flush target. Skips tagless and
   * empty drafts (the API would reject them every tick).
   * Resolves true when a write happened.
   */
  save: (tagId: string, text: string) => Promise<boolean>;
  /**
   * Form submit target: validates, shares the save path (a
   * pending autosave is awaited; an autosaved note is PATCHed,
   * never re-POSTed), notifies on failure, runs onSubmitted on
   * success. Resolves true when the submit succeeded.
   */
  submit: (tagId: string, text: string) => Promise<boolean>;
  /** Reports live form contents into the draft so a reopen
   *  restores the in-progress note, not just the last saved
   *  text. */
  trackDraft: (tagId: string, text: string) => void;
  /** The resumed draft for seeding the form, if any. */
  draft: {
    savedNoteId: string | null;
    tagId: string;
    text: string;
  } | null;
  /** True once any save reached the server — cached lists are
   *  stale from then on. */
  hasSaved: () => boolean;
  /**
   * Edit mode: refetch the page the route is actually showing
   * — the note's OWN tag with the store's current
   * ordering+page. Refetching the form's newly selected tag
   * would render a different tag's notes under the current
   * heading, and a bare fetchNotes(tagId) would bounce to
   * page 1 with no ordering.
   */
  refreshViewedNotes: () => Promise<void>;
}

/**
 * Shared editor contract for the three note modals:
 *
 * - WHEN it saves: only with a tag selected and non-blank text
 *   — a `tag: ''`/empty write used to fire a silent 400 every
 *   autosave tick.
 * - WHAT it saves: tag + text + `verse_references` on every
 *   write — EditNoteModal's autosave used to omit the refs and
 *   drop picker changes on X/backdrop close.
 * - CREATE vs EDIT: create mode POSTs once, records the note id
 *   in a draft that survives the modal's unmount, and PATCHes
 *   after; edit mode always PATCHes the note being edited.
 * - Submit goes through the same save path, surfaces failures
 *   via notification instead of a bare console.error, and in
 *   edit mode refetches the viewed tag's current page before
 *   closing.
 */
export const useNoteEditor = ({
  mode,
  note,
  draftKey,
  verseReferences,
  onSubmitted,
}: UseNoteEditorOptions): UseNoteEditorResult => {
  const token = useAuthStore((state) => state.token);

  const refsRef = useRef(verseReferences);
  const noteRef = useRef(note);
  const onSubmittedRef = useRef(onSubmitted);
  useEffect(() => {
    refsRef.current = verseReferences;
    noteRef.current = note;
    onSubmittedRef.current = onSubmitted;
  });

  // True once any save reached the server — the cached notes
  // list is stale and must be refreshed on close.
  const savedRef = useRef(false);

  const scopedKey = useMemo(() => {
    const base =
      mode === 'edit'
        ? note?.id
          ? `edit-note:${note.id}`
          : null
        : draftKey ?? null;
    return base ? `${token ?? 'anon'}:${base}` : null;
  }, [mode, draftKey, note?.id, token]);

  const ensureDraft = useCallback((): NoteEditorDraft | null => {
    if (!scopedKey) return null;
    let draft = drafts.get(scopedKey);
    if (!draft) {
      draft = {
        // Edit mode pins the draft to the note being edited —
        // the first save PATCHes it instead of POSTing.
        savedNoteId:
          mode === 'edit' ? noteRef.current?.id ?? null : null,
        tagId: '',
        text: '',
        queue: Promise.resolve(),
      };
      drafts.set(scopedKey, draft);
    }
    return draft;
  }, [scopedKey, mode]);

  const save = useCallback(
    (tagId: string, text: string): Promise<boolean> => {
      // A tagless or empty save would only produce a rejected
      // write — autosave ticks and the unmount flush both come
      // through here, so the contract lives in one place.
      if (!tagId || !toPlainText(text).trim()) {
        return Promise.resolve(false);
      }
      const draft = ensureDraft();
      if (!draft) return Promise.resolve(false);
      const run = draft.queue.then(async (): Promise<boolean> => {
        const refs = refsRef.current;
        if (draft.savedNoteId) {
          await editNote(draft.savedNoteId, tagId, text, refs);
        } else {
          const created = await addTagNote(tagId, text, refs);
          draft.savedNoteId = created?.id ?? null;
        }
        // Record what the server holds so a reopened modal can
        // restore the draft.
        draft.tagId = tagId;
        draft.text = text;
        savedRef.current = true;
        // Cached notes pages are stale after every write — a
        // later fetchNotes must hit the API.
        clearNotesCache();
        return true;
      });
      draft.queue = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },
    [ensureDraft]
  );

  const refreshViewedNotes = useCallback(async () => {
    const target = noteRef.current;
    if (!target) return;
    const { notesOrdering, notesPage, fetchNotes } =
      useBibleStore.getState();
    // A null tag means the note lives in the route's virtual
    // "untagged" section — refetch via the sentinel id.
    await fetchNotes(target.tag?.id ?? UNTAGGED_TAG_ID, {
      ordering: notesOrdering ?? undefined,
      page: notesPage,
    });
  }, []);

  const submit = useCallback(
    async (tagId: string, text: string): Promise<boolean> => {
      // The API rejects a tagless or empty note — surface that
      // instead of a silently swallowed console.error.
      if (!tagId) {
        showNotification({
          title: 'Cannot save note',
          message: 'Please choose a tag.',
          color: 'red',
        });
        return false;
      }
      if (!toPlainText(text).trim()) {
        showNotification({
          title: 'Cannot save note',
          message: 'Note text is required.',
          color: 'red',
        });
        return false;
      }
      try {
        const saved = await save(tagId, text);
        // save() declined the write (no draft slot to persist
        // into) — nothing reached the server, so do not
        // refresh, drop the draft, or report a submit.
        if (!saved) return false;
        if (mode === 'edit') {
          // Refresh the tag the route displays (the note's
          // own), not the select value — a moved note belongs
          // to a different tag now. Best-effort: fetchNotes
          // already notified any failure.
          void refreshViewedNotes().catch(() => {
            /* fetchNotes already notified the failure */
          });
        }
        // A submitted draft is finished — drop it so the next
        // open starts a new note instead of resuming this one.
        if (scopedKey) drafts.delete(scopedKey);
        onSubmittedRef.current?.(tagId);
        return true;
      } catch (error) {
        console.error(error);
        showNotification({
          title: 'Error',
          message: 'Failed to save note. Please try again.',
          color: 'red',
        });
        return false;
      }
    },
    [save, mode, refreshViewedNotes, scopedKey]
  );

  const trackDraft = useCallback(
    (tagId: string, text: string) => {
      // Track live contents too, not just saved ones — a
      // reopen restores the in-progress draft.
      const draft = ensureDraft();
      if (!draft) return;
      draft.tagId = tagId;
      draft.text = text;
    },
    [ensureDraft]
  );

  const hasSaved = useCallback(() => savedRef.current, []);

  // The resumed draft for seeding the form — only meaningful
  // when one already exists (created lazily otherwise).
  const draft = useMemo(() => {
    if (!scopedKey) return null;
    const existing = drafts.get(scopedKey);
    if (!existing) return null;
    return {
      savedNoteId: existing.savedNoteId,
      tagId: existing.tagId,
      text: existing.text,
    };
  }, [scopedKey]);

  return {
    save,
    submit,
    trackDraft,
    draft,
    hasSaved,
    refreshViewedNotes,
  };
};
