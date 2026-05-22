import type { MouseEvent } from "react";
import { Title, Stack } from "@mantine/core";
import { Note, CommentCounts } from "../types";
import NoteCard from "./NoteCard";

interface TagSectionProps {
  tagName: string;
  notes: Note[];
  onViewInBible: (
    book: string,
    chapter: number,
    verse: number
  ) => void;
  onEditNote?: (note: Note) => void;
  onDeleteNote?: (
    evt: MouseEvent<HTMLButtonElement>,
    note: Note
  ) => void;
  commentCounts?: CommentCounts;
  onCountChange?: (noteId: string, delta: number) => void;
}

const TagSection = ({
  tagName,
  notes,
  onViewInBible,
  onEditNote,
  onDeleteNote,
  commentCounts,
  onCountChange,
}: TagSectionProps) => {
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
          commentCount={commentCounts?.[note.id]}
          onCountChange={
            onCountChange
              ? (delta) => onCountChange(note.id, delta)
              : undefined
          }
        />
      ))}
    </Stack>
  );
};

export default TagSection;
