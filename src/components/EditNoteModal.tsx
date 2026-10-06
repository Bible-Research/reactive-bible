import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Collapse,
  Divider,
  Group,
  Modal,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { editNote } from "../api";
import { useBibleStore } from "../store";
import { toBookName, toUsfmCode } from "../utils/bibleUtils";
import { clearNotesCache } from "../utils/cacheManager";
import {
  refsInclude,
  sameRef,
  sortRefs,
  verseNumbersFor,
} from "../utils/verseRefs";
import { groupVerseTexts, useVerseTexts } from "../hooks/useVerseTexts";
import NoteForm from "./NoteForm";
import PassagePicker from "./PassagePicker";
import { Note, VerseRef } from "../types";

interface EditNoteModalProps {
  opened: boolean;
  onClose: () => void;
  note: Note | null;
}

const EditNoteModal = ({ opened, onClose, note }: EditNoteModalProps) => {
  const {
    tags,
    getTags,
    fetchNotes,
    activeTextFilesetId,
    activeBookId,
    activeChapter,
  } = useBibleStore((state) => ({
    tags: state.tags,
    getTags: state.getTags,
    fetchNotes: state.fetchNotes,
    activeTextFilesetId: state.activeTextFilesetId,
    activeBookId: state.activeBookId,
    activeChapter: state.activeChapter,
  }));

  // The note's verse links, editable via the picker below.
  const [refs, setRefs] = useState<VerseRef[]>([]);
  // The verse reference section stays collapsed until expanded.
  const [versesOpen, setVersesOpen] = useState(false);
  const [pickerBookId, setPickerBookId] = useState<string | null>(null);
  const [pickerChapter, setPickerChapter] = useState<number | null>(
    null
  );
  // Last plain-clicked verse; a shift-click extends a range from it.
  const anchorRef = useRef<VerseRef | null>(null);

  // Seed the picker from the note whenever the modal opens.
  useEffect(() => {
    if (!opened) return;
    getTags(); // Uses cache if available
    setVersesOpen(false);
    if (!note) return;
    const initial = (note.verses ?? [])
      .map((v) => ({
        bookId: toUsfmCode(v.book) ?? "",
        chapter: v.chapter,
        verse: v.verse,
      }))
      .filter((r) => r.bookId !== "");
    setRefs(initial);
    anchorRef.current = null;
    setPickerBookId(initial[0]?.bookId ?? activeBookId);
    setPickerChapter(initial[0]?.chapter ?? activeChapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, note]); // Only run when the modal opens / note changes

  const pickerVerses =
    pickerBookId && pickerChapter !== null
      ? verseNumbersFor(refs, pickerBookId, pickerChapter)
      : [];

  const verseTexts = useVerseTexts(refs, activeTextFilesetId, opened);
  const textGroups = useMemo(
    () => groupVerseTexts(verseTexts),
    [verseTexts]
  );

  const handleSelectVerse = (verse: number, extendRange: boolean) => {
    if (!pickerBookId || pickerChapter === null) return;
    const ref: VerseRef = {
      bookId: pickerBookId,
      chapter: pickerChapter,
      verse,
    };
    const anchor = anchorRef.current;
    if (
      extendRange &&
      anchor &&
      anchor.bookId === ref.bookId &&
      anchor.chapter === ref.chapter
    ) {
      // Range selection is constrained to a single book/chapter.
      const start = Math.min(anchor.verse, ref.verse);
      const end = Math.max(anchor.verse, ref.verse);
      setRefs((current) => {
        const merged = [...current];
        for (let v = start; v <= end; v++) {
          const rangeRef = { ...ref, verse: v };
          if (!refsInclude(merged, rangeRef)) merged.push(rangeRef);
        }
        return merged;
      });
      return;
    }
    anchorRef.current = ref;
    setRefs((current) =>
      refsInclude(current, ref)
        ? current.filter((r) => !sameRef(r, ref))
        : [...current, ref]
    );
  };

  const handleSubmit = async (tagId: string, text: string) => {
    if (!note) return;

    // The notes API expects book names (verses[].book).
    const verseReferences = sortRefs(refs).map(
      ({ bookId, chapter, verse }) => ({
        book: toBookName(bookId) ?? bookId,
        chapter,
        verse,
      })
    );

    try {
      await editNote(note.id, tagId, text, verseReferences);
      clearNotesCache(); // Cached pages hold stale verse links
      fetchNotes(tagId); // Refresh notes list
      onClose();
    } catch (error) {
      console.error(error);
    }
  };

  // The notes API sets error/error_code when the upstream
  // Bible provider fails to resolve verse text.
  const verseError = note?.error;

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
          <Divider mt="xl" mb="sm" />
          <UnstyledButton
            w="100%"
            title="toggle-verse-references"
            aria-expanded={versesOpen}
            onClick={() => setVersesOpen((open) => !open)}
          >
            <Group spacing="xs">
              {versesOpen ? (
                <IconChevronDown size={16} />
              ) : (
                <IconChevronRight size={16} />
              )}
              <Text size="sm" weight={600}>
                Verse references
              </Text>
              {refs.length > 0 && (
                <Badge size="sm" variant="light" color="blue">
                  {refs.length}
                </Badge>
              )}
            </Group>
          </UnstyledButton>
          <Collapse in={versesOpen}>
            <Box h={280} mt="sm">
              <PassagePicker
                bookId={pickerBookId}
                chapter={pickerChapter}
                verses={pickerVerses}
                titlePrefix="edit-note-"
                onSelectBook={(bookId) => {
                  setPickerBookId(bookId);
                  setPickerChapter(null);
                }}
                onSelectChapter={setPickerChapter}
                onSelectVerse={handleSelectVerse}
              />
            </Box>
            {verseError ? (
              <Text color="red" size="sm" mt="sm">
                {verseError}
                {note.error_code === "rate_limited"
                  ? " Try reloading in a few moments."
                  : ""}
              </Text>
            ) : (
              textGroups.map(([label, groupVerses]) => (
                <Box key={label} mt="xl">
                  <Divider
                    my="sm"
                    label={label}
                    labelPosition="center"
                  />
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
              ))
            )}
          </Collapse>
        </>
      )}
    </Modal>
  );
};

export default EditNoteModal;
