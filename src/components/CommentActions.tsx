import { Group, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
          {t('comments.reply')}
        </Button>
      )}
      {isAuthor && (
        <Button
          size="xs"
          variant="subtle"
          compact
          onClick={onEditClick}
        >
          {t('notes.edit')}
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
          {t('common.delete')}
        </Button>
      )}
    </Group>
  );
};

export default CommentActions;
