import {
  Affix,
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
  latest.current = { tagId: selectedTagId, text: noteText };
  const onAutoSaveRef = useRef(onAutoSave);
  onAutoSaveRef.current = onAutoSave;
  const savingRef = useRef(false);
  const flashTimeout = useRef<number | undefined>(undefined);

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
      if (!save || savingRef.current) return;
      const { tagId, text } = latest.current;
      if (!toPlainText(text).trim()) return;
      savingRef.current = true;
      save(tagId, text)
        .then(() => {
          setSavedFlash(true);
          flashTimeout.current = window.setTimeout(
            () => setSavedFlash(false),
            SAVED_FLASH_MS
          );
        })
        .catch((error) => console.error(error))
        .finally(() => {
          savingRef.current = false;
        });
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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(selectedTagId, noteText);
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
      <Group mt="md" spacing="xs">
        <Button variant="transparent" type="submit">
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
