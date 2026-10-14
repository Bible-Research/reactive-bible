import { Box, Divider, Modal, Text } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { addTagNote, editNote, getLinkedNotes } from "../api";
import { useBibleStore } from "../store";
import { useEffect, useMemo, useState } from "react";
import { Note } from "../types";
import { toBookName } from "../utils/bibleUtils";
import { resolveTextFileset } from "../utils/filesetGroups";
import { toPlainText } from "../utils/tiptapContent";
import {
  groupVerseTexts,
  useVerseTexts,
} from "../hooks/useVerseTexts";
import NoteForm from "./NoteForm";
import {
  emptyNoteDraft,
  type NoteDraftRef,
} from "./noteDraft";

interface AddTagNoteModalProps {
  opened: boolean;
  onClose: () => void;
  /**
   * Autosave draft owned by the parent — this modal unmounts on
   * close, and a local ref would lose the autosaved note id,
   * turning a reopen into a duplicate POST.
   */
  draftRef: NoteDraftRef;
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

const AddTagNoteModal = ({
  opened,
  onClose,
  draftRef,
}: AddTagNoteModalProps) => {
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

  useEffect(() => {
    // Only fetch tags when modal opens (not on mount when closed)
    if (opened) {
      void getTags().catch(() => { /* notified by the store */ });
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

  // Serialized through the draft's queue: a reopened form's
  // in-flight lock starts empty, so without this a save could
  // run beside a still-pending POST from the previous mount and
  // create a duplicate.
  const handleAutoSave = (tagId: string, text: string) => {
    const draft = draftRef.current;
    const run = draft.queue.then(async () => {
      if (draft.savedNoteId) {
        await editNote(draft.savedNoteId, tagId, text);
      } else {
        const created = await addTagNote(
          tagId,
          text,
          verseReferences
        );
        draft.savedNoteId = created?.id ?? null;
      }
      // Record what the server holds so a reopened modal can
      // restore the draft.
      draft.tagId = tagId;
      draft.text = text;
    });
    draft.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  const handleSubmit = async (tagId: string, text: string) => {
    try {
      // Shares the draft with autosave: an existing draft is
      // PATCHed, and a note created by submit is recorded so a
      // late autosave tick PATCHes instead of POSTing a
      // duplicate.
      await handleAutoSave(tagId, text);
      // The draft was submitted — reset so the next open starts
      // a new note instead of resuming this one.
      draftRef.current = emptyNoteDraft();
      setLastSelectedTagId(tagId || null);
      setVerseSelection(null); // Clear selected verses
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
        onTagDropdownOpen={() => {
          void getTags().catch(() => {
            /* notified by the store */
          });
        }}
        onAutoSave={handleAutoSave}
        onDraftChange={(tagId, text) => {
          // Track live form contents so a reopen restores the
          // in-progress draft, not just the last saved text.
          draftRef.current.tagId = tagId;
          draftRef.current.text = text;
        }}
        note={
          draftRef.current.savedNoteId
            ? {
                tagId: draftRef.current.tagId,
                text: draftRef.current.text,
              }
            : lastSelectedTagId
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
