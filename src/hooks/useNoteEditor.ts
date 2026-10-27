import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { showNotification } from '@mantine/notifications';
import {
  addTagNote,
  deleteImage,
  editNote,
  uploadNoteImage,
  UNTAGGED_TAG_ID,
} from '../api';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
import { clearNotesCache } from '../utils/cacheManager';
import { toPlainText } from '../utils/tiptapContent';
import { imageFileSignature } from './useStagedImages';
import type { Note, NoteImage } from '../types';

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
   * Files staged in the form awaiting upload once the note
   * exists. The note-images endpoint needs `note_pk` in the
   * URL, so uploads run inside the save queue right after a
   * POST/PATCH resolves.
   */
  pendingFiles: File[];
  /**
   * Staged files already uploaded, keyed by content
   * signature (a re-selected file mints a new File object,
   * so File identity misses it) and carrying the returned
   * NoteImage so removing the thumb can detach the image
   * server-side and a reopen can re-stage the File.
   */
  uploadedFiles: Map<string, { file: File; image: NoteImage }>;
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
  /**
   * Images already attached to the note being edited — an
   * image-only note is a valid save target even with no
   * text, linked verses, or staged files. Read at save
   * time, so callers may pass live state.
   */
  attachedImageCount?: number;
}

interface UseNoteEditorResult {
  /**
   * Autosave tick / unmount-flush target. Skips tagless drafts
   * and writes that would leave the note empty — no text and
   * no linked verses. Resolves true when a write happened.
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
  /**
   * Syncs the form's staged files into the draft so the next
   * save — autosave tick, submit, or unmount flush — uploads
   * them once `savedNoteId` exists.
   */
  trackFiles: (files: File[]) => void;
  /** The resumed draft for seeding the form, if any. */
  draft: {
    savedNoteId: string | null;
    tagId: string;
    text: string;
    /** Files still awaiting upload. */
    pendingFiles: File[];
    /**
     * Every file the form should show a thumb for on
     * reopen — still-pending uploads plus the File objects
     * behind images a previous save already attached, so
     * an attached image is never invisible in the form.
     */
    stagedFiles: File[];
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
 * - WHEN it saves: only with a tag selected and content —
 *   note text or at least one linked verse (a verse-only note
 *   is a valid bookmark). A `tag: ''` write used to fire a
 *   silent 400 every autosave tick.
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
  attachedImageCount = 0,
}: UseNoteEditorOptions): UseNoteEditorResult => {
  const token = useAuthStore((state) => state.token);

  const refsRef = useRef(verseReferences);
  const noteRef = useRef(note);
  const onSubmittedRef = useRef(onSubmitted);
  const attachedCountRef = useRef(attachedImageCount);
  useEffect(() => {
    refsRef.current = verseReferences;
    noteRef.current = note;
    onSubmittedRef.current = onSubmitted;
    attachedCountRef.current = attachedImageCount;
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
        pendingFiles: [],
        uploadedFiles: new Map<
          string,
          { file: File; image: NoteImage }
        >(),
        queue: Promise.resolve(),
      };
      drafts.set(scopedKey, draft);
    }
    return draft;
  }, [scopedKey, mode]);

  const save = useCallback(
    (tagId: string, text: string): Promise<boolean> => {
      // A tagless save or a write leaving the note with
      // neither text nor linked verses carries nothing —
      // autosave ticks and the unmount flush both come
      // through here, so the contract lives in one place.
      // Staged image files count as content: the backend
      // accepts a blank note_text, so an image-only note is
      // valid. So do images a previous save already
      // attached (a tag edit on an image-only note must not
      // be skipped) and, in edit mode, the note's existing
      // attachments.
      if (!tagId) {
        return Promise.resolve(false);
      }
      const draft = ensureDraft();
      if (!draft) return Promise.resolve(false);
      if (
        !toPlainText(text).trim() &&
        refsRef.current.length === 0 &&
        draft.pendingFiles.length === 0 &&
        draft.uploadedFiles.size === 0 &&
        attachedCountRef.current === 0
      ) {
        return Promise.resolve(false);
      }
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
        // Staged attachments upload once the note exists —
        // the endpoint needs note_pk in the URL. Sequential
        // so one failure notifies and the rest still attempt
        // (mirrors CommentThread.uploadImages).
        const noteId = draft.savedNoteId;
        if (noteId && draft.pendingFiles.length > 0) {
          for (const file of [...draft.pendingFiles]) {
            const signature = imageFileSignature(file);
            if (draft.uploadedFiles.has(signature)) {
              // A re-selected copy of an attached file —
              // drop it from pending without re-uploading.
              draft.pendingFiles = draft.pendingFiles.filter(
                (f) => f !== file
              );
              continue;
            }
            try {
              const image = await uploadNoteImage(noteId, file);
              if (!draft.pendingFiles.includes(file)) {
                // The thumb was removed while the upload
                // was in flight — detach the just-created
                // image or it lingers server-side with no
                // UI trace.
                void deleteImage(image.id)
                  .catch(() => {
                    showNotification({
                      color: 'red',
                      title: 'Error',
                      message: 'Failed to delete image.',
                    });
                  });
                continue;
              }
              // Signature dedup: the form still shows the
              // thumb, and its next onFilesChange report
              // would otherwise re-stage the uploaded file.
              draft.uploadedFiles.set(signature, {
                file,
                image,
              });
              draft.pendingFiles = draft.pendingFiles.filter(
                (f) => f !== file
              );
            } catch (err: unknown) {
              const msg =
                err instanceof Error
                  ? err.message
                  : 'Failed to upload image.';
              showNotification({
                color: 'red',
                title: 'Upload failed',
                message: msg,
              });
            }
          }
        }
        // Cached notes pages are stale after every write — a
        // later fetchNotes must hit the API. (Images are not
        // part of the notes payload — useNoteImages serves
        // them — so image writes invalidate nothing here.)
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
    const {
      lastSelectedTagId,
      notesOrdering,
      notesPage,
      fetchNotes,
    } = useBibleStore.getState();
    // Refetch the tag page the route is actually showing: the
    // note's own tag may have changed mid-edit (and the note
    // prop is stale by then), and dropping the current page +
    // ordering would bounce the user back to page 1. A null
    // tag falls back to the route's virtual "untagged" view.
    await fetchNotes(
      lastSelectedTagId ?? target.tag?.id ?? UNTAGGED_TAG_ID,
      {
        ordering: notesOrdering ?? undefined,
        page: notesPage,
      }
    );
  }, []);

  const submit = useCallback(
    async (tagId: string, text: string): Promise<boolean> => {
      // The API rejects a tagless note, and a note with
      // neither text nor linked verses carries nothing —
      // surface both instead of a silently swallowed
      // console.error.
      if (!tagId) {
        showNotification({
          title: 'Cannot save note',
          message: 'Please choose a tag.',
          color: 'red',
        });
        return false;
      }
      const submitDraft = ensureDraft();
      if (
        !toPlainText(text).trim() &&
        refsRef.current.length === 0 &&
        (submitDraft?.pendingFiles.length ?? 0) === 0 &&
        (submitDraft?.uploadedFiles.size ?? 0) === 0 &&
        attachedCountRef.current === 0
      ) {
        showNotification({
          title: 'Cannot save note',
          message:
            'Add note text, attach an image, or link a ' +
            'verse reference.',
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
    [save, mode, refreshViewedNotes, scopedKey, ensureDraft]
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

  const trackFiles = useCallback(
    (files: File[]) => {
      const draft = ensureDraft();
      if (!draft) return;
      // A thumb whose file already uploaded was removed:
      // detach the server-side image too — otherwise it
      // stays attached to the note with no UI trace (and
      // NoteCard would still render it).
      for (const [signature, entry] of draft.uploadedFiles) {
        if (files.includes(entry.file)) continue;
        draft.uploadedFiles.delete(signature);
        void deleteImage(entry.image.id)
          .catch(() => {
            showNotification({
              color: 'red',
              title: 'Error',
              message: 'Failed to delete image.',
            });
          });
      }
      // Keep only files not yet uploaded — the form reports
      // its whole staged list, including thumbs for files a
      // previous save already attached.
      draft.pendingFiles = files.filter(
        (f) =>
          !draft.uploadedFiles.has(imageFileSignature(f))
      );
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
      pendingFiles: existing.pendingFiles,
      // Re-stage the File behind every attached image too —
      // an already-uploaded attachment must stay visible
      // (and removable) in the reopened form.
      stagedFiles: [
        ...[...existing.uploadedFiles.values()].map(
          (u) => u.file
        ),
        ...existing.pendingFiles,
      ],
    };
  }, [scopedKey]);

  return {
    save,
    submit,
    trackDraft,
    trackFiles,
    draft,
    hasSaved,
    refreshViewedNotes,
  };
};
