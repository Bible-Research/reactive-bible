import { Button, Select } from "@mantine/core";
import { useState, useEffect } from "react";
import { Tag } from "../types";
import RichTextEditor from "./RichTextEditor";

interface NoteFormProps {
  tags: Tag[];
  note?: { tagId: string; text: string };
  onSubmit: (tagId: string, text: string) => void;
  submitText: string;
  onTagDropdownOpen: () => void;
}

const NoteForm = ({
  tags,
  note,
  onSubmit,
  submitText,
  onTagDropdownOpen,
}: NoteFormProps) => {
  // Parents pass a fresh `note` object each render, so depend on
  // its values — object identity would re-seed and wipe edits.
  // Notes with identical tagId/text won't re-seed; pass an id or
  // use `key` if strict reset is ever needed.
  const initialTagId = note?.tagId;
  const initialText = note?.text;

  const [selectedTagId, setSelectedTagId] = useState(
    initialTagId || ""
  );
  const [noteText, setNoteText] = useState(initialText || "");

  useEffect(() => {
    if (initialTagId !== undefined && initialText !== undefined) {
      setSelectedTagId(initialTagId);
      setNoteText(initialText);
    }
  }, [initialTagId, initialText]);

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
      <Button variant="transparent" type="submit">
        {submitText}
      </Button>
    </form>
  );
};

export default NoteForm;
