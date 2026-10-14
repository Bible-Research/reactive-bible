import { useState, useEffect, useRef } from 'react';
import {
  Group,
  Button,
  FileButton,
  Box,
  Text,
  ActionIcon,
} from '@mantine/core';
import { IconX, IconPhoto } from '@tabler/icons-react';
import RichTextEditor from './RichTextEditor';
import { toPlainText } from '../utils/tiptapContent';
import { commentImageName } from '../utils/commentTree';
import { CommentImage } from '../types';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 5;

const thumbStyle: React.CSSProperties = {
  height: 56,
  width: 56,
  objectFit: 'cover',
  borderRadius: 4,
  display: 'block',
};

interface StagedFile {
  id: number;
  file: File;
  url: string;
}

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
  const [fileError, setFileError] = useState<string | null>(null);
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const urlsRef = useRef<string[]>([]);
  const nextStagedId = useRef(0);

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const isDisabled = submitting || localSubmitting;
  const totalAttached = existingImages.length + staged.length;

  const handleFileSelect = (files: File[]) => {
    const accepted: StagedFile[] = [];
    const errors: string[] = [];
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors.push(`Unsupported file type: ${file.name}`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        errors.push(`File too large (max 10 MiB): ${file.name}`);
        continue;
      }
      if (
        existingImages.length + staged.length + accepted.length >=
        MAX_IMAGES
      ) {
        errors.push(`Maximum ${MAX_IMAGES} images per comment.`);
        break;
      }
      const url = URL.createObjectURL(file);
      urlsRef.current.push(url);
      accepted.push({ id: nextStagedId.current++, file, url });
    }
    setFileError(errors.length > 0 ? errors.join(' ') : null);
    if (accepted.length > 0) {
      setStaged((prev) => [...prev, ...accepted]);
    }
  };

  const removeStaged = (id: number) => {
    const item = staged.find((s) => s.id === id);
    if (!item) return;
    URL.revokeObjectURL(item.url);
    urlsRef.current = urlsRef.current.filter(
      (u) => u !== item.url
    );
    setStaged((prev) => prev.filter((s) => s.id !== id));
  };

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
      staged.forEach((s) => URL.revokeObjectURL(s.url));
      urlsRef.current = [];
      setStaged([]);
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
                    style={thumbStyle}
                  />
                ) : (
                  <Box
                    role="img"
                    aria-label={`${name} (unavailable)`}
                    sx={(theme) => ({
                      height: 56,
                      width: 56,
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor:
                        theme.colorScheme === 'dark'
                          ? theme.colors.dark[5]
                          : theme.colors.gray[2],
                      color:
                        theme.colorScheme === 'dark'
                          ? theme.colors.dark[2]
                          : theme.colors.gray[6],
                    })}
                  >
                    <IconPhoto size={14} />
                  </Box>
                )}
                {onDeleteImage && (
                  <ActionIcon
                    size="xs"
                    color="red"
                    variant="filled"
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                    }}
                    onClick={() => onDeleteImage(img.id)}
                    aria-label={`Remove image ${name}`}
                  >
                    <IconX size={10} />
                  </ActionIcon>
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
              <img
                src={s.url}
                alt={s.file.name}
                style={thumbStyle}
              />
              <ActionIcon
                size="xs"
                color="red"
                variant="filled"
                style={{ position: 'absolute', top: 2, right: 2 }}
                onClick={() => removeStaged(s.id)}
                aria-label={`Remove staged image ${s.file.name}`}
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
