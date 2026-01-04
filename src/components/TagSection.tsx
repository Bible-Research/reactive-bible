import { Title, Stack } from "@mantine/core";
import { Note } from "../types";
import NoteCard from "./NoteCard";

interface TagSectionProps {
  tagName: string;
  notes: Note[];
  onViewInBible: (book: string, chapter: number, verse: number) => void;
  onEditNote: (note: Note) => void;
}

const TagSection = ({ tagName, notes, onViewInBible, onEditNote }: TagSectionProps) => {
  return (
    <Stack spacing="md" mb={30}>
      <Title order={2} mb={5}>
        {tagName}
      </Title>
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} onViewInBible={onViewInBible} onEdit={onEditNote} />
      ))}
    </Stack>
  );
};

export default TagSection;
