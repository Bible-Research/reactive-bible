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
  onSubmit: (tagId: string, text: string) => void;
  submitText: string;
  onTagDropdownOpen: () => void;
  onAutoSave?: (tagId: string, text: string) => Promise<unknown>;
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
}: NoteFormProps) => {
  const [selectedTagId, setSelectedTagId] = useState(note?.tagId || "");
  const [noteText, setNoteText] = useState(note?.text || "");
  const [autoSave, setAutoSave] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const latest = useRef({ tagId: "", text: "" });
  const onAutoSaveRef = useRef(onAutoSave);
  // Shared save lock for autosave ticks and submit: overlapping
  // writes could POST two notes for one draft (or let stale text
  // win over a submit), so both paths must respect it.
  const inFlightRef = useRef<Promise<void> | null>(null);
  const flashTimeout = useRef<number | undefined>(undefined);

  useEffect(() => {
    latest.current = { tagId: selectedTagId, text: noteText };
    onAutoSaveRef.current = onAutoSave;
  });

  useEffect(() => {
    if (note) {
      setSelectedTagId(note.tagId);
      setNoteText(note.text);
    }
  }, [note]);

  useEffect(() => {
    if (!autoSave) return;
    const tick = () => {
      const save = onAutoSaveRef.current;
      if (!save || inFlightRef.current) return;
      const { tagId, text } = latest.current;
      if (!toPlainText(text).trim()) return;
      trackInFlight(inFlightRef, save(tagId, text))
        .then(() => {
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
      await trackInFlight(
        inFlightRef,
        Promise.resolve(onSubmit(selectedTagId, noteText))
      );
    } catch (error) {
      console.error(error);
    }
  };

  const selectedTagName =
    tags.find((tag) => tag.id === selectedTagId)?.name || "";

  return (
    <form onSubmit={handleSubmit}>
      <Select
        variant="transparent"
        label="Tag"
        value={selectedTagName}
        onChange={(item: string) => {
          const tagId = tags.find((tag) => tag.name === item)?.id;
          setSelectedTagId(tagId ?? "");
        }}
        onDropdownOpen={onTagDropdownOpen}
        data={tags.map((tag) => tag.name)}
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
