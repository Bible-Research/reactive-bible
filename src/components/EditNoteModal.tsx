import { Modal } from "@mantine/core";
import { editNote, getTags } from "../api";
import { useBibleStore } from "../store";
import { useState, useEffect } from "react";
import NoteForm from "./NoteForm";
import { Note, Tag } from "../types";

interface EditNoteModalProps {
  opened: boolean;
  onClose: () => void;
  note: Note | null;
}

const EditNoteModal = ({ opened, onClose, note }: EditNoteModalProps) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const fetchNotes = useBibleStore((state) => state.fetchNotes);

  const fetchTags = async () => {
    try {
      const data = await getTags();
      setTags(data);
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  useEffect(() => {
    if (opened) {
      fetchTags();
    }
  }, [opened]);

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
    <Modal 
      opened={opened} 
      onClose={onClose} 
      title="Edit note"
      size="80%"
      styles={{
        body: { height: '70vh' },
        content: { height: '80vh' }
      }}
    >
      {note && (
        <NoteForm
          tags={tags}
          onSubmit={handleSubmit}
          submitText="Submit changes"
          onTagDropdownOpen={fetchTags}
          note={{ tagId: note.tag.id, text: note.note_text }}
        />
      )}
    </Modal>
  );
};

export default EditNoteModal;
