import { useEffect } from "react";
import { Modal } from "@mantine/core";
import { editNote } from "../api";
import { useBibleStore } from "../store";
import NoteForm from "./NoteForm";
import { Note } from "../types";

interface EditNoteModalProps {
  opened: boolean;
  onClose: () => void;
  note: Note | null;
}

const EditNoteModal = ({ opened, onClose, note }: EditNoteModalProps) => {
  const { tags, getTags, fetchNotes } = useBibleStore((state) => ({
    tags: state.tags,
    getTags: state.getTags,
    fetchNotes: state.fetchNotes,
  }));

  useEffect(() => {
    if (opened) {
      // Ensure tags are loaded (uses cache if available)
      getTags();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]); // Only run when modal opens

  const handleSubmit = async (tagId: string, text: string) => {
    if (!note) return;

    try {
      await editNote(note.id, tagId, text);
      fetchNotes(tagId); // Refresh notes list
      onClose();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Edit note">
      {note && (
        <NoteForm
          tags={tags}
          onSubmit={handleSubmit}
          submitText="Submit changes"
          onTagDropdownOpen={() => getTags()}
          note={{ tagId: note.tag.id, text: note.note_text }}
        />
      )}
    </Modal>
  );
};

export default EditNoteModal;
