import { Modal } from "@mantine/core";
import { addTagNote } from "../api";
import { useBibleStore } from "../store";
import { useEffect } from "react";
import NoteForm from "./NoteForm";

interface AddTagNoteModalProps {
  opened: boolean;
  onClose: () => void;
}

const AddTagNoteModal = ({ opened, onClose }: AddTagNoteModalProps) => {
  const { tags, getTags, activeVerses, activeBook, activeChapter, setActiveVerses } = useBibleStore((state) => ({
    tags: state.tags,
    getTags: state.getTags,
    activeVerses: state.activeVerses,
    activeBook: state.activeBook,
    activeChapter: state.activeChapter,
    setActiveVerses: state.setActiveVerses,
  }));

  useEffect(() => {
    if (opened) {
      // Ensure tags are loaded (uses cache if available)
      getTags();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]); // Only run when modal opens

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
        onTagDropdownOpen={() => getTags()}
      />
    </Modal>
  );
};

export default AddTagNoteModal;
