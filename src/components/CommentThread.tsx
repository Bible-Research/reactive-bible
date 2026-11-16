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
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { textOrKey } from '../i18n/errorText';
import { captureHandledError } from '../utils/errorReporter';

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

// Sequential per-file upload shared by create and update — one
// failure notifies and the rest still attempt.
const uploadImages = async (
  noteId: string,
  commentId: string,
  files: File[]
): Promise<CommentImage[]> => {
  const uploaded: CommentImage[] = [];
  for (const file of files) {
    try {
      const img = await uploadCommentImage(
        noteId,
        commentId,
        file
      );
      uploaded.push(img);
    } catch (err: unknown) {
      captureHandledError(err, 'Comment image upload', {
        noteId,
        commentId,
      });
      // apiClient throws catalog keys ('errors.forbidden',
      // 'auth.sessionExpiredMsg') — textOrKey translates
      // those and passes raw server text through.
      const msg =
        err instanceof Error
          ? textOrKey(err.message)
          : i18n.t('comments.failedToUpload');
      showNotification({
        color: 'red',
        title: i18n.t('comments.uploadFailed'),
        message: msg,
      });
    }
  }
  return uploaded;
};

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
  const { t } = useTranslation();
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
      .catch((err) => {
        if (dataVersion.current === version) {
          captureHandledError(err, 'Comments fetch', {
            noteId,
          });
          setError(i18n.t('comments.loadFailed'));
        }
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
  const imageRefreshReported = useRef(new Set<string>());
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
      ) {
        // Parity with useNoteImages: a comment whose refresh
        // budget is spent can never recover this session —
        // report once per (comment, image-set).
        if (count >= MAX_IMAGE_REFRESHES) {
          const key = `${commentId}:${sig}`;
          if (!imageRefreshReported.current.has(key)) {
            imageRefreshReported.current.add(key);
            captureHandledError(
              new Error(
                'Comment image refresh attempts exhausted'
              ),
              'Comment images refresh',
              { noteId, commentId }
            );
          }
        }
        return;
      }
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
      const uploadedImages = await uploadImages(
        noteId,
        newComment.id,
        files
      );
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
      captureHandledError(err, 'Comment create', { noteId });
      showNotification({
        color: 'red',
        title: t('common.error'),
        message: t('comments.postFailed'),
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
      const uploadedImages = await uploadImages(
        noteId,
        id,
        files
      );
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
      captureHandledError(err, 'Comment update', {
        noteId,
        commentId: id,
      });
      showNotification({
        color: 'red',
        title: t('common.error'),
        message: t('comments.updateFailed'),
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
    } catch (err) {
      captureHandledError(err, 'Comment image delete', {
        noteId,
        commentId,
      });
      showNotification({
        color: 'red',
        title: t('common.error'),
        message: t('comments.deleteImageFailed'),
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
    } catch (err) {
      captureHandledError(err, 'Comment delete', {
        noteId,
        commentId: id,
      });
      showNotification({
        color: 'red',
        title: t('common.error'),
        message: t('comments.deleteFailed'),
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
          aria-label={t('comments.retryLoading')}
        >
          {t('common.retry')}
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
            {t('comments.noComments')}
          </Text>
        ) : (
          <Text size="sm" color="dimmed">
            {t('comments.noComments')}{' '}
            <Link to="/login">{t('comments.logInToComment')}</Link>.
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
          placeholder={t('comments.addComment')}
          submitLabel={t('comments.post')}
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
