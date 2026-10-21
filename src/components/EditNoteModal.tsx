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
import { showNotification } from "@mantine/notifications";
import { editNote, UNTAGGED_TAG_ID } from "../api";
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
import { visibleNoteVerses } from "../utils/noteVerses";
import { shallow } from "zustand/shallow";

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
    translations,
  } = useBibleStore((state) => ({
    tags: state.tags,
    getTags: state.getTags,
    fetchNotes: state.fetchNotes,
    activeTextFilesetId: state.activeTextFilesetId,
    activeBookId: state.activeBookId,
    activeChapter: state.activeChapter,
    translations: state.translations,
  }), shallow);

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
    // Uses cache if available; a rejection already produced a
    // store notification — swallow it so it stays off the
    // global error reporter.
    void getTags().catch(() => { /* notified by the store */ });
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

  const verseTexts = useVerseTexts(
    refs,
    activeTextFilesetId,
    translations,
    opened
  );
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

  // Set when autosave wrote to the server — the cached notes
  // list is then stale and must be refreshed on close.
  const autosavedRef = useRef(false);

  // The notes API expects book names (verses[].book).
  const verseReferences = () =>
    sortRefs(refs).map(({ bookId, chapter, verse }) => ({
      book: toBookName(bookId) ?? bookId,
      chapter,
      verse,
    }));

  const handleAutoSave = async (tagId: string, text: string) => {
    if (!note) return;
    // Include the picker's refs — closing via X/backdrop used
    // to silently discard verse-link changes.
    await editNote(note.id, tagId, text, verseReferences());
    autosavedRef.current = true;
    clearNotesCache();
  };

  // Refetch the tag page the route is actually showing. The
  // note's own tag may have changed mid-edit (and the `note`
  // prop is stale by then), and dropping the current page +
  // ordering would bounce the user back to page 1.
  const refreshViewedNotes = () => {
    const {
      lastSelectedTagId,
      notesOrdering,
      notesPage,
    } = useBibleStore.getState();
    return fetchNotes(
      lastSelectedTagId ?? note?.tag?.id ?? UNTAGGED_TAG_ID,
      {
        ordering: notesOrdering ?? undefined,
        page: notesPage,
      }
    );
  };

  const handleClose = () => {
    if (autosavedRef.current) {
      // fetchNotes rethrows after its own error toast —
      // swallow here so the fire-and-forget can't reject
      // unhandled. refreshViewedNotes falls back to
      // UNTAGGED_TAG_ID for untagged notes.
      void refreshViewedNotes().catch(() => undefined);
    }
    autosavedRef.current = false;
    onClose();
  };

  const handleSubmit = async (tagId: string, text: string) => {
    if (!note) return;

    try {
      await editNote(note.id, tagId, text, verseReferences());
      clearNotesCache(); // Cached pages hold stale verse links
      // Fire-and-forget like before — a failed refetch must not
      // keep the modal open after the note was saved. fetchNotes
      // rethrows after notifying, so swallow the rejection.
      void refreshViewedNotes().catch(() => undefined);
      onClose();
    } catch (error) {
      console.error(error);
      showNotification({
        title: 'Error',
        message: 'Failed to save note. Please try again.',
        color: 'red',
      });
    }
  };

  // The notes API sets error/error_code when the upstream
  // Bible provider fails to resolve verse text.
  const verseError = note?.error;
  // Provider text is capped at 500 verses for copyright
  // reasons; render the truncated tail as a notice instead
  // of empty verse rows.
  const { truncated: versesTruncated } = visibleNoteVerses(
    note?.verses
  );

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Edit note"
      fullScreen
    >
      {note && (
        <>
          <NoteForm
            tags={tags}
            onSubmit={handleSubmit}
            submitText="Submit changes"
            onTagDropdownOpen={() => {
              void getTags().catch(() => {
                /* notified by the store */
              });
            }}
            onAutoSave={handleAutoSave}
            onUnmountedSave={() => {
              // A tail save finishing after unmount sets
              // autosavedRef too late for handleClose's check —
              // refetch the viewed tag here or the list shows
              // the pre-edit text until the next load.
              void refreshViewedNotes().catch(() => {
                /* fetchNotes already notified the failure */
              });
            }}
            note={{
              tagId: note.tag?.id ?? "",
              text: note.note_text,
            }}
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
              <>
                {textGroups.map(([label, groupVerses]) => (
                  <Box key={label} mt="xl">
                    <Divider
                      my="sm"
                      label={label}
                      labelPosition="center"
                    />
                    {groupVerses.map((v) => (
                      <Box key={v.verse} py={4} px={8}>
                        <Text size="sm">
                          <Text
                            component="span"
                            weight={700}
                            mr={4}
                          >
                            {v.verse}
                          </Text>
                          {v.text}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                ))}
                {versesTruncated && (
                  <Text color="red" size="sm" mt="sm">
                    Cannot display more than 500 verses of the
                    Bible due to copyright restrictions.
                  </Text>
                )}
              </>
            )}
          </Collapse>
        </>
      )}
    </Modal>
  );
};

export default EditNoteModal;
