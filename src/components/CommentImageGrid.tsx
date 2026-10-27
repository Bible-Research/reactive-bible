import type { MouseEvent } from 'react';
import {
  ActionIcon,
  Box,
  SimpleGrid,
  UnstyledButton,
} from '@mantine/core';
import { IconX, IconPhoto } from '@tabler/icons-react';
import { CommentImage } from '../types';
import { commentImageName } from '../utils/commentTree';

/**
 * Floating red "remove" button shared by the image grid and
 * the attach-form thumbnails.
 */
export const RemoveImageButton = ({
  label,
  onClick,
  offset = 4,
}: {
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  offset?: number;
}) => (
  <ActionIcon
    size="xs"
    color="red"
    variant="filled"
    style={{
      position: 'absolute',
      top: offset,
      right: offset,
    }}
    onClick={onClick}
    aria-label={label}
  >
    <IconX size={10} />
  </ActionIcon>
);

/**
 * Photo-icon placeholder shown in attach forms when a
 * thumbnail has no usable image (failed preview or a null
 * signed_url).
 */
export const UnavailableThumb = ({
  label,
}: {
  label: string;
}) => (
  <Box
    role="img"
    aria-label={label}
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
);

interface CommentImageGridProps {
  images: CommentImage[];
  /**
   * The owning comment or note id — passed back through the
   * delete/error callbacks so the parent can scope them.
   */
  parentId: string;
  /** Author/owner-only delete affordance. */
  canDelete: boolean;
  onDeleteImage?: (
    parentId: string,
    imageId: string
  ) => Promise<void> | void;
  onOpenImage: (imageId: string) => void;
  onImageError?: (parentId: string) => void;
}

const CommentImageGrid = ({
  images,
  parentId,
  canDelete,
  onDeleteImage,
  onOpenImage,
  onImageError,
}: CommentImageGridProps) => {
  if (images.length === 0) return null;

  return (
    <SimpleGrid
      cols={3}
      spacing={4}
      breakpoints={[
        { maxWidth: 'xs', cols: 2 },
      ]}
      mt={4}
    >
      {images.map((img) => {
        const src = img.signed_url;
        const name = commentImageName(img);
        return (
          <Box
            key={img.id}
            style={{ position: 'relative' }}
          >
            {src ? (
              <UnstyledButton
                onClick={() => onOpenImage(img.id)}
                aria-label={`View image ${name}`}
                style={{
                  display: 'block',
                  width: '100%',
                }}
              >
                <img
                  src={src}
                  loading="lazy"
                  alt={name}
                  onError={() => onImageError?.(parentId)}
                  style={{
                    width: '100%',
                    maxHeight: 200,
                    objectFit: 'cover',
                    borderRadius: 4,
                    display: 'block',
                  }}
                />
              </UnstyledButton>
            ) : (
              <Box
                role="img"
                aria-label={`${name} (unavailable)`}
                sx={(theme) => ({
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 80,
                  width: '100%',
                  borderRadius: 4,
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
                <IconPhoto size={20} />
              </Box>
            )}
            {canDelete && onDeleteImage && (
              <RemoveImageButton
                label={`Delete image ${img.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void onDeleteImage(parentId, img.id);
                }}
              />
            )}
          </Box>
        );
      })}
    </SimpleGrid>
  );
};

export default CommentImageGrid;
