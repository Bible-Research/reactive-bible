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

import { useBibleStore } from "../store";
import {
  deleteImage,
  uploadNoteImage,
} from "../api";
import { toBookName, toUsfmCode } from "../utils/bibleUtils";
import {
  refsInclude,
  sameRef,
  sortRefs,
  verseNumbersFor,
} from "../utils/verseRefs";
import { groupVerseTexts, useVerseTexts } from "../hooks/useVerseTexts";
import { useNoteEditor } from "../hooks/useNoteEditor";
import {
  mutateNoteImages,
  useNoteImages,
} from "../hooks/useNoteImages";
import { imageFileSignature } from "../hooks/useStagedImages";
import NoteForm from "./NoteForm";
import PassagePicker from "./PassagePicker";
import VerseTextGroups from "./VerseTextGroups";
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
    activeTextFilesetId,
    activeBookId,
    activeChapter,
    translations,
  } = useBibleStore((state) => ({
    tags: state.tags,
    getTags: state.getTags,
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

  // Attached images come from the shared per-note store —
  // the card usually warmed it before the modal opened, so
  // opening costs no extra request. Uploads append and
  // deletes filter via mutateNoteImages. The modal only
  // opens through the owner-gated edit affordance, so
  // attach/delete need no extra permission check here.
  const { images, refresh: refreshImages } = useNoteImages(
    note?.id,
    opened
  );
  // Content signatures of files uploaded this session,
  // mapped to the image each produced — a re-select mints
  // a new File object, so identity checks can't stop a
  // duplicate upload; deleting an image frees its
  // signature so the file can be attached again.
  const uploadedSigs = useRef<Map<string, string>>(new Map());

  // Seed the picker from the note whenever the modal opens.
  useEffect(() => {
    if (!opened) return;
    // Uses cache if available; a rejection already produced a
    // store notification — swallow it so it stays off the
    // global error reporter.
    void getTags().catch(() => {
      /* notified by the store */
    });
    setVersesOpen(false);
    if (!note) return;
    uploadedSigs.current = new Map();
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

  // The notes API expects book names (verses[].book). Read by
  // the editor hook at save time so autosave PATCHes carry the
  // picker's CURRENT refs — they used to be silently dropped
  // on X/backdrop close.
  const verseReferences = useMemo(
    () =>
      sortRefs(refs).map(({ bookId, chapter, verse }) => ({
        book: toBookName(bookId) ?? bookId,
        chapter,
        verse,
      })),
    [refs]
  );

  const editor = useNoteEditor({
    mode: "edit",
    note,
    verseReferences,
    onSubmitted: () => onClose(),
    // An image-only note is a valid save target even with
    // no text or linked verses.
    attachedImageCount: images.length,
  });

  // Edit mode uploads immediately on select — the note id is
  // already known, unlike create mode's staged files.
  const handleAttachFiles = (files: File[]) => {
    if (!note) return;
    const noteId = note.id;
    void (async () => {
      for (const file of files) {
        const signature = imageFileSignature(file);
        if (uploadedSigs.current.has(signature)) continue;
        // Claim the signature before the upload resolves —
        // a rapid second selection of the same file must
        // not slip past the dedup check above.
        uploadedSigs.current.set(signature, '');
        try {
          const img = await uploadNoteImage(noteId, file);
          uploadedSigs.current.set(signature, img.id);
          // The upload response is an ImageSerializer object
          // identical to the list elements — append it
          // locally instead of refetching.
          mutateNoteImages(noteId, (imgs) => [...imgs, img]);
        } catch (err: unknown) {
          uploadedSigs.current.delete(signature);
          const msg =
            err instanceof Error
              ? err.message
              : 'Failed to upload image.';
          showNotification({
            color: 'red',
            title: 'Upload failed',
            message: msg,
          });
        }
      }
    })();
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!note) return;
    try {
      await deleteImage(imageId);
      mutateNoteImages(note.id, (imgs) =>
        imgs.filter((i) => i.id !== imageId)
      );
      // Free the file's signature so re-selecting it
      // re-uploads instead of being deduped away.
      for (const [sig, id] of uploadedSigs.current) {
        if (id === imageId) uploadedSigs.current.delete(sig);
      }
    } catch {
      showNotification({
        color: 'red',
        title: 'Error',
        message: 'Failed to delete image.',
      });
    }
  };

  // An attached thumb whose signed URL expired refetches the
  // list through the shared store — bounded (3 per image set)
  // and single-flight, so N thumbs erroring in one commit
  // fire one refetch, not N.
  const handleImageError = () => {
    refreshImages();
  };

  const handleClose = () => {
    if (editor.hasSaved() && note) {
      // Even if autosave moved the note to another tag, the
      // list on screen is note.tag's — refetch it so the note
      // disappears. Untagged notes refetch the virtual
      // "untagged" view.
      void editor.refreshViewedNotes().catch(() => {
        /* fetchNotes already notified the failure */
      });
    }
    onClose();
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
            onSubmit={editor.submit}
            // Linked verses keep the note valid with no
            // text; the prop tracks the picker's live refs.
            allowEmptyText={refs.length > 0}
            submitText="Submit changes"
            onTagDropdownOpen={() => {
              void getTags().catch(() => {
                /* notified by the store */
              });
            }}
            onAutoSave={editor.save}
            existingImages={images}
            onDeleteImage={handleDeleteImage}
            onImageError={handleImageError}
            onAttachFiles={handleAttachFiles}
            onUnmountedSave={() => {
              // A tail save finishing after unmount sets
              // hasSaved too late for handleClose's check —
              // refetch the route's tag here or the list shows
              // the pre-edit text until the next load.
              void editor.refreshViewedNotes().catch(() => {
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
                <VerseTextGroups groups={textGroups} />
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
