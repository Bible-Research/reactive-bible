import { useState } from 'react';
import {
  Box,
  Text,
  Stack,
  SimpleGrid,
  ActionIcon,
  Modal,
  UnstyledButton,
} from '@mantine/core';
import { openConfirmModal } from '@mantine/modals';
import { IconX, IconPhoto } from '@tabler/icons-react';
import { Comment } from '../types';
import CommentForm from './CommentForm';
import CommentActions from './CommentActions';
import ScripturePassage from './ScripturePassage';
import RichTextView from './RichTextView';
import { commentImageName } from '../utils/commentTree';
import {
  isSameScriptureRef,
  parseScriptureRef,
  ScriptureRef,
} from '../utils/scriptureRef';

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
  const [scripture, setScripture] =
    useState<ScriptureRef | null>(null);
  const [scriptureError, setScriptureError] =
    useState<string | null>(null);
  const [lightboxImageId, setLightboxImageId] =
    useState<string | null>(null);

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

  const handleScriptureClick = (hashtag: string): void => {
    const result = parseScriptureRef(hashtag);

    if (!result.ok) {
      setScriptureError(result.error);
      return;
    }

    setScriptureError(null);
    setScripture((current) =>
      isSameScriptureRef(current, result.ref) ? null : result.ref
    );
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

              {images.length > 0 && (
                <SimpleGrid
                  cols={3}
                  spacing={4}
                  breakpoints={[
                    { maxWidth: 'xs', cols: 2 },
                  ]}
                  mt={4}
                >
                  {images.map((img) => {
                    const src = img.signed_url;
                    const name = commentImageName(img);
                    return (
                      <Box
                        key={img.id}
                        style={{ position: 'relative' }}
                      >
                        {src ? (
                          <UnstyledButton
                            onClick={() =>
                              setLightboxImageId(img.id)
                            }
                            aria-label={`View image ${name}`}
                            style={{
                              display: 'block',
                              width: '100%',
                            }}
                          >
                            <img
                              src={src}
                              loading="lazy"
                              alt={name}
                              onError={() =>
                                onRequestRefresh?.(comment.id)
                              }
                              style={{
                                width: '100%',
                                maxHeight: 200,
                                objectFit: 'cover',
                                borderRadius: 4,
                                display: 'block',
                              }}
                            />
                          </UnstyledButton>
                        ) : (
                          <Box
                            role="img"
                            aria-label={`${name} (unavailable)`}
                            sx={(theme) => ({
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: 80,
                              width: '100%',
                              borderRadius: 4,
                              backgroundColor:
                                theme.colorScheme === 'dark'
                                  ? theme.colors.dark[5]
                                  : theme.colors.gray[2],
                              color:
                                theme.colorScheme === 'dark'
                                  ? theme.colors.dark[2]
                                  : theme.colors.gray[6],
                            })}
                          >
                            <IconPhoto size={20} />
                          </Box>
                        )}
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
                    );
                  })}
                </SimpleGrid>
              )}
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
        opened={lightboxImageId !== null}
        onClose={() => setLightboxImageId(null)}
        size="xl"
        title="Image"
        padding="xs"
      >
        {lightboxImage &&
          (lightboxImage.signed_url ? (
            <img
              src={lightboxImage.signed_url}
              alt="full size"
              onError={() => onRequestRefresh?.(comment.id)}
              style={{ width: '100%', height: 'auto' }}
            />
          ) : (
            <Text size="sm" color="dimmed" ta="center" py="xl">
              Image unavailable
            </Text>
          ))}
      </Modal>
    </Box>
  );
};

export default CommentNode;
