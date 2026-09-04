import type { MouseEvent } from "react";
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box } from "@mantine/core";
import { Note } from "../types";
import NoteCard from "./NoteCard";

interface SortableNoteCardProps {
  note: Note;
  onViewInBible: (
    book: string,
    chapter: number,
    verse: number
  ) => void;
  onEdit?: (note: Note) => void;
  onDelete?: (
    evt: MouseEvent<HTMLButtonElement>,
    note: Note
  ) => void;
  onPlayFromNote?: (noteId: string) => void;
  commentCount?: number;
  onCountChange?: (delta: number) => void;
}

const SortableNoteCard = ({
  note,
  onViewInBible,
  onEdit,
  onDelete,
  onPlayFromNote,
  commentCount,
  onCountChange,
}: SortableNoteCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
    >
      <NoteCard
        note={note}
        onViewInBible={onViewInBible}
        onEdit={onEdit}
        onDelete={onDelete}
        onPlayFromNote={onPlayFromNote}
        commentCount={commentCount}
        onCountChange={onCountChange}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </Box>
  );
};

export default SortableNoteCard;
