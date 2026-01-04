import { Modal } from "@mantine/core";
import { addTagNote, getTags } from "../api";
import { useBibleStore } from "../store";
import { useState, useEffect } from "react";
import NoteForm from "./NoteForm";
import { Tag } from "../types";

interface AddTagNoteModalProps {
  opened: boolean;
  onClose: () => void;
}

const AddTagNoteModal = ({ opened, onClose }: AddTagNoteModalProps) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const activeVerses = useBibleStore((state) => state.activeVerses);
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const setActiveVerses = useBibleStore((state) => state.setActiveVerses);

    const fetchTags = async () => {
    try {
      const fetchedTags = await getTags();
      setTags(fetchedTags);
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
    const verseReferences = activeVerses.map((verse) => ({
      book: activeBook,
      chapter: activeChapter,
      verse,
    }));

    try {
      await addTagNote(tagId, text, verseReferences);
      setActiveVerses([]); // Clear selected verses
      onClose();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Add note">
      <NoteForm
        tags={tags}
        onSubmit={handleSubmit}
        submitText="Submit"
        onTagDropdownOpen={fetchTags}
      />
    </Modal>
  );
};

export default AddTagNoteModal;
