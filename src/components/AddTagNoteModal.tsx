import { Box, Divider, Modal, Text } from "@mantine/core";
import { addTagNote, editNote } from "../api";
import { useBibleStore } from "../store";
import { useEffect, useMemo, useRef } from "react";
import { toBookName } from "../utils/bibleUtils";
import { groupVerseTexts, useVerseTexts } from "../hooks/useVerseTexts";
import NoteForm from "./NoteForm";

interface AddTagNoteModalProps {
  opened: boolean;
  onClose: () => void;
}

const AddTagNoteModal = ({ opened, onClose }: AddTagNoteModalProps) => {
  const {
    tags,
    getTags,
    verseSelection,
    setVerseSelection,
    activeTextFilesetId,
    lastSelectedTagId,
    setLastSelectedTagId,
  } = useBibleStore((state) => ({
    tags: state.tags,
    getTags: state.getTags,
    verseSelection: state.verseSelection,
    setVerseSelection: state.setVerseSelection,
    activeTextFilesetId: state.activeTextFilesetId,
    lastSelectedTagId: state.lastSelectedTagId,
    setLastSelectedTagId: state.setLastSelectedTagId,
  }));

  const refs = useMemo(
    () => verseSelection?.refs ?? [],
    [verseSelection]
  );

  // Selections may span chapters/books — the hook fetches each
  // book/chapter group independently.
  const verseTexts = useVerseTexts(refs, activeTextFilesetId, opened);

  // Once autosave creates the note, later saves (and Submit)
  // must PATCH that note instead of POSTing duplicates.
  const savedNoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Only fetch tags when modal opens (not on mount when closed)
    if (opened) {
      getTags();
      savedNoteIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]); // Only run when opened changes

  // The notes API expects book names (verses[].book).
  const verseReferences = useMemo(
    () =>
      refs.map(({ bookId, chapter, verse }) => ({
        book: toBookName(bookId) ?? bookId,
        chapter,
        verse,
      })),
    [refs]
  );

  const handleAutoSave = async (tagId: string, text: string) => {
    if (savedNoteIdRef.current) {
      await editNote(savedNoteIdRef.current, tagId, text);
      return;
    }
    const created = await addTagNote(tagId, text, verseReferences);
    savedNoteIdRef.current = created?.id ?? null;
  };

  const handleSubmit = async (tagId: string, text: string) => {
    try {
      // Shares savedNoteIdRef with autosave: an existing draft is
      // PATCHed, and a note created by submit is recorded so a
      // late autosave tick PATCHes instead of POSTing a duplicate.
      await handleAutoSave(tagId, text);
      setLastSelectedTagId(tagId || null);
      setVerseSelection(null); // Clear selected verses
      onClose();
    } catch (error) {
      console.error(error);
    }
  };

  const textGroups = useMemo(
    () => groupVerseTexts(verseTexts),
    [verseTexts]
  );

  return (
    <Modal opened={opened} onClose={onClose} title="Add note" fullScreen>
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
      {textGroups.map(([label, groupVerses]) => (
        <Box key={label} mt="xl">
          <Divider my="sm" label={label} labelPosition="center" />
          {groupVerses.map((v) => (
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
      ))}
    </Modal>
  );
};

export default AddTagNoteModal;
