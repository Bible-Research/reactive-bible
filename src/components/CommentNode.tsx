import { useState } from 'react';
import {
  Box,
  Text,
  Stack,
  SimpleGrid,
  ActionIcon,
  Modal,
} from '@mantine/core';
import { openConfirmModal } from '@mantine/modals';
import { IconX } from '@tabler/icons-react';
import { Comment, CommentImage } from '../types';
import CommentForm from './CommentForm';
import CommentActions from './CommentActions';

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
  onRequestRefresh?: () => void;
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
  const [lightboxImage, setLightboxImage] =
    useState<CommentImage | null>(null);

  const isAuthor =
    !!currentUsername &&
    comment.author.username === currentUsername;
  const indent = Math.min(depth, MAX_DEPTH) * 16;

  const formatTime = (ts: string): string => {
    try {
      const diff = Date.now() - new Date(ts).getTime();
      const seconds = Math.floor(diff / 1000);
      if (seconds < 60) return 'just now';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) {
        return `${minutes}m ago`;
      }
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 30) return `${days}d ago`;
      return new Date(ts).toLocaleDateString();
    } catch {
      return ts;
    }
  };

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
            />
          ) : (
            <>
              <Text size="sm">{comment.content}</Text>

              {images.length > 0 && (
                <SimpleGrid
                  cols={3}
                  spacing={4}
                  breakpoints={[
                    { maxWidth: 'xs', cols: 2 },
                  ]}
                  mt={4}
                >
                  {images.map((img) => (
                    <Box
                      key={img.id}
                      style={{
                        position: 'relative',
                        cursor: 'pointer',
                      }}
                    >
                      <img
                        src={img.signed_url}
                        loading="lazy"
                        alt="comment attachment"
                        onError={onRequestRefresh}
                        onClick={() => setLightboxImage(img)}
                        style={{
                          width: '100%',
                          maxHeight: 200,
                          objectFit: 'cover',
                          borderRadius: 4,
                          display: 'block',
                        }}
                      />
                      {isAuthor && onDeleteImage && (
                        <ActionIcon
                          size="xs"
                          color="red"
                          variant="filled"
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteImage(comment.id, img.id);
                          }}
                          aria-label={`Delete image ${img.id}`}
                        >
                          <IconX size={10} />
                        </ActionIcon>
                      )}
                    </Box>
                  ))}
                </SimpleGrid>
              )}
            </>
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
          {comment.replies!.map((reply) => (
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

      <Modal
        opened={lightboxImage !== null}
        onClose={() => setLightboxImage(null)}
        size="xl"
        title="Image"
        padding="xs"
      >
        {lightboxImage && (
          <img
            src={lightboxImage.signed_url}
            alt="full size"
            style={{ width: '100%', height: 'auto' }}
          />
        )}
      </Modal>
    </Box>
  );
};

export default CommentNode;
