import type { MouseEvent } from "react";
import { useState } from "react";
import { Box, Card, Group, Text, Title } from "@mantine/core";
import { Note, NoteOrderMenuData } from "../types";
import { useBibleStore } from "../store";
import NoteOrderMenu from "./NoteOrderMenu";
import CommentThread from "./CommentThread";
import ScripturePassage from "./ScripturePassage";
import RichTextView from "./RichTextView";
import NoteCardActions from "./NoteCardActions";
import NoteVerseList from "./NoteVerseList";
import { noteHeading } from "../utils/noteHeading";
import useScripturePreview from "../hooks/useScripturePreview";

interface NoteCardProps {
  note: Note;
  onViewInBible: (book: string, chapter: number, verse: number) => void;
  onEdit?: (note: Note) => void;
  onDelete?: (evt: MouseEvent<HTMLButtonElement>, note: Note) => void;
  onPlayFromNote?: (noteId: string) => void;
  commentCount?: number;
  onCountChange?: (delta: number) => void;
  /** Verse selection scope — defaults to the note id. The drag
   *  overlay passes a distinct scope so it never shares DOM ids or
   *  selection state with the real card. */
  verseScope?: string;
  dragHandleProps?: {
    ref?: (element: HTMLElement | null) => void;
    [key: string]: unknown;
  };
  /** When present (custom sort + authenticated), renders the
   *  `#k` order badge + move dropdown in the action group. */
  orderMenu?: NoteOrderMenuData;
}

const NoteCard = ({
  note,
  onViewInBible,
  onEdit,
  onDelete,
  onPlayFromNote,
  commentCount,
  onCountChange,
  verseScope,
  dragHandleProps,
  orderMenu,
}: NoteCardProps) => {
  const scope = verseScope ?? note.id;
  const [threadOpen, setThreadOpen] = useState(false);
  const {
    preview: passageContainer,
    error,
    togglePreview: onGrabBiblePassage,
  } = useScripturePreview();

  const heading = noteHeading(note);

  const versesFolded = useBibleStore((state) => state.versesFolded);

  // The order badge is opt-in: notes missing from the index
  // (and callers that never pass `orderMenu`, e.g.
  // NoteDetailRoute) simply render no badge.
  const orderId = orderMenu?.orderIdByNoteId.get(note.id);
  const orderMenuNode =
    orderMenu && orderId !== undefined ? (
      <NoteOrderMenu
        noteId={note.id}
        orderId={orderId}
        data={orderMenu}
      />
    ) : null;

  return (
    <Card shadow="sm" padding="sm" radius="md" mb={15}>
      {error && (
        <Text color="red">{error}</Text>
      )}
      <Box
        sx={!versesFolded ? (theme) => ({
          display: 'flex',
          alignItems: 'flex-start',
          gap: theme.spacing.md,
          marginBottom: 0,
          overflow: 'hidden',
        }) : undefined}
      >
        <Group
          position="apart"
          mb={0}
          sx={!versesFolded
            ? { flex: 1, minWidth: 0 }
            : undefined}
        >
          <Title 
            order={4} 
            className="note-card-heading"
            ref={dragHandleProps?.ref}
            {...(dragHandleProps ? Object.fromEntries(
              Object.entries(dragHandleProps).filter(([key]) => key !== 'ref')
            ) : {})}
            sx={dragHandleProps ? {
              cursor: 'grab',
              userSelect: 'none',
              '&:active': {
                cursor: 'grabbing',
              },
            } : undefined}
          >
            {heading}
          </Title>
          {versesFolded && (
            <NoteCardActions
              note={note}
              onViewInBible={onViewInBible}
              onEdit={onEdit}
              onDelete={onDelete}
              onPlayFromNote={onPlayFromNote}
              commentCount={commentCount}
              threadOpen={threadOpen}
              onToggleThread={() =>
                setThreadOpen((o) => !o)
              }
              orderMenuNode={orderMenuNode}
              sx={{ position: 'relative', zIndex: 1 }}
            />
          )}
        </Group>
        {!versesFolded && (
          <NoteCardActions
            note={note}
            onViewInBible={onViewInBible}
            onEdit={onEdit}
            onDelete={onDelete}
            onPlayFromNote={onPlayFromNote}
            commentCount={commentCount}
            threadOpen={threadOpen}
            onToggleThread={() =>
              setThreadOpen((o) => !o)
            }
            orderMenuNode={orderMenuNode}
            sx={{
              flexShrink: 0,
              position: 'relative',
              zIndex: 1,
            }}
          />
        )}
      </Box>

      <NoteVerseList
        note={note}
        scope={scope}
        folded={versesFolded}
      />

      {note.note_text && (
        <Box
          mt={10}
          p={10}
          sx={(theme) => ({
            backgroundColor:
              theme.colorScheme === "dark"
                ? theme.colors.dark[4]
                : theme.colors.gray[4],
            borderRadius: theme.radius.sm,
          })}
        >
          <Box sx={{ fontStyle: "italic" }}>
            <RichTextView
              content={note.note_text}
              onScriptureRef={onGrabBiblePassage}
            />
          </Box>
        </Box>
      )}
      {passageContainer && (
        <ScripturePassage reference={passageContainer} />
      )}

      {threadOpen && (
        <Box
          id={`comment-thread-${note.id}`}
          mt={8}
        >
          <CommentThread
            noteId={note.id}
            onCountChange={onCountChange}
          />
        </Box>
      )}
    </Card>
  );
};

export default NoteCard;
