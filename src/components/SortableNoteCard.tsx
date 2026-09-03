import type { MouseEvent } from "react";
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box, Group } from "@mantine/core";
import { IconGripVertical } from '@tabler/icons-react';
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
  commentCount?: number;
  onCountChange?: (delta: number) => void;
}

const SortableNoteCard = ({
  note,
  onViewInBible,
  onEdit,
  onDelete,
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
    <Box ref={setNodeRef} style={style}>
      <Group spacing={0} align="flex-start" noWrap>
        <Box
          {...attributes}
          {...listeners}
          sx={{
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            padding: '8px 4px',
            '&:active': {
              cursor: 'grabbing',
            },
          }}
        >
          <IconGripVertical size={20} color="gray" />
        </Box>
        <Box style={{ flex: 1 }}>
          <NoteCard
            note={note}
            onViewInBible={onViewInBible}
            onEdit={onEdit}
            onDelete={onDelete}
            commentCount={commentCount}
            onCountChange={onCountChange}
          />
        </Box>
      </Group>
    </Box>
  );
};

export default SortableNoteCard;
