import { useState } from 'react';
import {
  Group,
  Button,
  FileButton,
  Box,
  Text,
} from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import RichTextEditor from './RichTextEditor';
import {
  RemoveImageButton,
  UnavailableThumb,
} from './CommentImageGrid';
import {
  useStagedImages,
  ALLOWED_IMAGE_TYPES,
  IMAGE_THUMB_STYLE,
} from '../hooks/useStagedImages';
import { toPlainText } from '../utils/tiptapContent';
import { commentImageName } from '../utils/commentTree';
import { CommentImage } from '../types';

const MAX_IMAGES = 5;

interface CommentFormProps {
  initialValue?: string;
  submitLabel?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit: (content: string, files: File[]) => Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
  existingImages?: CommentImage[];
  onDeleteImage?: (imageId: string) => Promise<void>;
  onImageError?: (src: string) => void;
}

const CommentForm = ({
  initialValue = '',
  submitLabel = 'Post',
  placeholder = 'Write a comment…',
  autoFocus = false,
  onSubmit,
  onCancel,
  submitting = false,
  existingImages = [],
  onDeleteImage,
  onImageError,
}: CommentFormProps) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const {
    staged,
    fileError,
    addFiles,
    removeStaged,
    markStagedFailed,
    clearStaged,
  } = useStagedImages({
    maxImages: MAX_IMAGES,
    existingCount: existingImages.length,
    parentNoun: 'comment',
  });

  const isDisabled = submitting || localSubmitting;
  const totalAttached = existingImages.length + staged.length;

  const handleSubmit = async () => {
    // Doc-JSON is never '' even when the editor is blank.
    if (!toPlainText(value).trim() && staged.length === 0) {
      setError('Add text or attach an image.');
      return;
    }
    setError(null);
    setLocalSubmitting(true);
    try {
      await onSubmit(
        value.trim(),
        staged.map((s) => s.file)
      );
      setValue('');
      clearStaged();
    } catch {
      // caller already surfaced the error via notification;
      // keep form state so the user can retry
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

      {(existingImages.length > 0 || staged.length > 0) && (
        <Group spacing={6} mb={6} align="flex-start">
          {existingImages.map((img) => {
            const src = img.signed_url;
            const name = commentImageName(img);
            return (
              <Box
                key={img.id}
                style={{
                  position: 'relative',
                  display: 'inline-block',
                }}
              >
                {src ? (
                  <img
                    src={src}
                    alt={name}
                    onError={() => onImageError?.(src)}
                    style={IMAGE_THUMB_STYLE}
                  />
                ) : (
                  <UnavailableThumb
                    label={`${name} (unavailable)`}
                  />
                )}
                {onDeleteImage && (
                  <RemoveImageButton
                    label={`Remove image ${name}`}
                    offset={2}
                    onClick={() => onDeleteImage(img.id)}
                  />
                )}
              </Box>
            );
          })}
          {staged.map((s) => (
            <Box
              key={s.id}
              style={{
                position: 'relative',
                display: 'inline-block',
              }}
            >
              {s.failed ? (
                <UnavailableThumb
                  label={`${s.file.name} (unavailable)`}
                />
              ) : (
                <img
                  src={s.url}
                  alt={s.file.name}
                  style={IMAGE_THUMB_STYLE}
                  onError={() => markStagedFailed(s.id)}
                />
              )}
              <RemoveImageButton
                label={`Remove staged image ${s.file.name}`}
                offset={2}
                onClick={() => removeStaged(s.id)}
              />
            </Box>
          ))}
        </Group>
      )}

      {fileError && (
        <Text size="xs" color="red" mb={4}>
          {fileError}
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
        <FileButton
          onChange={addFiles}
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          multiple
          disabled={isDisabled || totalAttached >= MAX_IMAGES}
          // Mantine v6 never clears the input's value, so
          // deleting a thumb and re-picking the SAME file
          // dispatches no `change` event — attach looks dead.
          // Clearing on click resets it before the picker
          // opens (safe with `multiple`).
          inputProps={{
            onClick: (event) => {
              event.currentTarget.value = '';
            },
          }}
        >
          {(props) => (
            <Button
              {...props}
              size="xs"
              variant="subtle"
              leftIcon={<IconPhoto size={14} />}
              disabled={isDisabled || totalAttached >= MAX_IMAGES}
              aria-label="Attach images"
            >
              {totalAttached > 0
                ? `${totalAttached}/${MAX_IMAGES}`
                : 'Images'}
            </Button>
          )}
        </FileButton>
      </Group>
    </div>
  );
};

export default CommentForm;
