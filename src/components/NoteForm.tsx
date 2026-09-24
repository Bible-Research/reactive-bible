import { Box, Button, Select } from "@mantine/core";
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
  const [selectedTagId, setSelectedTagId] = useState(note?.tagId || "");
  const [noteText, setNoteText] = useState(note?.text || "");

  useEffect(() => {
    if (note) {
      setSelectedTagId(note.tagId);
      setNoteText(note.text);
    }
  }, [note]);

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
      <Box
        title="note-submit-bar"
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
        <Button variant="transparent" type="submit" fullWidth>
          {submitText}
        </Button>
      </Box>
    </form>
  );
};

export default NoteForm;
