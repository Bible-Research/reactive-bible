import { useState } from 'react';
import { Group, Text, Button } from '@mantine/core';
import RichTextEditor from './RichTextEditor';
import { toPlainText } from '../utils/tiptapContent';

interface CommentFormProps {
  initialValue?: string;
  submitLabel?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit: (content: string) => Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
}

const CommentForm = ({
  initialValue = '',
  submitLabel = 'Post',
  placeholder = 'Write a comment…',
  autoFocus = false,
  onSubmit,
  onCancel,
  submitting = false,
}: CommentFormProps) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [localSubmitting, setLocalSubmitting] = useState(false);

  const isDisabled = submitting || localSubmitting;

  const handleSubmit = async () => {
    // Doc-JSON is never '' even when the editor is blank.
    if (!toPlainText(value).trim()) {
      setError('Comment cannot be empty.');
      return;
    }
    setError(null);
    setLocalSubmitting(true);
    try {
      await onSubmit(value.trim());
      setValue('');
    } finally {
      setLocalSubmitting(false);
    }
  };

  return (
    <div>
      <RichTextEditor
        variant="comment"
        value={value}
        onChange={setValue}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={isDisabled}
      />
      {error && (
        <Text color="red" size="xs" mt={4}>
          {error}
        </Text>
      )}
      <Group spacing="xs" mt={6}>
        <Button
          size="xs"
          onClick={handleSubmit}
          disabled={isDisabled}
          loading={isDisabled}
        >
          {submitLabel}
        </Button>
        {onCancel && (
          <Button
            size="xs"
            variant="subtle"
            onClick={onCancel}
            disabled={isDisabled}
          >
            Cancel
          </Button>
        )}
      </Group>
    </div>
  );
};

export default CommentForm;
