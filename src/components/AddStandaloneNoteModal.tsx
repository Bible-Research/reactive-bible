import { Modal } from "@mantine/core";
import { addTagNote } from "../api";
import { useBibleStore } from "../store";
import { useEffect } from "react";
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

  useEffect(() => {
    if (opened) {
      getTags();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const handleSubmit = async (tagId: string, text: string) => {
    try {
      await addTagNote(tagId, text, []);
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
