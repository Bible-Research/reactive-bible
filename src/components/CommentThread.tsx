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
  findNode,
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
// image set — bounds the retry loop when the backend keeps
// minting signed URLs that still fail to load.
const MAX_IMAGE_REFRESHES = 3;

// A failed refresh fetch hands its attempt back so a flaky
// network can't permanently burn the retry budget.
const refundAttempt = (
  attempts: Map<string, { sig: string; count: number }>,
  commentId: string,
  sig: string
): void => {
  const cur = attempts.get(commentId);
  if (!cur || cur.sig !== sig) return;
  if (cur.count <= 1) {
    attempts.delete(commentId);
  } else {
    attempts.set(commentId, { sig, count: cur.count - 1 });
  }
};

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

  // Two independent generations: the latest fetch wins for data
  // (a silentLoad starting after a load must supersede it), but
  // only load() owns the spinner — an interleaved poll can no
  // longer stale out load's setLoading(false).
  const dataVersion = useRef(0);
  const loadingSeq = useRef(0);

  // Mutations not yet confirmed by a fetch: the server can lag
  // behind a POST/DELETE, so a silentLoad response may omit the
  // change — merge it back in until the server returns it.
  const pendingInserts = useRef(
    new Map<string, { parentId: string | null; comment: Comment }>()
  );
  const pendingDeletes = useRef(new Set<string>());

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  const currentUser = useAuthStore((state) => state.user);

  const mergePending = useCallback(
    (list: Comment[]): Comment[] => {
      let merged = list;
      pendingInserts.current.forEach((entry, id) => {
        if (findNode(merged, id)) {
          pendingInserts.current.delete(id);
          return;
        }
        merged = insertReply(merged, entry.parentId, entry.comment);
      });
      pendingDeletes.current.forEach((id) => {
        const node = findNode(merged, id);
        if (!node || node.is_deleted) {
          pendingDeletes.current.delete(id);
          return;
        }
        merged = updateNode(merged, id, (n) => ({
          ...n,
          is_deleted: true,
          content: '[deleted]',
        }));
      });
      return merged;
    },
    []
  );

  const applyFetched = useCallback(
    (data: Comment[] | undefined) =>
      setComments(mergePending(normalize(data))),
    [mergePending]
  );

  const load = useCallback(() => {
    const seq = ++loadingSeq.current;
    const version = ++dataVersion.current;
    setLoading(true);
    setError(null);
    fetchComments(noteId)
      .then((data) => {
        if (dataVersion.current === version) applyFetched(data);
      })
      .catch(() => {
        if (dataVersion.current === version)
          setError('Failed to load comments.');
      })
      .finally(() => {
        if (loadingSeq.current === seq) setLoading(false);
      });
  }, [noteId, applyFetched]);

  const silentLoad = useCallback(() => {
    const version = ++dataVersion.current;
    fetchComments(noteId)
      .then((data) => {
        if (dataVersion.current === version) applyFetched(data);
      })
      .catch(() => {
        // background refresh — don't surface errors
      });
  }, [noteId, applyFetched]);

  const pendingImageRefresh = useRef(new Set<string>());
  // Attempts are keyed to the comment's current image set: a
  // refresh that mints new signed URLs resets the budget, and a
  // failed fetch hands its attempt back so a flaky network can't
  // permanently burn it.
  const imageRefreshAttempts = useRef(
    new Map<string, { sig: string; count: number }>()
  );
  const commentsRef = useRef<Comment[]>(comments);
  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  // Targeted refresh of one comment's images when a signed URL
  // fails to load. Concurrent errors on the same comment collapse
  // into a single fetch.
  const handleImageError = useCallback(
    (commentId: string) => {
      const node = findNode(commentsRef.current, commentId);
      const sig = (node?.images ?? [])
        .map((i) => i.signed_url ?? '')
        .join('|');
      const entry = imageRefreshAttempts.current.get(commentId);
      const count =
        entry && entry.sig === sig ? entry.count : 0;
      if (
        count >= MAX_IMAGE_REFRESHES ||
        pendingImageRefresh.current.has(commentId)
      )
        return;
      pendingImageRefresh.current.add(commentId);
      imageRefreshAttempts.current.set(commentId, {
        sig,
        count: count + 1,
      });
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
          refundAttempt(
            imageRefreshAttempts.current,
            commentId,
            sig
          );
        })
        .finally(() => {
          pendingImageRefresh.current.delete(commentId);
        });
    },
    [noteId]
  );

  useEffect(() => {
    // Alias the ref objects so the cleanup bumps the shared
    // counters — a superseded in-flight load must drop its
    // result. Copying `dataVersion.current` (a snapshot)
    // would defeat the guard.
    const dataVer = dataVersion;
    const loadSeq = loadingSeq;
    const inserts = pendingInserts.current;
    const deletes = pendingDeletes.current;
    load();
    // The ref objects (not their .current snapshots) are
    // aliased above so the cleanup bumps the shared counters —
    // a superseded in-flight load must drop its result.
    return () => {
      dataVer.current++;
      loadSeq.current++;
      inserts.clear();
      deletes.clear();
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
      pendingInserts.current.set(newComment.id, {
        parentId,
        comment: normalizedNew,
      });
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
      pendingDeletes.current.add(id);
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
              currentUser={currentUser}
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
