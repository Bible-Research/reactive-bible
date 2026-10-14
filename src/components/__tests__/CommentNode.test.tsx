import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CommentNode from '../CommentNode';
import { renderWithProviders } from '../../__tests__/helpers';
import { Comment, CommentImage } from '../../types';

const makeImage = (id: string): CommentImage => ({
  id,
  storage_url: `gs://bucket/originals/${id}/${id}.png`,
  signed_url: `https://example.com/${id}.png`,
  content_type: 'image/png',
  size_bytes: 1024,
  uploaded_by: 1,
  created_at: '2024-01-01T00:00:00Z',
});

// ProseMirror needs DOM APIs happy-dom lacks — stub the editor.
vi.mock('../RichTextEditor', async () => ({
  default: (
    await import('../../__tests__/mocks/RichTextEditorStub')
  ).default,
}));

const makeComment = (overrides: Partial<Comment> = {}): Comment => ({
  id: 'c1',
  author: { id: 1, username: 'alice' },
  note_id: 'note-1',
  parent_comment: null,
  content: 'Hello world',
  timestamp: '2024-01-01T00:00:00Z',
  is_deleted: false,
  replies: [],
  images: [],
  ...overrides,
});

const defaultProps = {
  depth: 0,
  currentUsername: 'alice',
  isAuthenticated: true,
  onReply: vi.fn().mockResolvedValue(undefined),
  onUpdate: vi.fn().mockResolvedValue(undefined),
  onDelete: vi.fn().mockResolvedValue(undefined),
  onDeleteImage: vi.fn().mockResolvedValue(undefined),
};

describe('CommentNode', () => {
  it('renders comment content and author', () => {
    renderWithProviders(
      <CommentNode
        comment={makeComment()}
        {...defaultProps}
      />
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText(/alice/)).toBeInTheDocument();
  });

  it('renders tombstone for deleted comment', () => {
    renderWithProviders(
      <CommentNode
        comment={makeComment({ is_deleted: true })}
        {...defaultProps}
      />
    );
    expect(screen.getByText('[deleted]')).toBeInTheDocument();
    expect(
      screen.queryByText('Hello world')
    ).not.toBeInTheDocument();
  });

  it('shows Reply button when authenticated', () => {
    renderWithProviders(
      <CommentNode
        comment={makeComment()}
        {...defaultProps}
        isAuthenticated={true}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Reply' })
    ).toBeInTheDocument();
  });

  it('hides Reply button when unauthenticated', () => {
    renderWithProviders(
      <CommentNode
        comment={makeComment()}
        {...defaultProps}
        isAuthenticated={false}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Reply' })
    ).not.toBeInTheDocument();
  });

  it('shows Edit and Delete for the author', () => {
    renderWithProviders(
      <CommentNode
        comment={makeComment()}
        {...defaultProps}
        currentUsername="alice"
      />
    );
    expect(
      screen.getByRole('button', { name: 'Edit' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete' })
    ).toBeInTheDocument();
  });

  it('hides Edit and Delete for non-author', () => {
    renderWithProviders(
      <CommentNode
        comment={makeComment()}
        {...defaultProps}
        currentUsername="bob"
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Edit' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });

  it('shows reply form when Reply is clicked', () => {
    renderWithProviders(
      <CommentNode
        comment={makeComment()}
        {...defaultProps}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Reply' })
    );
    expect(
      screen.getByRole('button', { name: 'Cancel' })
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Write a reply…')
    ).toBeInTheDocument();
  });

  it('renders nested replies recursively', () => {
    const reply: Comment = makeComment({
      id: 'c2',
      content: 'A nested reply',
      parent_comment: 'c1',
    });
    renderWithProviders(
      <CommentNode
        comment={makeComment({ replies: [reply] })}
        {...defaultProps}
      />
    );
    expect(
      screen.getByText('A nested reply')
    ).toBeInTheDocument();
  });

  it('renders image thumbnails when comment has images', () => {
    renderWithProviders(
      <CommentNode
        comment={makeComment({ images: [makeImage('img-1')] })}
        {...defaultProps}
      />
    );
    expect(
      document.querySelector('img[alt="img-1.png"]')
    ).toBeInTheDocument();
  });

  it('renders a placeholder when an image has no signed URL', () => {
    const img = { ...makeImage('img-1'), signed_url: null };
    renderWithProviders(
      <CommentNode
        comment={makeComment({ images: [img] })}
        {...defaultProps}
      />
    );
    expect(
      screen.getByRole('img', {
        name: 'img-1.png (unavailable)',
      })
    ).toBeInTheDocument();
  });

  it('shows delete affordance on each image for the author', () => {
    renderWithProviders(
      <CommentNode
        comment={makeComment({ images: [makeImage('img-1')] })}
        {...defaultProps}
        currentUsername="alice"
      />
    );
    expect(
      screen.getByRole('button', { name: 'Delete image img-1' })
    ).toBeInTheDocument();
  });

  it('hides delete affordance on images for non-author', () => {
    renderWithProviders(
      <CommentNode
        comment={makeComment({ images: [makeImage('img-1')] })}
        {...defaultProps}
        currentUsername="bob"
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Delete image img-1' })
    ).not.toBeInTheDocument();
  });

  it('lightbox shows fresh signed URL after comment prop update', () => {
    const img1 = makeImage('img-1');
    const { rerender } = renderWithProviders(
      <CommentNode
        comment={makeComment({ images: [img1] })}
        {...defaultProps}
      />
    );

    fireEvent.click(screen.getByAltText('img-1.png'));

    const lightboxImg = screen.getByAltText(
      'full size'
    ) as HTMLImageElement;
    expect(lightboxImg.src).toBe(
      'https://example.com/img-1.png'
    );

    const refreshedImg = {
      ...img1,
      signed_url: 'https://example.com/img-1-refreshed.png',
    };
    rerender(
      <CommentNode
        comment={makeComment({ images: [refreshedImg] })}
        {...defaultProps}
      />
    );

    expect(lightboxImg.src).toBe(
      'https://example.com/img-1-refreshed.png'
    );
  });

  it('lightbox img onError calls onRequestRefresh', () => {
    const onRequestRefresh = vi.fn();
    renderWithProviders(
      <CommentNode
        comment={makeComment({ images: [makeImage('img-1')] })}
        {...defaultProps}
        onRequestRefresh={onRequestRefresh}
      />
    );

    fireEvent.click(screen.getByAltText('img-1.png'));

    fireEvent.error(screen.getByAltText('full size'));

    expect(onRequestRefresh).toHaveBeenCalledWith('c1');
  });
});
