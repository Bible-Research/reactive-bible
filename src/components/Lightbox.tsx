import { Modal, Text } from '@mantine/core';
import { CommentImage } from '../types';

interface LightboxProps {
  /** The image to show; null renders a closed modal. */
  image: CommentImage | null;
  onClose: () => void;
  onImageError?: () => void;
}

const Lightbox = ({
  image,
  onClose,
  onImageError,
}: LightboxProps) => (
  <Modal
    opened={image !== null}
    onClose={onClose}
    size="xl"
    title="Image"
    padding="xs"
  >
    {image &&
      (image.signed_url ? (
        <img
          src={image.signed_url}
          alt="full size"
          onError={onImageError}
          style={{ width: '100%', height: 'auto' }}
        />
      ) : (
        <Text size="sm" color="dimmed" ta="center" py="xl">
          Image unavailable
        </Text>
      ))}
  </Modal>
);

export default Lightbox;
