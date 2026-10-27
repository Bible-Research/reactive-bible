import { Modal } from "@mantine/core";
import { useBibleStore } from "../store";
import { useEffect } from "react";
import { useNoteEditor } from "../hooks/useNoteEditor";
import type { NoteVerseReference } from "../hooks/useNoteEditor";
import NoteForm from "./NoteForm";
import { shallow } from "zustand/shallow";

interface AddStandaloneNoteModalProps {
  opened: boolean;
  onClose: () => void;
}

// A standalone note links no verses — the payload shape stays
// stable so the editor hook's dep-driven render is cheap.
const NO_REFERENCES: NoteVerseReference[] = [];

const AddStandaloneNoteModal = ({
  opened,
  onClose,
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
      // A rejection already produced a store notification —
      // swallow it so it stays off the global error reporter.
      void getTags().catch(() => {
        /* notified by the store */
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const editor = useNoteEditor({
    mode: "create",
    draftKey: "standalone-note",
    verseReferences: NO_REFERENCES,
    onSubmitted: (tagId) => {
      setLastSelectedTagId(tagId || null);
      onClose();
    },
  });

  return (
    <Modal opened={opened} onClose={onClose} title="New note" fullScreen>
      <NoteForm
        tags={tags}
        onSubmit={editor.submit}
        submitText="Submit"
        onTagDropdownOpen={() => {
          void getTags().catch(() => {
            /* notified by the store */
          });
        }}
        onAutoSave={editor.save}
        onDraftChange={editor.trackDraft}
        // Staged files ride in the draft — uploads run once a
        // save produces savedNoteId, and a reopen re-stages.
        onFilesChange={editor.trackFiles}
        // Includes files behind already-uploaded images so
        // their thumbs (and remove buttons) survive a reopen.
        initialFiles={editor.draft?.stagedFiles}
        note={
          // Gate on draft content, not just savedNoteId: while
          // the unmount flush's POST is still in flight the id
          // is null but the typed text is already tracked —
          // keying on the id alone would reopen a blank form.
          // Staged files count too: a files-only draft (no
          // text, never saved) must restore its tag.
          editor.draft &&
          (editor.draft.savedNoteId ||
            editor.draft.text ||
            editor.draft.stagedFiles.length > 0)
            ? {
                tagId:
                  editor.draft.tagId || lastSelectedTagId || "",
                text: editor.draft.text,
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
