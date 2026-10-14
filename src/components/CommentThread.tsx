import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Stack,
  Text,
  Loader,
  Center,
  Divider,
  Button,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { Link } from 'react-router-dom';
import { Comment, CommentImage } from '../types';
import {
  fetchComments,
  createComment,
  updateComment,
  deleteComment,
  uploadCommentImage,
  deleteImage,
  fetchCommentImages,
} from '../api';
import {
  insertReply,
  updateNode,
  pruneDeleted,
} from '../utils/commentTree';
import { useAuthStore } from '../stores/authStore';
import CommentForm from './CommentForm';
import CommentNode from './CommentNode';

const normalize = (
  nodes: Comment[] | undefined
): Comment[] =>
  (nodes ?? []).map((c) => ({
    ...c,
    images: c.images ?? [],
    replies: normalize(c.replies),
  }));

// A comment's images are refetched at most this many times per
// mount — bounds the retry loop when the backend keeps minting
// signed URLs that still fail to load.
const MAX_IMAGE_REFRESHES = 3;

interface CommentThreadProps {
  noteId: string;
  onCountChange?: (delta: number) => void;
}

const CommentThread = ({
  noteId,
  onCountChange,
}: CommentThreadProps) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadVersion = useRef(0);

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  const currentUsername =
    useAuthStore((state) => state.user)?.username ?? null;

  const load = useCallback(() => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError(null);
    fetchComments(noteId)
      .then((data) => {
        if (loadVersion.current === version)
          setComments(normalize(data));
      })
      .catch(() => {
        if (loadVersion.current === version)
          setError('Failed to load comments.');
      })
      .finally(() => {
        if (loadVersion.current === version)
          setLoading(false);
      });
  }, [noteId]);

  const silentLoad = useCallback(() => {
    const version = ++loadVersion.current;
    fetchComments(noteId)
      .then((data) => {
        if (loadVersion.current === version)
          setComments(normalize(data));
      })
      .catch(() => {
        // background refresh — don't surface errors
      });
  }, [noteId]);

  const pendingImageRefresh = useRef(new Set<string>());
  const imageRefreshCount = useRef(new Map<string, number>());

  // Targeted refresh of one comment's images when a signed URL
  // fails to load. Concurrent errors on the same comment collapse
  // into a single fetch; retries are capped per comment.
  const handleImageError = useCallback(
    (commentId: string) => {
      const attempts =
        imageRefreshCount.current.get(commentId) ?? 0;
      if (
        attempts >= MAX_IMAGE_REFRESHES ||
        pendingImageRefresh.current.has(commentId)
      )
        return;
      pendingImageRefresh.current.add(commentId);
      imageRefreshCount.current.set(commentId, attempts + 1);
      fetchCommentImages(noteId, commentId)
        .then((images) => {
          setComments((prev) =>
            updateNode(prev, commentId, (n) => ({
              ...n,
              images,
            }))
          );
        })
        .catch(() => {
          // background refresh — don't surface errors
        })
        .finally(() => {
          pendingImageRefresh.current.delete(commentId);
        });
    },
    [noteId]
  );

  useEffect(() => {
    load();
    return () => {
      loadVersion.current++;
    };
  }, [load]);

  useEffect(() => {
    const POLL_MS = 30_000;
    const poll = () => {
      if (document.visibilityState === 'visible') silentLoad();
    };
    const id = setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [silentLoad]);

  const handleCreate = async (
    parentId: string | null,
    content: string,
    files: File[] = []
  ) => {
    setSubmitting(true);
    try {
      const newComment = await createComment(
        noteId,
        content,
        parentId
      );
      const uploadedImages: CommentImage[] = [];
      for (const file of files) {
        try {
          const img = await uploadCommentImage(
            noteId,
            newComment.id,
            file
          );
          uploadedImages.push(img);
        } catch (err: unknown) {
          const msg =
            err instanceof Error
              ? err.message
              : 'Failed to upload image.';
          showNotification({
            color: 'red',
            title: 'Upload failed',
            message: msg,
          });
        }
      }
      const normalizedNew = {
        ...normalize([newComment])[0],
        images: uploadedImages,
      };
      setComments((prev) =>
        insertReply(prev, parentId, normalizedNew)
      );
      onCountChange?.(1);
      silentLoad();
    } catch (err) {
      showNotification({
        color: 'red',
        title: 'Error',
        message: 'Failed to post comment.',
      });
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (
    id: string,
    content: string,
    files: File[] = []
  ) => {
    try {
      const updated = await updateComment(noteId, id, content);
      const uploadedImages: CommentImage[] = [];
      for (const file of files) {
        try {
          const img = await uploadCommentImage(
            noteId,
            id,
            file
          );
          uploadedImages.push(img);
        } catch (err: unknown) {
          const msg =
            err instanceof Error
              ? err.message
              : 'Failed to upload image.';
          showNotification({
            color: 'red',
            title: 'Upload failed',
            message: msg,
          });
        }
      }
      setComments((prev) =>
        updateNode(prev, id, (n) => ({
          ...normalize([updated])[0],
          replies: n.replies,
          // Keep the node's current images as the base — the
          // PATCH response may omit or stale the list.
          images: [...(n.images ?? []), ...uploadedImages],
        }))
      );
      silentLoad();
    } catch (err) {
      showNotification({
        color: 'red',
        title: 'Error',
        message: 'Failed to update comment.',
      });
      throw err;
    }
  };

  const handleDeleteImage = async (
    commentId: string,
    imageId: string
  ) => {
    try {
      await deleteImage(imageId);
      setComments((prev) =>
        updateNode(prev, commentId, (n) => ({
          ...n,
          images: (n.images ?? []).filter(
            (i) => i.id !== imageId
          ),
        }))
      );
    } catch {
      showNotification({
        color: 'red',
        title: 'Error',
        message: 'Failed to delete image.',
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteComment(noteId, id);
      setComments((prev) =>
        updateNode(prev, id, (n) => ({
          ...n,
          is_deleted: true,
          content: '[deleted]',
        }))
      );
      onCountChange?.(-1);
      silentLoad();
    } catch {
      showNotification({
        color: 'red',
        title: 'Error',
        message: 'Failed to delete comment.',
      });
    }
  };

  const visible = pruneDeleted(comments);

  if (loading) {
    return (
      <Center py={16}>
        <Loader size="sm" data-testid="thread-loader" />
      </Center>
    );
  }

  if (error) {
    return (
      <Stack spacing={4} py={8}>
        <Text color="red" size="sm">
          {error}
        </Text>
        <Button
          size="xs"
          variant="subtle"
          onClick={load}
          aria-label="Retry loading comments"
        >
          Retry
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={12} pt={8}>
      <Divider />

      {visible.length === 0 ? (
        isAuthenticated ? (
          <Text size="sm" color="dimmed">
            No comments yet.
          </Text>
        ) : (
          <Text size="sm" color="dimmed">
            No comments yet.{' '}
            <Link to="/login">Log in to comment</Link>.
          </Text>
        )
      ) : (
        <Stack spacing={12}>
          {visible.map((c) => (
            <CommentNode
              key={c.id}
              comment={c}
              depth={0}
              currentUsername={currentUsername}
              isAuthenticated={isAuthenticated}
              onReply={(parentId, content, files) =>
                handleCreate(parentId, content, files)
              }
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onDeleteImage={handleDeleteImage}
              onRequestRefresh={handleImageError}
            />
          ))}
        </Stack>
      )}

      {isAuthenticated && (
        <CommentForm
          placeholder="Add a comment…"
          submitLabel="Post"
          submitting={submitting}
          onSubmit={(content, files) =>
            handleCreate(null, content, files)
          }
        />
      )}
    </Stack>
  );
};

export default CommentThread;
