import { Group, Button } from '@mantine/core';

interface CommentActionsProps {
  isAuthor: boolean;
  isAuthenticated: boolean;
  isDeleted: boolean;
  onReplyClick: () => void;
  onEditClick: () => void;
  onDeleteClick: () => void;
}

const CommentActions = ({
  isAuthor,
  isAuthenticated,
  isDeleted,
  onReplyClick,
  onEditClick,
  onDeleteClick,
}: CommentActionsProps) => {
  if (isDeleted) return null;

  return (
    <Group spacing={4} mt={4}>
      {isAuthenticated && (
        <Button
          size="xs"
          variant="subtle"
          compact
          onClick={onReplyClick}
        >
          Reply
        </Button>
      )}
      {isAuthor && (
        <Button
          size="xs"
          variant="subtle"
          compact
          onClick={onEditClick}
        >
          Edit
        </Button>
      )}
      {isAuthor && (
        <Button
          size="xs"
          variant="subtle"
          compact
          color="red"
          onClick={onDeleteClick}
        >
          Delete
        </Button>
      )}
    </Group>
  );
};

export default CommentActions;
