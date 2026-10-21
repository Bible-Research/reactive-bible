import { Modal } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { addTagNote, editNote } from "../api";
import { useBibleStore } from "../store";
import { useEffect } from "react";
import NoteForm from "./NoteForm";
import { shallow } from "zustand/shallow";
import {
  emptyNoteDraft,
  type NoteDraftRef,
} from "./noteDraft";

interface AddStandaloneNoteModalProps {
  opened: boolean;
  onClose: () => void;
  /**
   * Autosave draft owned by the parent — survives the form
   * unmounting on close so a reopen PATCHes the autosaved note
   * instead of POSTing a duplicate.
   */
  draftRef: NoteDraftRef;
}

const AddStandaloneNoteModal = ({
  opened,
  onClose,
  draftRef,
}: AddStandaloneNoteModalProps) => {
  const {
    tags,
    getTags,
    lastSelectedTagId,
    setLastSelectedTagId,
  } = useBibleStore((state) => ({
    tags: state.tags,
    getTags: state.getTags,
    lastSelectedTagId: state.lastSelectedTagId,
    setLastSelectedTagId: state.setLastSelectedTagId,
  }), shallow);

  useEffect(() => {
    if (opened) {
      void getTags().catch(() => { /* notified by the store */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  // Serialized through the draft's queue: a reopened form's
  // in-flight lock starts empty, so without this a save could
  // run beside a still-pending POST from the previous mount and
  // create a duplicate.
  const handleAutoSave = (tagId: string, text: string) => {
    const draft = draftRef.current;
    const run = draft.queue.then(async () => {
      if (draft.savedNoteId) {
        await editNote(draft.savedNoteId, tagId, text);
      } else {
        const created = await addTagNote(tagId, text, []);
        draft.savedNoteId = created?.id ?? null;
      }
      // Record what the server holds so a reopened modal can
      // restore the draft.
      draft.tagId = tagId;
      draft.text = text;
    });
    draft.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  const handleSubmit = async (tagId: string, text: string) => {
    try {
      // Shares the draft with autosave: an existing draft is
      // PATCHed, and a note created by submit is recorded so a
      // late autosave tick PATCHes instead of POSTing a
      // duplicate.
      await handleAutoSave(tagId, text);
      // The draft was submitted — reset so the next open starts
      // a new note instead of resuming this one.
      draftRef.current = emptyNoteDraft();
      setLastSelectedTagId(tagId || null);
      onClose();
    } catch (error) {
      console.error(error);
      showNotification({
        title: 'Error',
        message: 'Failed to save note. Please try again.',
        color: 'red',
      });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="New note" fullScreen>
      <NoteForm
        tags={tags}
        onSubmit={handleSubmit}
        submitText="Submit"
        onTagDropdownOpen={() => {
          void getTags().catch(() => {
            /* notified by the store */
          });
        }}
        onAutoSave={handleAutoSave}
        onDraftChange={(tagId, text) => {
          // Track live form contents so a reopen restores the
          // in-progress draft, not just the last saved text.
          draftRef.current.tagId = tagId;
          draftRef.current.text = text;
        }}
        note={
          // Gate on draft content, not just savedNoteId: while
          // the unmount flush's POST is still in flight the id
          // is null but the typed text is already tracked —
          // keying on the id alone would reopen a blank form.
          draftRef.current.savedNoteId || draftRef.current.text
            ? {
                tagId:
                  draftRef.current.tagId || lastSelectedTagId || "",
                text: draftRef.current.text,
              }
            : lastSelectedTagId
              ? { tagId: lastSelectedTagId, text: "" }
              : undefined
        }
      />
    </Modal>
  );
};

export default AddStandaloneNoteModal;
