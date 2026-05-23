import { useState, useEffect, useRef } from 'react';
import {
  Group,
  Textarea,
  Button,
  FileButton,
  Box,
  Text,
  ActionIcon,
} from '@mantine/core';
import { IconX, IconPhoto } from '@tabler/icons-react';
import { CommentImage } from '../types';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];
const MAX_BYTES = 10 * 1024 * 1024;
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
}: CommentFormProps) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [staged, setStaged] = useState<File[]>([]);
  const [stagedUrls, setStagedUrls] = useState<string[]>([]);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const isDisabled = submitting || localSubmitting;
  const totalAttached = existingImages.length + staged.length;

  const handleFileSelect = (files: File[]) => {
    setFileError(null);
    const validFiles: File[] = [];
    const newUrls: string[] = [];
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setFileError(`Unsupported file type: ${file.name}`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setFileError(`File too large (max 10 MiB): ${file.name}`);
        continue;
      }
      if (
        existingImages.length + staged.length + validFiles.length >=
        MAX_IMAGES
      ) {
        setFileError('Maximum 5 images per comment.');
        break;
      }
      const url = URL.createObjectURL(file);
      urlsRef.current.push(url);
      validFiles.push(file);
      newUrls.push(url);
    }
    if (validFiles.length > 0) {
      setStaged((prev) => [...prev, ...validFiles]);
      setStagedUrls((prev) => [...prev, ...newUrls]);
    }
  };

  const removeStaged = (idx: number) => {
    URL.revokeObjectURL(stagedUrls[idx]);
    urlsRef.current = urlsRef.current.filter(
      (u) => u !== stagedUrls[idx]
    );
    setStaged((prev) => prev.filter((_, i) => i !== idx));
    setStagedUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!value.trim()) {
      setError('Comment cannot be empty.');
      return;
    }
    setError(null);
    setLocalSubmitting(true);
    try {
      await onSubmit(value.trim(), staged);
      setValue('');
      staged.forEach((_, i) => URL.revokeObjectURL(stagedUrls[i]));
      urlsRef.current = [];
      setStaged([]);
      setStagedUrls([]);
    } finally {
      setLocalSubmitting(false);
    }
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
        disabled={isDisabled}
        mb={6}
      />

      {(existingImages.length > 0 || staged.length > 0) && (
        <Group spacing={6} mb={6} align="flex-start">
          {existingImages.map((img) => (
            <Box
              key={img.id}
              style={{ position: 'relative', display: 'inline-block' }}
            >
              <img
                src={img.signed_url}
                alt="attached"
                style={{
                  height: 56,
                  width: 56,
                  objectFit: 'cover',
                  borderRadius: 4,
                  display: 'block',
                }}
              />
              {onDeleteImage && (
                <ActionIcon
                  size="xs"
                  color="red"
                  variant="filled"
                  style={{ position: 'absolute', top: 2, right: 2 }}
                  onClick={() => onDeleteImage(img.id)}
                  aria-label={`Remove image ${img.id}`}
                >
                  <IconX size={10} />
                </ActionIcon>
              )}
            </Box>
          ))}
          {staged.map((file, idx) => (
            <Box
              key={idx}
              style={{ position: 'relative', display: 'inline-block' }}
            >
              <img
                src={stagedUrls[idx]}
                alt={file.name}
                style={{
                  height: 56,
                  width: 56,
                  objectFit: 'cover',
                  borderRadius: 4,
                  display: 'block',
                }}
              />
              <ActionIcon
                size="xs"
                color="red"
                variant="filled"
                style={{ position: 'absolute', top: 2, right: 2 }}
                onClick={() => removeStaged(idx)}
                aria-label={`Remove staged image ${idx}`}
              >
                <IconX size={10} />
              </ActionIcon>
            </Box>
          ))}
        </Group>
      )}

      {fileError && (
        <Text size="xs" color="red" mb={4}>
          {fileError}
        </Text>
      )}

      <Group spacing="xs">
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
          onChange={handleFileSelect}
          accept={ALLOWED_TYPES.join(',')}
          multiple
          disabled={isDisabled || totalAttached >= MAX_IMAGES}
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
              {totalAttached > 0 ? `${totalAttached}/5` : 'Images'}
            </Button>
          )}
        </FileButton>
      </Group>
    </div>
  );
};

export default CommentForm;
