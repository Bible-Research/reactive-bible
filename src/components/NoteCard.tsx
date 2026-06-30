import type { MouseEvent } from "react";
import { useState } from "react";
import { Card, Title, Text, Group, Box, Button, Tooltip } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { IconMessageCircle } from "@tabler/icons-react";
import { Note } from "../types";
import { useAuthStore } from "../stores/authStore";
import { useBibleStore } from "../store";
import Verse from "./Verse";
import ButtonComponent from "./Button";
import CommentThread from "./CommentThread";

interface NoteCardProps {
  note: Note;
  onViewInBible: (book: string, chapter: number, verse: number) => void;
  onEdit?: (note: Note) => void;
  onDelete?: (evt: MouseEvent<HTMLButtonElement>, note: Note) => void;
  commentCount?: number;
  onCountChange?: (delta: number) => void;
}

const NoteCard = ({
  note,
  onViewInBible,
  onEdit,
  onDelete,
  commentCount,
  onCountChange,
}: NoteCardProps) => {
  const [threadOpen, setThreadOpen] = useState(false);
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  const versesFolded = useBibleStore((state) => state.versesFolded);

  const firstVerse = note?.verses?.[0]?.verse || 1;
  const lastVerse =
    note?.verses?.[(note.verses?.length ?? 0) - 1]?.verse || 1;
  const book = note?.verses?.[0]?.book || "";
  const chapter = note?.verses?.[0]?.chapter || 1;

  const heading =
    firstVerse === lastVerse
      ? `${book} ${chapter}:${firstVerse}`
      : `${book} ${chapter}:${firstVerse}-${lastVerse}`;

  const canEdit = (note.is_owner !== false) && !!onEdit;
  const canDelete = (note.is_owner !== false) && !!onDelete;
  const canShare = note.public;

  const handleShare = async () => {
    const url = `${window.location.origin}/notes/${note.id}`;
    const title = note.tag?.name
      ? `Note: ${note.tag.name}`
      : 'Shared note';
    const text = note.note_text
      ? note.note_text.slice(0, 140)
      : 'Shared Bible note';

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('Error sharing:', err);
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      showNotification({
        title: 'Link Copied!',
        message: 'Note link copied to clipboard',
        color: 'blue',
      });
    } catch (err) {
      console.error('Error copying to clipboard:', err);
    }
  };

  // commentCount is undefined on the detail route, which renders
  // its own always-expanded CommentThread – no badge needed there.
  const showCommentButton = commentCount === undefined
    ? false
    : commentCount > 0 || isAuthenticated;

  return (
    <Card shadow="sm" padding="sm" radius="md" mb={15}>
      <Group position="apart" mb={0}>
        <Title order={4}>{heading}</Title>
        <Group spacing="xs">
          <ButtonComponent
            variant="subtle"
            size="xs"
            onClick={() => onViewInBible(book, chapter, firstVerse)}
          >
            View in Bible
          </ButtonComponent>
          {canShare && (
            <ButtonComponent
              variant="subtle"
              size="xs"
              onClick={handleShare}
            >
              Share
            </ButtonComponent>
          )}
          {canEdit && (
            <ButtonComponent
              variant="subtle"
              size="xs"
              onClick={() => onEdit!(note)}
            >
              Edit
            </ButtonComponent>
          )}
          {canDelete && (
            <ButtonComponent
              variant="subtle"
              size="xs"
              onClick={
                (evt: MouseEvent<HTMLButtonElement>) =>
                  onDelete!(evt, note)
              }
            >
              Remove
            </ButtonComponent>
          )}
          {showCommentButton && (
            <Tooltip
              label={
                commentCount === 0
                  ? 'Add a comment'
                  : `${commentCount} comment${
                      commentCount === 1 ? '' : 's'
                    }`
              }
              position="top"
            >
              <Button
                variant="subtle"
                size="xs"
                compact
                leftIcon={
                  <IconMessageCircle size={14} />
                }
                aria-label={
                  commentCount === 0
                    ? 'Add a comment'
                    : undefined
                }
                aria-expanded={threadOpen}
                aria-controls={`comment-thread-${note.id}`}
                onClick={() =>
                  setThreadOpen((o) => !o)
                }
              >
                {commentCount && commentCount > 0
                  ? String(commentCount)
                  : null}
              </Button>
            </Tooltip>
          )}
        </Group>
      </Group>

      <Box mt={-10}>
        {versesFolded
          ? note?.verses?.slice(0, 1).map(v => (
            <Verse
              key={v.verse}
              verse={v.verse}
              text={v.text}
              folded
              selectable={false}
            />
          ))
          : note?.verses?.map(v => (
            <Verse
              key={v.verse}
              verse={v.verse}
              text={v.text}
              selectable={false}
            />
          ))
        }
      </Box>

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
        <Text fs="italic">
          {note.note_text}
        </Text>
      </Box>

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
