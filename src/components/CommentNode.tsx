import { useState } from 'react';
import { Box, Text, Stack } from '@mantine/core';
import { openConfirmModal } from '@mantine/modals';
import { Comment } from '../types';
import CommentForm from './CommentForm';
import CommentActions from './CommentActions';
import CommentImageGrid from './CommentImageGrid';
import Lightbox from './Lightbox';
import ScripturePassage from './ScripturePassage';
import RichTextView from './RichTextView';
import formatTime from '../utils/formatTime';
import useScripturePreview from '../hooks/useScripturePreview';

interface CommentNodeProps {
  comment: Comment;
  depth: number;
  currentUsername: string | null;
  isAuthenticated: boolean;
  onReply: (
    parentId: string,
    content: string,
    files: File[]
  ) => Promise<void>;
  onUpdate: (
    id: string,
    content: string,
    files: File[]
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDeleteImage?: (
    commentId: string,
    imageId: string
  ) => Promise<void>;
  onRequestRefresh?: (commentId: string) => void;
}

const MAX_DEPTH = 6;

const CommentNode = ({
  comment,
  depth,
  currentUsername,
  isAuthenticated,
  onReply,
  onUpdate,
  onDelete,
  onDeleteImage,
  onRequestRefresh,
}: CommentNodeProps) => {
  const [replyOpen, setReplyOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const {
    preview: scripture,
    error: scriptureError,
    togglePreview: handleScriptureClick,
  } = useScripturePreview();
  const [lightboxImageId, setLightboxImageId] =
    useState<string | null>(null);

  const isAuthor =
    !!currentUsername &&
    comment.author.username === currentUsername;
  const indent = Math.min(depth, MAX_DEPTH) * 16;

  const handleReplySubmit = async (
    content: string,
    files: File[]
  ) => {
    await onReply(comment.id, content, files);
    setReplyOpen(false);
  };

  const handleEditSubmit = async (
    content: string,
    files: File[]
  ) => {
    await onUpdate(comment.id, content, files);
    setEditing(false);
  };

  const handleDeleteClick = () => {
    openConfirmModal({
      title: 'Delete comment',
      children: 'Are you sure you want to delete this comment?',
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => onDelete(comment.id),
    });
  };

  const images = comment.images ?? [];
  const lightboxImage =
    images.find((img) => img.id === lightboxImageId) ?? null;

  return (
    <Box
      pl={indent}
      sx={(theme) => ({
        borderLeft:
          depth > 0
            ? `2px solid ${
                theme.colorScheme === 'dark'
                  ? theme.colors.dark[4]
                  : theme.colors.gray[3]
              }`
            : 'none',
      })}
    >
      {comment.is_deleted ? (
        <Text size="sm" color="dimmed" fs="italic" py={4}>
          [deleted]
        </Text>
      ) : (
        <Stack spacing={4}>
          <Text size="xs" color="dimmed">
            <strong>{comment.author.username}</strong>{' '}
            &middot; {formatTime(comment.timestamp)}
          </Text>

          {editing ? (
            <CommentForm
              initialValue={comment.content}
              submitLabel="Save"
              autoFocus
              onSubmit={handleEditSubmit}
              onCancel={() => setEditing(false)}
              existingImages={images}
              onDeleteImage={
                onDeleteImage
                  ? (imageId) =>
                      onDeleteImage(comment.id, imageId)
                  : undefined
              }
              onImageError={
                onRequestRefresh
                  ? () => onRequestRefresh(comment.id)
                  : undefined
              }
            />
          ) : (
            <>
              <RichTextView
                content={comment.content}
                onScriptureRef={handleScriptureClick}
                size="sm"
              />

              <CommentImageGrid
                images={images}
                commentId={comment.id}
                canDelete={isAuthor}
                onDeleteImage={onDeleteImage}
                onOpenImage={setLightboxImageId}
                onImageError={onRequestRefresh}
              />
            </>
          )}

          {scriptureError && (
            <Text size="sm" color="red">
              {scriptureError}
            </Text>
          )}
          {scripture && (
            <ScripturePassage reference={scripture} />
          )}

          {!editing && (
            <CommentActions
              isAuthor={isAuthor}
              isAuthenticated={isAuthenticated}
              isDeleted={comment.is_deleted}
              onReplyClick={() => setReplyOpen((o) => !o)}
              onEditClick={() => setEditing(true)}
              onDeleteClick={handleDeleteClick}
            />
          )}

          {replyOpen && (
            <Box mt={6}>
              <CommentForm
                submitLabel="Reply"
                placeholder="Write a reply…"
                autoFocus
                onSubmit={handleReplySubmit}
                onCancel={() => setReplyOpen(false)}
              />
            </Box>
          )}
        </Stack>
      )}

      {(comment.replies?.length ?? 0) > 0 && (
        <Stack spacing={8} mt={8}>
          {comment.replies?.map((reply) => (
            <CommentNode
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              currentUsername={currentUsername}
              isAuthenticated={isAuthenticated}
              onReply={onReply}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onDeleteImage={onDeleteImage}
              onRequestRefresh={onRequestRefresh}
            />
          ))}
        </Stack>
      )}

      <Lightbox
        image={lightboxImage}
        onClose={() => setLightboxImageId(null)}
        onImageError={() => onRequestRefresh?.(comment.id)}
      />
    </Box>
  );
};

export default CommentNode;
