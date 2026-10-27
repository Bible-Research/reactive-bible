import {
  Affix,
  Box,
  Button,
  Checkbox,
  Group,
  Select,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { showNotification } from "@mantine/notifications";
import { useEffect, useRef, useState } from "react";
import { Tag } from "../types";
import { toPlainText } from "../utils/tiptapContent";
import RichTextEditor from "./RichTextEditor";

interface NoteFormProps {
  tags: Tag[];
  note?: { tagId: string; text: string; isPublic?: boolean };
  /**
   * May resolve `false` to signal a rejected submit (failed
   * validation or save) — the content then stays eligible for
   * the unmount flush. Any other resolved value counts as
   * persisted. `isPublic` is the form's "Public note" checkbox.
   */
  onSubmit: (
    tagId: string,
    text: string,
    isPublic: boolean
  ) => void | Promise<unknown>;
  /**
   * Permits saves and submits with no note text — the caller
   * sets it when the note still links verse references, so
   * the form holds content even with an empty editor. Without
   * it an empty note is rejected as before.
   */
  allowEmptyText?: boolean;
  submitText: string;
  onTagDropdownOpen: () => void;
  onAutoSave?: (
    tagId: string,
    text: string,
    isPublic: boolean
  ) => Promise<unknown>;
  /**
   * Called after a save triggered by the unmount flush
   * resolves — the parent's own close handler already ran, so
   * this is its only chance to react (e.g. refetch stale UI).
   */
  onUnmountedSave?: () => void;
  /**
   * Reports every draft change so an outer draft store can
   * restore the autosaved note after the form remounts (the
   * modal unmounts it on close).
   */
  onDraftChange?: (
    tagId: string,
    text: string,
    isPublic: boolean
  ) => void;
}

const AUTOSAVE_INTERVAL_MS = 5000;
const SAVED_FLASH_MS = 500;

// Marks `save` as the in-flight write until it settles. The
// tracked promise never rejects, so awaiting the lock stays safe
// even when the underlying save fails.
const trackInFlight = (
  ref: React.MutableRefObject<Promise<void> | null>,
  save: Promise<unknown>
) => {
  const tracked = save.then(
    () => undefined,
    () => undefined
  );
  ref.current = tracked;
  void tracked.finally(() => {
    if (ref.current === tracked) {
      ref.current = null;
    }
  });
  return save;
};

const NoteForm = ({
  tags,
  note,
  onSubmit,
  allowEmptyText = false,
  submitText,
  onTagDropdownOpen,
  onAutoSave,
  onUnmountedSave,
  onDraftChange,
}: NoteFormProps) => {
  const [selectedTagId, setSelectedTagId] = useState(note?.tagId || "");
  const [noteText, setNoteText] = useState(note?.text || "");
  // "Public note" — seeded from `note.isPublic` (edit mode or a
  // resumed draft); otherwise follows the selected tag's
  // `public` flag until the user toggles it manually.
  const [isPublic, setIsPublic] = useState<boolean>(
    () =>
      note?.isPublic ??
      tags.find((t) => t.id === (note?.tagId ?? ""))?.public ??
      false
  );
  // Once the user toggles the box their choice wins over the
  // tag default. An explicit `note.isPublic` counts as already
  // touched — a tag switch in edit mode must NOT silently flip
  // an existing note's publicity. Reset when the draft re-seeds.
  const publicTouchedRef = useRef(note?.isPublic !== undefined);
  const [autoSave, setAutoSave] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const latest = useRef({ tagId: "", text: "", isPublic: false });
  const onAutoSaveRef = useRef(onAutoSave);
  const onUnmountedSaveRef = useRef(onUnmountedSave);
  const onDraftChangeRef = useRef(onDraftChange);
  const autoSaveRef = useRef(autoSave);
  const allowEmptyTextRef = useRef(allowEmptyText);
  // Shared save lock for autosave ticks and submit: overlapping
  // writes could POST two notes for one draft (or let stale text
  // win over a submit), so both paths must respect it.
  const inFlightRef = useRef<Promise<void> | null>(null);
  const flashTimeout = useRef<number | undefined>(undefined);

  useEffect(() => {
    latest.current = {
      tagId: selectedTagId,
      text: noteText,
      isPublic,
    };
    onAutoSaveRef.current = onAutoSave;
    onUnmountedSaveRef.current = onUnmountedSave;
    onDraftChangeRef.current = onDraftChange;
    autoSaveRef.current = autoSave;
    allowEmptyTextRef.current = allowEmptyText;
  });

  // Keep the outer draft store in sync — a reopened modal
  // restores `note` from it.
  useEffect(() => {
    onDraftChangeRef.current?.(selectedTagId, noteText, isPublic);
  }, [selectedTagId, noteText, isPublic]);

  // Until the user touches the box it follows the selected
  // tag's publicity — and a public tag arriving via a late
  // getTags resolves updates it too.
  useEffect(() => {
    if (!publicTouchedRef.current) {
      setIsPublic(
        tags.find((t) => t.id === selectedTagId)?.public ?? false
      );
    }
  }, [selectedTagId, tags]);

  // Sync on the primitive fields, not the `note` object itself:
  // every call site passes a fresh inline object each render, so
  // keying on identity would wipe in-progress edits whenever the
  // parent re-renders (linked-notes fetches, verse picker, etc.).
  const noteTagId = note?.tagId;
  const noteTextProp = note?.text;
  const noteIsPublic = note?.isPublic;
  useEffect(() => {
    if (noteTagId !== undefined && noteTextProp !== undefined) {
      setSelectedTagId(noteTagId);
      setNoteText(noteTextProp);
      // A re-seeded draft restores (or clears) the publicity
      // seed — an explicit flag counts as user-set so a later
      // tag switch keeps it.
      if (noteIsPublic !== undefined) {
        setIsPublic(noteIsPublic);
        publicTouchedRef.current = true;
      } else {
        publicTouchedRef.current = false;
      }
    }
  }, [noteTagId, noteTextProp, noteIsPublic]);

  // The last content autosave persisted — ticks that would write
  // the same payload again are skipped.
  const lastSavedRef = useRef<{
    tagId: string;
    text: string;
    isPublic: boolean;
  } | null>(null);
  // Set once a submit persisted the form: the hook deletes the
  // draft, so the unmount flush must not run — a late save
  // would recreate it with `savedNoteId: null` and POST a
  // duplicate of the just-submitted note.
  const submittedRef = useRef(false);

  // Unmount = the modal closed (Mantine unmounts content, and
  // parents drop the modal itself). Flush the unsaved tail so
  // a close inside the autosave window does not drop the last
  // seconds of typing.
  useEffect(
    () => () => {
      const save = onAutoSaveRef.current;
      if (!save || !autoSaveRef.current) return;
      const { tagId, text, isPublic } = latest.current;
      // A verse-linked note may flush with empty text; a
      // truly empty note (no text, nothing linked) is skipped.
      if (!tagId) return;
      if (
        !allowEmptyTextRef.current &&
        !toPlainText(text).trim()
      ) {
        return;
      }
      // Chain behind an in-flight save — the draft's note id
      // only exists once its POST resolves.
      const chain = inFlightRef.current ?? Promise.resolve();
      void chain
        .then(() => {
          // Decide HERE, once the in-flight write settled —
          // not at unmount. A submit still in flight marks
          // lastSavedRef/submittedRef only when it resolves,
          // and that resolve also deletes the draft: flushing
          // anyway would POST the same text into a fresh
          // draft as a duplicate note.
          if (submittedRef.current) return undefined;
          const last = lastSavedRef.current;
          if (
            last &&
            last.tagId === tagId &&
            last.text === text &&
            last.isPublic === isPublic
          ) {
            return undefined;
          }
          return save(tagId, text, isPublic);
        })
        .then(() => onUnmountedSaveRef.current?.())
        .catch((error) => console.error(error));
    },
    []
  );

  useEffect(() => {
    if (!autoSave) return;
    const tick = () => {
      const save = onAutoSaveRef.current;
      if (!save || inFlightRef.current) return;
      const { tagId, text, isPublic } = latest.current;
      // Skip contentless notes AND empty tag — the latter
      // used to POST `tag: ''` every 5s, a stream of silent
      // 400s. Verse-linked notes may save with empty text.
      if (!tagId) return;
      if (
        !allowEmptyTextRef.current &&
        !toPlainText(text).trim()
      ) {
        return;
      }
      const last = lastSavedRef.current;
      if (
        last &&
        last.tagId === tagId &&
        last.text === text &&
        last.isPublic === isPublic
      ) {
        return;
      }
      trackInFlight(inFlightRef, save(tagId, text, isPublic))
        .then((result) => {
          // A resolved-false save was declined — the content
          // stays dirty so the next tick or the unmount
          // flush retries, and the saved check must not
          // flash for a write that never happened.
          if (result === false) return;
          lastSavedRef.current = { tagId, text, isPublic };
          setSavedFlash(true);
          flashTimeout.current = window.setTimeout(
            () => setSavedFlash(false),
            SAVED_FLASH_MS
          );
        })
        .catch((error) => console.error(error));
    };
    const interval = window.setInterval(tick, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [autoSave]);

  useEffect(
    () => () => {
      if (flashTimeout.current) {
        window.clearTimeout(flashTimeout.current);
      }
    },
    []
  );

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    // Guard empty submissions — the API would reject a
    // tagless note, and a note with neither text nor linked
    // verses carries nothing.
    if (!selectedTagId) {
      showNotification({
        title: 'Cannot save note',
        message: 'Please choose a tag.',
        color: 'red',
      });
      return;
    }
    if (!allowEmptyText && !toPlainText(noteText).trim()) {
      showNotification({
        title: 'Cannot save note',
        message: 'Note text is required.',
        color: 'red',
      });
      return;
    }
    // Wait for an in-flight autosave first: the parent then sees
    // the created note id and PATCHes instead of POSTing a
    // duplicate. Holding the lock while submitting also keeps an
    // interval tick from interleaving a write mid-submit.
    await inFlightRef.current;
    try {
      const result = await trackInFlight(
        inFlightRef,
        Promise.resolve(
          onSubmit(selectedTagId, noteText, isPublic)
        )
      );
      // `false` signals a rejected submit — leave the content
      // eligible for the unmount flush. Anything else means the
      // content is persisted; mark it saved so the flush does
      // not rewrite it on close. submittedRef additionally
      // covers text typed after the submit click: the draft is
      // finished, so those edits must not spawn a second note.
      if (result !== false) {
        submittedRef.current = true;
        lastSavedRef.current = {
          tagId: selectedTagId,
          text: noteText,
          isPublic,
        };
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Select
        variant="transparent"
        label="Tag"
        // Select by id — mapping by name silently picked the
        // first of two same-named tags.
        value={selectedTagId || null}
        onChange={(item: string | null) => {
          setSelectedTagId(item ?? "");
        }}
        onDropdownOpen={onTagDropdownOpen}
        data={tags.map((tag) => ({
          value: tag.id,
          label: tag.name,
        }))}
        searchable
        maxDropdownHeight={window.innerHeight * 0.7}
      />
      <RichTextEditor
        variant="note"
        label="Note"
        value={noteText}
        onChange={setNoteText}
      />
      <Box
        data-testid="note-submit-bar"
        sx={(theme) => ({
          position: "sticky",
          bottom: 0,
          padding: theme.spacing.xs,
          zIndex: 1,
          backgroundColor:
            theme.colorScheme === "dark"
              ? theme.colors.dark[7]
              : theme.white,
          borderTop: `1px solid ${
            theme.colorScheme === "dark"
              ? theme.colors.dark[4]
              : theme.colors.gray[3]
          }`,
        })}
      >
        <Group spacing="xs">
          <Button variant="transparent" type="submit" fullWidth>
            {submitText}
          </Button>
          {onAutoSave && (
            <Checkbox
              label="Auto save"
              checked={autoSave}
              onChange={(event) =>
                setAutoSave(event.currentTarget.checked)
              }
            />
          )}
          <Tooltip
            label="Anyone with the link can view this note"
            position="top"
          >
            <Checkbox
              label="Public note"
              checked={isPublic}
              onChange={(event) => {
                publicTouchedRef.current = true;
                setIsPublic(event.currentTarget.checked);
              }}
            />
          </Tooltip>
        </Group>
      </Box>
      {savedFlash && (
        <Affix position={{ top: 20, right: 20 }}>
          <ThemeIcon color="green" variant="filled" radius="xl">
            <IconCheck size={16} />
          </ThemeIcon>
        </Affix>
      )}
    </form>
  );
};

export default NoteForm;
