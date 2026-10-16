import {
  ActionIcon,
  Badge,
  Box,
  Collapse,
  Divider,
  Group,
  Modal,
  Text,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-react";
import { addTagNote, editNote, getLinkedNotes } from "../api";
import { useBibleStore } from "../store";
import { useEffect, useMemo, useRef, useState } from "react";
import { Note } from "../types";
import { toBookName } from "../utils/bibleUtils";
import { clearNotesCache } from "../utils/cacheManager";
import { resolveTextFileset } from "../utils/filesetGroups";
import { toPlainText } from "../utils/tiptapContent";
import {
  groupVerseTexts,
  useVerseTexts,
} from "../hooks/useVerseTexts";
import NoteForm from "./NoteForm";
import { shallow } from "zustand/shallow";

interface AddTagNoteModalProps {
  opened: boolean;
  onClose: () => void;
}

const linkedNoteRef = (note: Note): string => {
  const verses = note.verses ?? [];
  const first = verses[0];
  if (!first) return note.tag?.name ?? "";
  const last = verses[verses.length - 1];
  const range =
    first.verse === last.verse
      ? `${first.verse}`
      : `${first.verse}-${last.verse}`;
  return `${first.book} ${first.chapter}:${range}`;
};

const AddTagNoteModal = ({ opened, onClose }: AddTagNoteModalProps) => {
  const {
    tags,
    getTags,
    verseSelection,
    setVerseSelection,
    activeTextFilesetId,
    activeBookId,
    translations,
    lastSelectedTagId,
    setLastSelectedTagId,
  } = useBibleStore((state) => ({
    tags: state.tags,
    getTags: state.getTags,
    verseSelection: state.verseSelection,
    setVerseSelection: state.setVerseSelection,
    activeTextFilesetId: state.activeTextFilesetId,
    activeBookId: state.activeBookId,
    translations: state.translations,
    lastSelectedTagId: state.lastSelectedTagId,
    setLastSelectedTagId: state.setLastSelectedTagId,
  }), shallow);

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
  // Ids of linked notes whose details are expanded.
  const [expandedNotes, setExpandedNotes] =
    useState<Set<string>>(new Set());

  const toggleLinkedNote = (noteId: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

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
        // The stored id may be a grouped product id — resolve to
        // the concrete member for the selected book's testament,
        // like every other `fileset_id` call site.
        const filesetId = resolveTextFileset(
          activeTextFilesetId,
          refs[0]?.bookId ?? activeBookId,
          translations
        );
        const result = await getLinkedNotes(
          verseReferences,
          filesetId ?? undefined
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
  }, [
    opened,
    verseReferences,
    activeTextFilesetId,
    activeBookId,
    translations,
    refs,
  ]);

  const handleAutoSave = async (tagId: string, text: string) => {
    if (savedNoteIdRef.current) {
      await editNote(savedNoteIdRef.current, tagId, text);
    } else {
      const created = await addTagNote(tagId, text, verseReferences);
      savedNoteIdRef.current = created?.id ?? null;
    }
    // The cached notes pages are stale once a note is created
    // or edited — a later fetchNotes must hit the API.
    clearNotesCache();
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
          {linkedNotes.map((note) => {
            const isExpanded = expandedNotes.has(note.id);
            const ref = linkedNoteRef(note);
            return (
              <Box
                key={note.id}
                py={4}
                px={8}
                title={`linked-note-${note.id}`}
              >
                <Group spacing="xs" noWrap>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    title={`linked-note-toggle-${note.id}`}
                    aria-label={
                      ref
                        ? `Toggle note details for ${ref}`
                        : "Toggle note details"
                    }
                    aria-expanded={isExpanded}
                    aria-controls={`linked-note-details-${note.id}`}
                    onClick={() => toggleLinkedNote(note.id)}
                  >
                    {isExpanded ? (
                      <IconChevronDown size={16} />
                    ) : (
                      <IconChevronRight size={16} />
                    )}
                  </ActionIcon>
                  <Text size="sm" weight={700}>
                    {ref}
                  </Text>
                </Group>
                <Collapse
                  in={isExpanded}
                  id={`linked-note-details-${note.id}`}
                >
                  {note.tag?.name && (
                    <Badge
                      size="sm"
                      variant="light"
                      color="blue"
                      mt={4}
                    >
                      {note.tag.name}
                    </Badge>
                  )}
                  <Text size="sm" mt={4}>
                    {toPlainText(note.note_text)}
                  </Text>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      )}
    </Modal>
  );
};

export default AddTagNoteModal;
