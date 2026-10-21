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
import { Note, CommentCounts, NoteOrderMenuData } from "../types";
import { ConflictError } from "../api";
import { useBibleStore } from "../store";
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
  /** True when the viewed tag belongs to the current user —
   *  production notes lack `is_owner`, so cards use this as
   *  the edit/delete signal for own tags. */
  isTagOwner?: boolean;
  tagId?: string;
  onReorder?: (
    tagId: string,
    noteIds: string[],
    currentPage: number,
    pageSize: number
  ) => void | Promise<unknown>;
  sortOrder?: string;
  currentPage?: number;
  pageSize?: number;
  /** Order-badge dropdown data (custom sorts + auth only). */
  orderMenu?: NoteOrderMenuData;
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
  isTagOwner = false,
  tagId = '',
  onReorder,
  sortOrder,
  currentPage = 1,
  pageSize = 25,
  orderMenu,
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
      // The reorder may reject (conflict/network) — awaiting it
      // here both avoids an unhandled rejection and rolls the
      // optimistic order back to the server's.
      void Promise.resolve(
        onReorder(tagId, idsToSend, currentPage, pageSize)
      ).catch((error) => {
        // A ConflictError means the store action already
        // refetched the server's authoritative order — resync
        // to the live store state; rolling back to this
        // render's stale `notes` snapshot would overwrite the
        // refresh. Plain failures keep the snapshot rollback.
        if (error instanceof ConflictError) {
          setLocalNotes(useBibleStore.getState().notes);
        } else {
          setLocalNotes(notes);
        }
      });
    }
  };

  const activeNote = activeId 
    ? localNotes.find(n => n.id === activeId) 
    : null;

  // The static list and the sortable list hand NoteCard /
  // SortableNoteCard an identical prop set — build it once.
  // (The drag overlay stays explicit: it deliberately gets a
  // minimal, read-only prop set plus its own verse scope.)
  const noteCardProps = (note: Note) => ({
    note,
    onViewInBible,
    onEdit: onEditNote,
    onDelete: onDeleteNote,
    onPlayFromNote,
    commentCount: commentCounts?.[note.id],
    onCountChange: onCountChange
      ? (delta: number) => onCountChange(note.id, delta)
      : undefined,
    isTagOwner,
    orderMenu,
  });

  if (!isDraggable) {
    return (
      <Stack spacing="md" mb={30}>
        <Title order={2} mb={5} pl={10}>
          {tagName}
        </Title>
        {notes.map((note) => (
          <NoteCard key={note.id} {...noteCardProps(note)} />
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
          <Title order={2} mb={5} pl={10}>
            {tagName}
          </Title>
          {localNotes.map((note) => (
            <SortableNoteCard
              key={note.id}
              {...noteCardProps(note)}
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
            verseScope={`${activeNote.id}__overlay`}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default TagSection;
