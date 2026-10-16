import {
  Affix,
  Box,
  Button,
  Checkbox,
  Group,
  Select,
  ThemeIcon,
} from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Tag } from "../types";
import { toPlainText } from "../utils/tiptapContent";
import RichTextEditor from "./RichTextEditor";

interface NoteFormProps {
  tags: Tag[];
  note?: { tagId: string; text: string };
  /**
   * May resolve `false` to signal a rejected submit (failed
   * validation or save) — the content then stays eligible for
   * the unmount flush. Any other resolved value counts as
   * persisted.
   */
  onSubmit: (
    tagId: string,
    text: string
  ) => void | Promise<unknown>;
  submitText: string;
  onTagDropdownOpen: () => void;
  onAutoSave?: (tagId: string, text: string) => Promise<unknown>;
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
  onDraftChange?: (tagId: string, text: string) => void;
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
  submitText,
  onTagDropdownOpen,
  onAutoSave,
  onUnmountedSave,
  onDraftChange,
}: NoteFormProps) => {
  const [selectedTagId, setSelectedTagId] = useState(note?.tagId || "");
  const [noteText, setNoteText] = useState(note?.text || "");
  const [autoSave, setAutoSave] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const latest = useRef({ tagId: "", text: "" });
  const onAutoSaveRef = useRef(onAutoSave);
  const onUnmountedSaveRef = useRef(onUnmountedSave);
  const onDraftChangeRef = useRef(onDraftChange);
  const autoSaveRef = useRef(autoSave);
  // Shared save lock for autosave ticks and submit: overlapping
  // writes could POST two notes for one draft (or let stale text
  // win over a submit), so both paths must respect it.
  const inFlightRef = useRef<Promise<void> | null>(null);
  const flashTimeout = useRef<number | undefined>(undefined);

  useEffect(() => {
    latest.current = { tagId: selectedTagId, text: noteText };
    onAutoSaveRef.current = onAutoSave;
    onUnmountedSaveRef.current = onUnmountedSave;
    onDraftChangeRef.current = onDraftChange;
    autoSaveRef.current = autoSave;
  });

  // Keep the outer draft store in sync — a reopened modal
  // restores `note` from it.
  useEffect(() => {
    onDraftChangeRef.current?.(selectedTagId, noteText);
  }, [selectedTagId, noteText]);

  // Sync on the primitive fields, not the `note` object itself:
  // every call site passes a fresh inline object each render, so
  // keying on identity would wipe in-progress edits whenever the
  // parent re-renders (linked-notes fetches, verse picker, etc.).
  const noteTagId = note?.tagId;
  const noteTextProp = note?.text;
  useEffect(() => {
    if (noteTagId !== undefined && noteTextProp !== undefined) {
      setSelectedTagId(noteTagId);
      setNoteText(noteTextProp);
    }
  }, [noteTagId, noteTextProp]);

  // The last content autosave persisted — ticks that would write
  // the same payload again are skipped.
  const lastSavedRef = useRef<{ tagId: string; text: string } | null>(
    null
  );

  // Unmount = the modal closed (Mantine unmounts content, and
  // parents drop the modal itself). Flush the unsaved tail so
  // a close inside the autosave window does not drop the last
  // seconds of typing.
  useEffect(
    () => () => {
      const save = onAutoSaveRef.current;
      if (!save || !autoSaveRef.current) return;
      const { tagId, text } = latest.current;
      if (!tagId || !toPlainText(text).trim()) return;
      const last = lastSavedRef.current;
      if (last && last.tagId === tagId && last.text === text) {
        return;
      }
      // Chain behind an in-flight save — the draft's note id
      // only exists once its POST resolves.
      const chain = inFlightRef.current ?? Promise.resolve();
      void chain
        .then(() => save(tagId, text))
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
      const { tagId, text } = latest.current;
      // Skip empty text AND empty tag — the latter used to
      // POST `tag: ''` every 5s, a stream of silent 400s.
      if (!tagId || !toPlainText(text).trim()) return;
      const last = lastSavedRef.current;
      if (last && last.tagId === tagId && last.text === text) {
        return;
      }
      trackInFlight(inFlightRef, save(tagId, text))
        .then(() => {
          lastSavedRef.current = { tagId, text };
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
    // Wait for an in-flight autosave first: the parent then sees
    // the created note id and PATCHes instead of POSTing a
    // duplicate. Holding the lock while submitting also keeps an
    // interval tick from interleaving a write mid-submit.
    await inFlightRef.current;
    try {
      const result = await trackInFlight(
        inFlightRef,
        Promise.resolve(onSubmit(selectedTagId, noteText))
      );
      // `false` signals a rejected submit — leave the content
      // eligible for the unmount flush. Anything else means the
      // content is persisted; mark it saved so the flush does
      // not rewrite it on close.
      if (result !== false) {
        lastSavedRef.current = {
          tagId: selectedTagId,
          text: noteText,
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
