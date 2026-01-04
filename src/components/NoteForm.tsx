import { Button, Select, Textarea } from "@mantine/core";
import { useState, useEffect } from "react";
import { Tag } from "../types";

interface NoteFormProps {
  tags: Tag[];
  note?: { tagId: string; text: string };
  onSubmit: (tagId: string, text: string) => void;
  submitText: string;
  onTagDropdownOpen: () => void;
}

const NoteForm = ({ tags, note, onSubmit, submitText, onTagDropdownOpen }: NoteFormProps) => {
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

  const selectedTagName = tags.find((tag) => tag.id === selectedTagId)?.name || "";

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
        creatable
        getCreateLabel={(query) => `+ Create ${query}`}
      />
      <Textarea
        variant="transparent"
        label="Note"
        value={noteText}
        onChange={(event) => setNoteText(event.currentTarget.value)}
        minRows={15}
        autosize
        styles={{
          input: {
            fontSize: '16px',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word'
          }
        }}
      />
      <Button variant="transparent" type="submit">
        {submitText}
      </Button>
      <Button
        variant="transparent"
        onClick={() => window.open('https://bibleresearchapi.vercel.app/api/v1/tags/', '_blank')}
        style={{ width: '100%' }}
      >
        Or create a new tag
      </Button>
    </form>
  );
};

export default NoteForm;
