import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Lightbox from './Lightbox';
import { renderWithProviders } from '../__tests__/helpers';
import { CommentImage } from '../types';

const makeImage = (
  overrides: Partial<CommentImage> = {}
): CommentImage => ({
  id: 'img-1',
  storage_url: 'gs://bucket/originals/img-1/img-1.png',
  signed_url: 'https://example.com/img-1.png',
  content_type: 'image/png',
  size_bytes: 1024,
  uploaded_by: 1,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

describe('Lightbox', () => {
  it('renders the full-size image when open', () => {
    renderWithProviders(
      <Lightbox image={makeImage()} onClose={vi.fn()} />
    );

    const img = screen.getByAltText(
      'full size'
    ) as HTMLImageElement;
    expect(img.src).toBe('https://example.com/img-1.png');
  });

  it('renders nothing when the image is null', () => {
    renderWithProviders(
      <Lightbox image={null} onClose={vi.fn()} />
    );

    expect(
      screen.queryByAltText('full size')
    ).not.toBeInTheDocument();
  });

  it('shows an unavailable message without a signed URL', () => {
    renderWithProviders(
      <Lightbox
        image={makeImage({ signed_url: null })}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByText('Image unavailable')
    ).toBeInTheDocument();
  });

  it('forwards image load errors to onImageError', () => {
    const onImageError = vi.fn();
    renderWithProviders(
      <Lightbox
        image={makeImage()}
        onClose={vi.fn()}
        onImageError={onImageError}
      />
    );

    fireEvent.error(screen.getByAltText('full size'));

    expect(onImageError).toHaveBeenCalled();
  });
});
