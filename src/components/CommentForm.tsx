import { useState } from 'react';
import { Group, Textarea, Button } from '@mantine/core';

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

  const handleSubmit = async () => {
    if (!value.trim()) {
      setError('Comment cannot be empty.');
      return;
    }
    setError(null);
    await onSubmit(value.trim());
    setValue('');
  };

  return (
    <div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        minRows={2}
        aria-label={placeholder}
        error={error}
        disabled={submitting}
        mb={6}
      />
      <Group spacing="xs">
        <Button
          size="xs"
          onClick={handleSubmit}
          disabled={submitting}
          loading={submitting}
        >
          {submitLabel}
        </Button>
        {onCancel && (
          <Button
            size="xs"
            variant="subtle"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
        )}
      </Group>
    </div>
  );
};

export default CommentForm;
