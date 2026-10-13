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
import { addTagNote, getLinkedNotes, getVersesInChapter } from "../api";
import { useBibleStore } from "../store";
import { useEffect, useMemo, useState } from "react";
import { Note } from "../types";
import { groupRefsByChapter } from "../utils/verseRefs";
import { toBookName } from "../utils/bibleUtils";
import { toPlainText } from "../utils/tiptapContent";
import NoteForm from "./NoteForm";

interface AddTagNoteModalProps {
  opened: boolean;
  onClose: () => void;
}

interface VerseText {
  book: string;
  chapter: number;
  verse: number;
  text: string;
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

  const [verseTexts, setVerseTexts] = useState<VerseText[]>([]);
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

  useEffect(() => {
    // Only fetch tags when modal opens (not on mount when closed)
    if (opened) {
      getTags();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]); // Only run when opened changes

  useEffect(() => {
    if (!opened || !activeTextFilesetId || refs.length === 0) return;

    let cancelled = false;

    const fetchVerseTexts = async () => {
      try {
        // Selections may span chapters/books — fetch each
        // book/chapter group independently.
        const groups = groupRefsByChapter(refs);
        const results = await Promise.all(
          groups.map(async (group) => {
            const result = await getVersesInChapter(
              group.bookId,
              group.chapter,
              activeTextFilesetId
            );
            const wanted = new Set(group.verses);
            return result.verses
              .filter((v) => wanted.has(v.verse))
              .map((v) => ({
                book: toBookName(group.bookId) ?? group.bookId,
                chapter: group.chapter,
                verse: v.verse,
                text: v.text,
              }));
          })
        );
        if (cancelled) return;
        setVerseTexts(results.flat());
      } catch {
        // Non-critical — verse preview is best-effort
      }
    };

    void fetchVerseTexts();

    return () => {
      cancelled = true;
    };
  }, [opened, refs, activeTextFilesetId]);

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

  const handleSubmit = async (tagId: string, text: string) => {
    try {
      await addTagNote(tagId, text, verseReferences);
      setLastSelectedTagId(tagId || null);
      setVerseSelection(null); // Clear selected verses
      setVerseTexts([]);
      onClose();
    } catch (error) {
      console.error(error);
    }
  };

  const textGroups = useMemo(() => {
    const groups = new Map<string, VerseText[]>();
    for (const v of verseTexts) {
      const key = `${v.book} ${v.chapter}`;
      const group = groups.get(key);
      if (group) {
        group.push(v);
      } else {
        groups.set(key, [v]);
      }
    }
    return [...groups.entries()];
  }, [verseTexts]);

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
                    aria-expanded={isExpanded}
                    onClick={() => toggleLinkedNote(note.id)}
                  >
                    {isExpanded ? (
                      <IconChevronDown size={16} />
                    ) : (
                      <IconChevronRight size={16} />
                    )}
                  </ActionIcon>
                  <Text size="sm" weight={700}>
                    {linkedNoteRef(note)}
                  </Text>
                </Group>
                <Collapse in={isExpanded}>
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
