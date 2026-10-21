import type { MutableRefObject } from 'react';

/**
 * Autosave draft state for the add-note modals, owned by the
 * parent that controls `opened`. The modals unmount on close —
 * a component-local saved-note id would be lost, so reopening
 * would POST a duplicate instead of PATCHing the note autosave
 * already created. Holding the draft in the parent makes the
 * close/reopen cycle a pause, not a new note.
 */
export interface NoteDraft {
  /** Server id of the note the first autosave POST created. */
  savedNoteId: string | null;
  /**
   * Latest form contents as last written to the server —
   * reopened modals restore them so the draft resumes instead
   * of starting blank.
   */
  tagId: string;
  text: string;
  /**
   * Serializes saves across modal mounts: a reopened form's
   * in-flight lock starts empty, so it must chain onto any
   * still-pending save from the previous mount rather than
   * POSTing a second note before `savedNoteId` is recorded.
   */
  queue: Promise<unknown>;
}

export type NoteDraftRef = MutableRefObject<NoteDraft>;

export const emptyNoteDraft = (): NoteDraft => ({
  savedNoteId: null,
  tagId: '',
  text: '',
  queue: Promise.resolve(),
});
