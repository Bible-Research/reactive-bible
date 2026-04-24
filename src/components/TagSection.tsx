import type { MouseEvent } from "react";
import { Title, Stack } from "@mantine/core";
import { Note } from "../types";
import NoteCard from "./NoteCard";

interface TagSectionProps {
  tagName: string;
  notes: Note[];
  onViewInBible: (book: string, chapter: number, verse: number) => void;
  onEditNote?: (note: Note) => void;
  onDeleteNote?: (evt: MouseEvent<HTMLButtonElement>, note: Note) => void;
}

const TagSection = ({ tagName, notes, onViewInBible, onEditNote, onDeleteNote }: TagSectionProps) => {
  return (
    <Stack spacing="md" mb={30}>
      <Title order={2} mb={5}>
        {tagName}
      </Title>
      {notes.map((note) => (
        <NoteCard 
          key={note.id} 
          note={note} 
          onViewInBible={onViewInBible} 
          onEdit={onEditNote} 
          onDelete={onDeleteNote} 
        />
      ))}
    </Stack>
  );
};

export default TagSection;
