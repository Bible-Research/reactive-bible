import type { MouseEvent, ReactNode } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Tooltip,
} from "@mantine/core";
import type { Sx } from "@mantine/core";
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
import { toPlainText } from "../utils/tiptapContent";
import { shareOrCopyLink } from "../utils/share";

interface NoteCardActionsProps {
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
  threadOpen: boolean;
  onToggleThread: () => void;
  /** Optional `#k` order badge + move dropdown node. */
  orderMenuNode?: ReactNode;
  /**
   * True when the viewed tag is in the caller's own tag list.
   * Production notes do not send `is_owner` yet — without this,
   * owners could not edit/delete notes on their own tags.
   */
  isTagOwner?: boolean;
  /** Layout hook for the folded vs unfolded call sites. */
  sx?: Sx;
}

const NoteCardActions = ({
  note,
  onViewInBible,
  onEdit,
  onDelete,
  onPlayFromNote,
  commentCount,
  threadOpen,
  onToggleThread,
  orderMenuNode,
  isTagOwner,
  sx,
}: NoteCardActionsProps) => {
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  const firstVerse = note.verses?.[0]?.verse || 1;
  const book = note.verses?.[0]?.book || "";
  const chapter = note.verses?.[0]?.chapter || 1;

  // Ownership rule: authenticated AND (the viewed tag is one of
  // the user's own OR the note itself reports is_owner). The
  // tag-list half covers production, where notes omit
  // `is_owner`; the strict `is_owner === true` half keeps
  // foreign tags read-only once the backend ships the field —
  // fail closed rather than offering edit/delete that will 403.
  const ownsNote = isTagOwner === true || note.is_owner === true;
  const canEdit = isAuthenticated && ownsNote && !!onEdit;
  const canDelete = isAuthenticated && ownsNote && !!onDelete;
  const canShare = note.public;
  // Verse-less notes never enter the audio playlist
  // (buildNotePlaylistItems filters them out), so clicking
  // "play from here" would silently no-op — disable instead.
  const canPlay = (note.verses?.length ?? 0) > 0;

  const handleShare = async () => {
    const title = note.tag?.name
      ? `Note: ${note.tag.name}`
      : 'Shared note';
    const text = note.note_text
      ? toPlainText(note.note_text).slice(0, 140)
      : 'Shared Bible note';

    await shareOrCopyLink(
      {
        title,
        text,
        url: `${window.location.origin}/notes/${note.id}`,
      },
      {
        copySuccess: {
          title: 'Link Copied!',
          message: 'Note link copied to clipboard',
        },
        // A failed share sheet retries through the clipboard
        // rather than silently dropping the share.
        clipboardOnShareError: true,
      }
    );
  };

  // commentCount is undefined on the detail route, which renders
  // its own always-expanded CommentThread – no badge needed there.
  const showCommentButton = commentCount === undefined
    ? false
    : commentCount > 0 || isAuthenticated;

  return (
    <Group spacing="xs" sx={sx}>
      {orderMenuNode}
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
      {canPlay && onPlayFromNote && (
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
              onClick={() => onEdit?.(note)}
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
                  onDelete?.(evt, note)
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
              onClick={onToggleThread}
            >
              {commentCount && commentCount > 0
                ? String(commentCount)
                : null}
            </Button>
          </Box>
        </Tooltip>
      )}
    </Group>
  );
};

export default NoteCardActions;
