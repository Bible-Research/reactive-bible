import { useState, useEffect } from "react";
import type { MouseEvent } from "react";
import { Title, Stack } from "@mantine/core";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Note, CommentCounts } from "../types";
import NoteCard from "./NoteCard";
import SortableNoteCard from "./SortableNoteCard";

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
  onPlayFromNote?: (noteId: string) => void;
  commentCounts?: CommentCounts;
  onCountChange?: (noteId: string, delta: number) => void;
  isDraggable?: boolean;
  tagId?: string;
  onReorder?: (tagId: string, noteIds: string[]) => void;
}

const TagSection = ({
  tagName,
  notes,
  onViewInBible,
  onEditNote,
  onDeleteNote,
  onPlayFromNote,
  commentCounts,
  onCountChange,
  isDraggable = false,
  tagId = '',
  onReorder,
}: TagSectionProps) => {
  const [localNotes, setLocalNotes] = useState(notes);

  useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localNotes.findIndex((n) => n.id === active.id);
    const newIndex = localNotes.findIndex((n) => n.id === over.id);
    const reordered = arrayMove(localNotes, oldIndex, newIndex);

    setLocalNotes(reordered);
    if (onReorder && tagId) {
      onReorder(tagId, reordered.map((n) => n.id));
    }
  };

  if (!isDraggable) {
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
            onPlayFromNote={onPlayFromNote}
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
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={localNotes.map((n) => n.id)}
        strategy={verticalListSortingStrategy}
      >
        <Stack spacing="md" mb={30}>
          <Title order={2} mb={5}>
            {tagName}
          </Title>
          {localNotes.map((note) => (
            <SortableNoteCard
              key={note.id}
              note={note}
              onViewInBible={onViewInBible}
              onEdit={onEditNote}
              onDelete={onDeleteNote}
              onPlayFromNote={onPlayFromNote}
              commentCount={commentCounts?.[note.id]}
              onCountChange={
                onCountChange
                  ? (delta) => onCountChange(note.id, delta)
                  : undefined
              }
            />
          ))}
        </Stack>
      </SortableContext>
    </DndContext>
  );
};

export default TagSection;
