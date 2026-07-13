import { Box, Divider, Modal, Text } from "@mantine/core";
import { addTagNote, getVersesInChapter } from "../api";
import { useBibleStore } from "../store";
import { useEffect, useState } from "react";
import NoteForm from "./NoteForm";

interface AddTagNoteModalProps {
  opened: boolean;
  onClose: () => void;
}

const AddTagNoteModal = ({ opened, onClose }: AddTagNoteModalProps) => {
  const {
    tags,
    getTags,
    activeVerses,
    activeBook,
    activeChapter,
    setActiveVerses,
    activeTextFilesetId,
    lastSelectedTagId,
    setLastSelectedTagId,
  } = useBibleStore((state) => ({
    tags: state.tags,
    getTags: state.getTags,
    activeVerses: state.activeVerses,
    activeBook: state.activeBook,
    activeChapter: state.activeChapter,
    setActiveVerses: state.setActiveVerses,
    activeTextFilesetId: state.activeTextFilesetId,
    lastSelectedTagId: state.lastSelectedTagId,
    setLastSelectedTagId: state.setLastSelectedTagId,
  }));

  const [verseTexts, setVerseTexts] = useState<
    { verse: number; text: string }[]
  >([]);

  useEffect(() => {
    // Only fetch tags when modal opens (not on mount when closed)
    if (opened) {
      getTags();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]); // Only run when opened changes

  useEffect(() => {
    if (!opened || !activeTextFilesetId) return;

    let cancelled = false;

    const fetchVerseTexts = async () => {
      try {
        const result = await getVersesInChapter(
          activeBook,
          activeChapter,
          activeTextFilesetId
        );
        if (cancelled) return;
        const filtered = result.verses.filter((v) =>
          activeVerses.includes(v.verse)
        );
        setVerseTexts(filtered);
      } catch {
        // Non-critical — verse preview is best-effort
      }
    };

    void fetchVerseTexts();

    return () => {
      cancelled = true;
    };
  }, [opened, activeBook, activeChapter, activeVerses, activeTextFilesetId]);

  const handleSubmit = async (tagId: string, text: string) => {
    const verseReferences = activeVerses.map((verse) => ({
      book: activeBook,
      chapter: activeChapter,
      verse,
    }));

    try {
      await addTagNote(tagId, text, verseReferences);
      setLastSelectedTagId(tagId || null);
      setActiveVerses([]); // Clear selected verses
      setVerseTexts([]);
      onClose();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Add note" fullScreen>
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
      {verseTexts.length > 0 && (
        <Box mt="xl">
          <Divider
            my="sm"
            label={`${activeBook} ${activeChapter}`}
            labelPosition="center"
          />
          {verseTexts.map((v) => (
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
    </Modal>
  );
};

export default AddTagNoteModal;
