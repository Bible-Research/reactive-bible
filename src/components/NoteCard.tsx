import type { MouseEvent } from "react";
import { useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Group,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconMessageCircle,
  IconPlayerPlay,
  IconBook,
  IconShare,
  IconEdit,
  IconTrash,
} from "@tabler/icons-react";
import { Note } from "../types";
import { useAuthStore } from "../stores/authStore";
import { useBibleStore } from "../store";
import Verse from "./Verse";
import CommentThread from "./CommentThread";
import SectionHeadingComponent from "./SectionHeading";
import ScripturePassage from "./ScripturePassage";
import RichTextView from "./RichTextView";
import { toPlainText } from "../utils/tiptapContent";
import {
  isSameScriptureRef,
  parseScriptureRef,
  ScriptureRef,
} from "../utils/scriptureRef";

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
}: NoteCardProps) => {
  const scope = verseScope ?? note.id;
  const [threadOpen, setThreadOpen] = useState(false);
  const [passageContainer, setPassageContainer] =
    useState<ScriptureRef | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use headings from the note (provided by backend)
  const noteHeadings = note.headings || [];

  // The notes API sets error/error_code when the upstream
  // Bible provider fails to resolve verse text.
  const verseError = note?.error;

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  const onGrabBiblePassage = (hashtag: string): void => {
    const result = parseScriptureRef(hashtag);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);
    setPassageContainer((current) =>
      isSameScriptureRef(current, result.ref) ? null : result.ref
    );
  };

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
      ? toPlainText(note.note_text).slice(0, 140)
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
            ref={dragHandleProps?.ref as any}
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
            <Group spacing="xs" sx={{ position: 'relative', zIndex: 1 }}>
              <Tooltip label="View in Bible" position="top">
                <Box component="span" sx={{ display: 'inline-block' }}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => onViewInBible(book, chapter, firstVerse)}
                    aria-label="view-in-bible"
                  >
                    <IconBook size={16} />
                  </ActionIcon>
                </Box>
              </Tooltip>
              {canShare && (
                <Tooltip label="Share" position="top">
                  <Box component="span" sx={{ display: 'inline-block' }}>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={handleShare}
                      aria-label="share-note"
                    >
                      <IconShare size={16} />
                    </ActionIcon>
                  </Box>
                </Tooltip>
              )}
              {onPlayFromNote && (
                <Tooltip label="Play from here" position="top">
                  <Box component="span" sx={{ display: 'inline-block' }}>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      color="blue"
                      onClick={() => onPlayFromNote(note.id)}
                      aria-label={`play-from-${note.id}`}
                    >
                      <IconPlayerPlay size={16} />
                    </ActionIcon>
                  </Box>
                </Tooltip>
              )}
              {canEdit && (
                <Tooltip label="Edit" position="top">
                  <Box component="span" sx={{ display: 'inline-block' }}>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={() => onEdit!(note)}
                      aria-label="edit-note"
                    >
                      <IconEdit size={16} />
                    </ActionIcon>
                  </Box>
                </Tooltip>
              )}
              {canDelete && (
                <Tooltip label="Remove" position="top">
                  <Box component="span" sx={{ display: 'inline-block' }}>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      color="red"
                      onClick={
                        (evt: MouseEvent<HTMLButtonElement>) =>
                          onDelete!(evt, note)
                      }
                      aria-label="remove-note"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Box>
                </Tooltip>
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
                  <Box component="span" sx={{ display: 'inline-block' }}>
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
                  </Box>
                </Tooltip>
              )}
            </Group>
          )}
        </Group>
        {!versesFolded && (
          <Group
            spacing="xs"
            sx={{
              flexShrink: 0,
              position: 'relative',
              zIndex: 1,
            }}
          >
            <Tooltip label="View in Bible" position="top">
              <Box component="span" sx={{ display: 'inline-block' }}>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => onViewInBible(book, chapter, firstVerse)}
                  aria-label="view-in-bible"
                >
                  <IconBook size={16} />
                </ActionIcon>
              </Box>
            </Tooltip>
            {canShare && (
              <Tooltip label="Share" position="top">
                <Box component="span" sx={{ display: 'inline-block' }}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={handleShare}
                    aria-label="share-note"
                  >
                    <IconShare size={16} />
                  </ActionIcon>
                </Box>
              </Tooltip>
            )}
            {onPlayFromNote && (
              <Tooltip label="Play from here" position="top">
                <Box component="span" sx={{ display: 'inline-block' }}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    color="blue"
                    onClick={() => onPlayFromNote(note.id)}
                    aria-label={`play-from-${note.id}`}
                  >
                    <IconPlayerPlay size={16} />
                  </ActionIcon>
                </Box>
              </Tooltip>
            )}
            {canEdit && (
              <Tooltip label="Edit" position="top">
                <Box component="span" sx={{ display: 'inline-block' }}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => onEdit!(note)}
                    aria-label="edit-note"
                  >
                    <IconEdit size={16} />
                  </ActionIcon>
                </Box>
              </Tooltip>
            )}
            {canDelete && (
              <Tooltip label="Remove" position="top">
                <Box component="span" sx={{ display: 'inline-block' }}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    color="red"
                    onClick={
                      (evt: MouseEvent<HTMLButtonElement>) =>
                        onDelete!(evt, note)
                    }
                    aria-label="remove-note"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Box>
              </Tooltip>
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
                <Box component="span" sx={{ display: 'inline-block' }}>
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
                </Box>
              </Tooltip>
            )}
          </Group>
        )}
      </Box>

      <Box
        mt={-10}
        sx={{ position: 'relative', zIndex: 0 }}
        data-verse-scope={scope}
      >
        {verseError ? (
          <Text color="red" size="sm" mt={8}>
            {verseError}
            {note.error_code === 'rate_limited'
              ? ' Try reloading in a few moments.'
              : ''}
          </Text>
        ) : versesFolded
          ? note?.verses?.slice(0, 1).map(v => {
              // Check if there's a heading before this verse
              const heading = noteHeadings.find(
                h => h.before_verse === v.verse
              );
              return (
                <Box key={`${v.book}-${v.chapter}-${v.verse}`}>
                  {heading && (
                    <SectionHeadingComponent text={heading.text} />
                  )}
                  <Verse
                    scope={scope}
                    book={v.book}
                    chapter={v.chapter}
                    verse={v.verse}
                    text={v.text}
                    folded
                    selectable={false}
                  />
                </Box>
              );
            })
          : note?.verses?.map(v => {
              // Check if there's a heading before this verse
              const heading = noteHeadings.find(
                h => h.before_verse === v.verse
              );
              return (
                <Box key={`${v.book}-${v.chapter}-${v.verse}`}>
                  {heading && (
                    <SectionHeadingComponent text={heading.text} />
                  )}
                  <Verse
                    scope={scope}
                    book={v.book}
                    chapter={v.chapter}
                    verse={v.verse}
                    text={v.text}
                  />
                </Box>
              );
            })
        }
      </Box>

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
