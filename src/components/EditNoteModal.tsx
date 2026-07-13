import { useEffect } from "react";
import { Box, Divider, Modal, Text } from "@mantine/core";
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

  const firstVerse = note?.verses?.[0];
  const lastVerse =
    note?.verses?.[(note.verses?.length ?? 0) - 1];
  const verseLabel = firstVerse
    ? firstVerse.verse === lastVerse?.verse
      ? `${firstVerse.book} ${firstVerse.chapter}:${firstVerse.verse}`
      : (
        `${firstVerse.book} ${firstVerse.chapter}:` +
        `${firstVerse.verse}–${lastVerse?.verse}`
      )
    : undefined;

  return (
    <Modal opened={opened} onClose={onClose} title="Edit note" fullScreen>
      {note && (
        <>
          <NoteForm
            tags={tags}
            onSubmit={handleSubmit}
            submitText="Submit changes"
            onTagDropdownOpen={() => getTags()}
            note={{ tagId: note.tag.id, text: note.note_text }}
          />
          {note.verses?.length > 0 && (
            <Box mt="xl">
              <Divider
                my="sm"
                label={verseLabel}
                labelPosition="center"
              />
              {note.verses.map((v) => (
                <Box key={v.verse} py={4} px={8}>
                  <Text size="sm">
                    <Text component="span" weight={700} mr={4}>
                      {v.verse}
                    </Text>
                    {v.text}
                  </Text>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}
    </Modal>
  );
};

export default EditNoteModal;
