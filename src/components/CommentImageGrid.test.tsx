import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CommentImageGrid from './CommentImageGrid';
import { renderWithProviders } from '../__tests__/helpers';
import { CommentImage } from '../types';

const makeImage = (
  id: string,
  overrides: Partial<CommentImage> = {}
): CommentImage => ({
  id,
  storage_url: `gs://bucket/originals/${id}/${id}.png`,
  signed_url: `https://example.com/${id}.png`,
  content_type: 'image/png',
  size_bytes: 1024,
  uploaded_by: 1,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

const renderGrid = (
  props: Partial<
    React.ComponentProps<typeof CommentImageGrid>
  > = {}
) =>
  renderWithProviders(
    <CommentImageGrid
      images={[makeImage('img-1')]}
      commentId="c1"
      canDelete={false}
      onOpenImage={vi.fn()}
      {...props}
    />
  );

describe('CommentImageGrid', () => {
  it('renders nothing for an empty image list', () => {
    const { container } = renderGrid({ images: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a thumbnail per image', () => {
    renderGrid({
      images: [makeImage('img-1'), makeImage('img-2')],
    });
    expect(
      document.querySelector('img[alt="img-1.png"]')
    ).toBeInTheDocument();
    expect(
      document.querySelector('img[alt="img-2.png"]')
    ).toBeInTheDocument();
  });

  it('opens the lightbox via onOpenImage on click', () => {
    const onOpenImage = vi.fn();
    renderGrid({ onOpenImage });

    fireEvent.click(screen.getByAltText('img-1.png'));

    expect(onOpenImage).toHaveBeenCalledWith('img-1');
  });

  it('renders a placeholder when signed_url is null', () => {
    renderGrid({
      images: [
        makeImage('img-1', { signed_url: null }),
      ],
    });
    expect(
      screen.getByRole('img', {
        name: 'img-1.png (unavailable)',
      })
    ).toBeInTheDocument();
  });

  it('shows the delete button and forwards ids', () => {
    const onDeleteImage = vi.fn();
    renderGrid({
      canDelete: true,
      onDeleteImage,
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Delete image img-1',
      })
    );

    expect(onDeleteImage).toHaveBeenCalledWith('c1', 'img-1');
  });

  it('hides the delete button without permission', () => {
    renderGrid({ canDelete: false, onDeleteImage: vi.fn() });
    expect(
      screen.queryByRole('button', {
        name: 'Delete image img-1',
      })
    ).not.toBeInTheDocument();
  });

  it('reports image load errors via onImageError', () => {
    const onImageError = vi.fn();
    renderGrid({ onImageError });

    fireEvent.error(screen.getByAltText('img-1.png'));

    expect(onImageError).toHaveBeenCalledWith('c1');
  });
});
