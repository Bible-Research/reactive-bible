import { useState } from 'react';
import { Box, Text, Stack } from '@mantine/core';
import { Comment } from '../api';
import CommentForm from './CommentForm';
import CommentActions from './CommentActions';

interface CommentNodeProps {
  comment: Comment;
  depth: number;
  currentUsername: string | null;
  isAuthenticated: boolean;
  onReply: (
    parentId: string,
    content: string
  ) => Promise<void>;
  onUpdate: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
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
}: CommentNodeProps) => {
  const [replyOpen, setReplyOpen] = useState(false);
  const [editing, setEditing] = useState(false);

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

  const handleReplySubmit = async (content: string) => {
    await onReply(comment.id, content);
    setReplyOpen(false);
  };

  const handleEditSubmit = async (content: string) => {
    await onUpdate(comment.id, content);
    setEditing(false);
  };

  const handleDeleteClick = () => {
    if (window.confirm('Delete this comment?')) {
      onDelete(comment.id);
    }
  };

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
            />
          ) : (
            <Text size="sm">{comment.content}</Text>
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

      {comment.replies.length > 0 && (
        <Stack spacing={8} mt={8}>
          {comment.replies.map((reply) => (
            <CommentNode
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              currentUsername={currentUsername}
              isAuthenticated={isAuthenticated}
              onReply={onReply}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
};

export default CommentNode;
