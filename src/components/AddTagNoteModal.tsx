import { Box, Divider, Modal, Text } from "@mantine/core";
import { addTagNote, editNote, getLinkedNotes } from "../api";
import { useBibleStore } from "../store";
import { useEffect, useMemo, useRef, useState } from "react";
import { Note } from "../types";
import { toBookName } from "../utils/bibleUtils";
import { toPlainText } from "../utils/tiptapContent";
import {
  groupVerseTexts,
  useVerseTexts,
} from "../hooks/useVerseTexts";
import NoteForm from "./NoteForm";

interface AddTagNoteModalProps {
  opened: boolean;
  onClose: () => void;
}

const linkedNoteHeading = (note: Note): string => {
  const verses = note.verses ?? [];
  const first = verses[0];
  if (!first) return note.tag?.name ?? "";
  const last = verses[verses.length - 1];
  const range =
    first.verse === last.verse
      ? `${first.verse}`
      : `${first.verse}-${last.verse}`;
  const ref = `${first.book} ${first.chapter}:${range}`;
  return note.tag?.name ? `${ref} · ${note.tag.name}` : ref;
};

const AddTagNoteModal = ({ opened, onClose }: AddTagNoteModalProps) => {
  const {
    tags,
    getTags,
    verseSelection,
    setVerseSelection,
    activeTextFilesetId,
    translations,
    lastSelectedTagId,
    setLastSelectedTagId,
  } = useBibleStore((state) => ({
    tags: state.tags,
    getTags: state.getTags,
    verseSelection: state.verseSelection,
    setVerseSelection: state.setVerseSelection,
    activeTextFilesetId: state.activeTextFilesetId,
    translations: state.translations,
    lastSelectedTagId: state.lastSelectedTagId,
    setLastSelectedTagId: state.setLastSelectedTagId,
  }));

  const refs = useMemo(
    () => verseSelection?.refs ?? [],
    [verseSelection]
  );

  // Selections may span chapters/books — the hook fetches each
  // book/chapter group independently.
  const verseTexts = useVerseTexts(
    refs,
    activeTextFilesetId,
    translations,
    opened
  );
  // null = not loaded yet or no selection; count is shown only
  // once the linked-notes query has resolved.
  const [linkedNotes, setLinkedNotes] =
    useState<Note[] | null>(null);

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

  useEffect(() => {
    if (!opened || verseReferences.length === 0) {
      setLinkedNotes(null);
      return;
    }
    let cancelled = false;
    const fetchLinkedNotes = async () => {
      try {
        const result = await getLinkedNotes(
          verseReferences,
          activeTextFilesetId ?? undefined
        );
        if (!cancelled) {
          setLinkedNotes(result.results);
        }
      } catch {
        // Non-critical — linked notes are best-effort
      }
    };
    void fetchLinkedNotes();
    return () => {
      cancelled = true;
    };
  }, [opened, verseReferences, activeTextFilesetId]);

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
      {linkedNotes && (
        <Text size="sm" color="dimmed" mb="sm">
          {linkedNotes.length}{" "}
          {linkedNotes.length === 1
            ? "linked note"
            : "linked notes"}
        </Text>
      )}
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
      {linkedNotes && linkedNotes.length > 0 && (
        <Box mt="xl">
          <Divider
            my="sm"
            label="Linked notes"
            labelPosition="center"
          />
          {linkedNotes.map((note) => (
            <Box
              key={note.id}
              py={4}
              px={8}
              title={`linked-note-${note.id}`}
            >
              <Text size="sm">
                <Text component="span" weight={700} mr={4}>
                  {linkedNoteHeading(note)}
                </Text>
                {toPlainText(note.note_text)}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Modal>
  );
};

export default AddTagNoteModal;
