import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";
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
  IconBookmark,
  IconCopy,
  IconUserPlus,
} from "@tabler/icons-react";
import { Note } from "../types";
import { useAuthStore } from "../stores/authStore";
import { toPlainText } from "../utils/tiptapContent";
import { shareOrCopyLink } from "../utils/share";
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from "react-router-dom";
import { showNotification } from "@mantine/notifications";
import { bookmarkNote } from "../api";
import { textOrKey } from "../i18n/errorText";
import { captureHandledError } from "../utils/errorReporter";
import ShareModal from "./ShareModal";
import CopyNoteModal from "./CopyNoteModal";

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
   * Note pages cached before `is_owner` shipped lack the
   * field — without this fallback, owners could not
   * edit/delete notes on their own tags.
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
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);

  const firstVerse = note.verses?.[0]?.verse || 1;
  const book = note.verses?.[0]?.book || "";
  const chapter = note.verses?.[0]?.chapter || 1;

  // Ownership rule: authenticated AND (the viewed tag is one of
  // the user's own OR the note itself reports is_owner). The
  // tag-list half covers note pages cached before `is_owner`
  // shipped; the strict `is_owner === true` half keeps foreign
  // tags read-only — fail closed rather than offering
  // edit/delete that will 403.
  const ownsNote = isTagOwner === true || note.is_owner === true;
  const canEdit = isAuthenticated && ownsNote && !!onEdit;
  const canDelete = isAuthenticated && ownsNote && !!onDelete;
  const canShare = note.public;
  // Targeted sharing is owner-only; bookmark + copy apply to
  // any note the caller can read (public link, published,
  // shared-with-me, or their own).
  const canShareTargeted = isAuthenticated && ownsNote;
  // Bookmark/copy target OTHER users' accessible notes —
  // the backend 400s own-note bookmarks and copies, so the
  // affordances hide when ownership is known.
  const canBookmark = isAuthenticated && !ownsNote;
  const canCopy = isAuthenticated && !ownsNote;
  // Anonymous readers get a login CTA in place of the
  // save/copy controls, carrying the current URL so login
  // lands them back on this note.
  const location = useLocation();
  const navigate = useNavigate();

  const handleBookmark = async () => {
    try {
      await bookmarkNote(note.id);
      // POST is idempotent — repeat clicks save nothing new,
      // so the same toast is honest either way.
      showNotification({
        title: t('common.success'),
        message: t('bookmarks.saved'),
        color: 'green',
      });
    } catch (error) {
      captureHandledError(error, 'Note bookmark', {
        noteId: note.id,
      });
      showNotification({
        title: t('common.error'),
        message:
          error instanceof Error
            ? textOrKey(error.message)
            : t('bookmarks.saveFailed'),
        color: 'red',
      });
    }
  };
  // Verse-less notes never enter the audio playlist
  // (buildNotePlaylistItems filters them out), so clicking
  // "play from here" would silently no-op — disable instead.
  const canPlay = (note.verses?.length ?? 0) > 0;

  const handleShare = async () => {
    const title = note.tag?.name
      ? t('notes.noteTitle', { name: note.tag.name })
      : t('notes.sharedNote');
    const text = note.note_text
      ? toPlainText(note.note_text).slice(0, 140)
      : t('notes.sharedBibleNote');

    await shareOrCopyLink(
      {
        title,
        text,
        url: `${window.location.origin}/notes/${note.id}`,
      },
      {
        copySuccess: {
          title: t('notes.linkCopied'),
          message: t('notes.linkCopiedMsg'),
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
      <Tooltip label={t('notes.viewInBible')} position="top">
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
        <Tooltip label={t('notes.share')} position="top">
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
        <Tooltip label={t('notes.playFromHere')} position="top">
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
      {!isAuthenticated && (
        <Tooltip label={t('bookmarks.loginToSave')} position="top">
          <Box component="span" sx={{ display: 'inline-block' }}>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() =>
                void navigate('/login', {
                  state: { from: location },
                })
              }
              aria-label="login-to-save"
            >
              <IconBookmark size={16} />
            </ActionIcon>
          </Box>
        </Tooltip>
      )}
      {canBookmark && (
        <Tooltip label={t('bookmarks.save')} position="top">
          <Box component="span" sx={{ display: 'inline-block' }}>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => void handleBookmark()}
              aria-label="bookmark-note"
            >
              <IconBookmark size={16} />
            </ActionIcon>
          </Box>
        </Tooltip>
      )}
      {canCopy && (
        <Tooltip label={t('copyNote.action')} position="top">
          <Box component="span" sx={{ display: 'inline-block' }}>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => setCopyModalOpen(true)}
              aria-label="copy-note"
            >
              <IconCopy size={16} />
            </ActionIcon>
          </Box>
        </Tooltip>
      )}
      {canShareTargeted && (
        <Tooltip label={t('sharing.shareWith')} position="top">
          <Box component="span" sx={{ display: 'inline-block' }}>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => setShareModalOpen(true)}
              aria-label="share-note-targeted"
            >
              <IconUserPlus size={16} />
            </ActionIcon>
          </Box>
        </Tooltip>
      )}
      {canEdit && (
        <Tooltip label={t('notes.edit')} position="top">
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
        <Tooltip label={t('notes.remove')} position="top">
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
              ? t('notes.addComment')
              : t('notes.commentCount', { count: commentCount })
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
                  ? t('notes.addComment')
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
      {canShareTargeted && (
        <ShareModal
          opened={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          kind="note"
          resourceId={note.id}
        />
      )}
      {canCopy && (
        <CopyNoteModal
          opened={copyModalOpen}
          onClose={() => setCopyModalOpen(false)}
          note={note}
        />
      )}
    </Group>
  );
};

export default NoteCardActions;
