import { useState, useEffect } from "react";
import type { MouseEvent } from "react";
import { Title, Stack } from "@mantine/core";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
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
  onReorder?: (
    tagId: string,
    noteIds: string[],
    currentPage: number,
    pageSize: number
  ) => void;
  sortOrder?: string;
  currentPage?: number;
  pageSize?: number;
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
  sortOrder,
  currentPage = 1,
  pageSize = 25,
}: TagSectionProps) => {
  const [localNotes, setLocalNotes] = useState(notes);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Configure sensors for drag and drop
  // Use MouseSensor and TouchSensor separately for better control
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10, // 10px movement required before drag starts
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // 250ms press required before drag starts
        tolerance: 5, // 5px tolerance during delay
      },
    })
  );

  useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveId(null);
    
    if (!over || active.id === over.id) return;

    const oldIndex = localNotes.findIndex((n) => n.id === active.id);
    const newIndex = localNotes.findIndex((n) => n.id === over.id);
    const reordered = arrayMove(localNotes, oldIndex, newIndex);

    setLocalNotes(reordered);
    if (onReorder && tagId) {
      // When sorting descending, reverse the order before sending
      // to server so position 1 goes to the bottom note
      const noteIds = reordered.map((n) => n.id);
      const idsToSend = sortOrder === 'custom_desc'
        ? [...noteIds].reverse()
        : noteIds;
      onReorder(tagId, idsToSend, currentPage, pageSize);
    }
  };

  const activeNote = activeId 
    ? localNotes.find(n => n.id === activeId) 
    : null;

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
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
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
      <DragOverlay>
        {activeNote ? (
          <NoteCard
            note={activeNote}
            onViewInBible={onViewInBible}
            commentCount={commentCounts?.[activeNote.id]}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default TagSection;
