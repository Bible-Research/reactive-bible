import { Title, Stack } from "@mantine/core";
import { Note } from "../api";
import NoteCard from "./NoteCard";

interface TagSectionProps {
  tagName: string;
  notes: Note[];
  onViewInBible: (book: string, chapter: number, verse: number) => void;
}

const TagSection = ({ tagName, notes, onViewInBible }: TagSectionProps) => {
  return (
    <Stack spacing="md" mb={30}>
      <Title order={2} mb={5}>
        {tagName}
      </Title>
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} onViewInBible={onViewInBible} />
      ))}
    </Stack>
  );
};

export default TagSection;
