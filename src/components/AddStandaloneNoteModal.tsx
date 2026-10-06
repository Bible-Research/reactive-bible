import { Modal } from "@mantine/core";
import { addTagNote, editNote } from "../api";
import { useBibleStore } from "../store";
import { useEffect, useRef } from "react";
import NoteForm from "./NoteForm";

interface AddStandaloneNoteModalProps {
  opened: boolean;
  onClose: () => void;
}

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
  }));

  // Once autosave creates the note, later saves (and Submit)
  // must PATCH that note instead of POSTing duplicates.
  const savedNoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (opened) {
      getTags();
      savedNoteIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const handleAutoSave = async (tagId: string, text: string) => {
    if (savedNoteIdRef.current) {
      await editNote(savedNoteIdRef.current, tagId, text);
      return;
    }
    const created = await addTagNote(tagId, text, []);
    savedNoteIdRef.current = created?.id ?? null;
  };

  const handleSubmit = async (tagId: string, text: string) => {
    try {
      // Shares savedNoteIdRef with autosave: an existing draft is
      // PATCHed, and a note created by submit is recorded so a
      // late autosave tick PATCHes instead of POSTing a duplicate.
      await handleAutoSave(tagId, text);
      setLastSelectedTagId(tagId || null);
      onClose();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="New note" fullScreen>
      <NoteForm
        tags={tags}
        onSubmit={handleSubmit}
        submitText="Submit"
        onTagDropdownOpen={() => getTags()}
        onAutoSave={handleAutoSave}
        note={
          lastSelectedTagId
            ? { tagId: lastSelectedTagId, text: "" }
            : undefined
        }
      />
    </Modal>
  );
};

export default AddStandaloneNoteModal;
