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
import { Comment } from '../types';
import {
  fetchComments,
  createComment,
  updateComment,
  deleteComment,
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
    content: string
  ) => {
    setSubmitting(true);
    try {
      const newComment = await createComment(
        noteId,
        content,
        parentId
      );
      setComments((prev) =>
        insertReply(
          prev,
          parentId,
          normalize([newComment])[0]
        )
      );
      onCountChange?.(1);
      silentLoad();
    } catch {
      showNotification({
        color: 'red',
        title: 'Error',
        message: 'Failed to post comment.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string, content: string) => {
    try {
      const updated = await updateComment(noteId, id, content);
      setComments((prev) =>
        updateNode(prev, id, () => normalize([updated])[0])
      );
      silentLoad();
    } catch {
      showNotification({
        color: 'red',
        title: 'Error',
        message: 'Failed to update comment.',
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
              onReply={(parentId, content) =>
                handleCreate(parentId, content)
              }
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </Stack>
      )}

      {isAuthenticated && (
        <CommentForm
          placeholder="Add a comment…"
          submitLabel="Post"
          submitting={submitting}
          onSubmit={(content) => handleCreate(null, content)}
        />
      )}
    </Stack>
  );
};

export default CommentThread;
