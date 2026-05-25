import React from 'react';
import {
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CommentForm from '../CommentForm';
import { renderWithProviders } from '../../__tests__/helpers';
import { CommentImage } from '../../types';

const makeImage = (id: string): CommentImage => ({
  id,
  signed_url: `https://example.com/${id}.png`,
  content_type: 'image/png',
  size_bytes: 1024,
  uploaded_by: 1,
  created_at: '2024-01-01T00:00:00Z',
});

describe('CommentForm', () => {
  it('renders textarea and submit button', () => {
    renderWithProviders(
      <CommentForm onSubmit={vi.fn()} />
    );
    expect(
      screen.getByRole('textbox')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Post' })
    ).toBeInTheDocument();
  });

  it('renders custom submitLabel', () => {
    renderWithProviders(
      <CommentForm
        submitLabel="Reply"
        onSubmit={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Reply' })
    ).toBeInTheDocument();
  });

  it('shows cancel button when onCancel provided', () => {
    renderWithProviders(
      <CommentForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Cancel' })
    ).toBeInTheDocument();
  });

  it('does not show cancel button when onCancel absent', () => {
    renderWithProviders(
      <CommentForm onSubmit={vi.fn()} />
    );
    expect(
      screen.queryByRole('button', { name: 'Cancel' })
    ).not.toBeInTheDocument();
  });

  it('shows error when submitting empty content', async () => {
    renderWithProviders(
      <CommentForm onSubmit={vi.fn()} />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Post' })
    );
    await waitFor(() => {
      expect(
        screen.getByText('Add text or attach an image.')
      ).toBeInTheDocument();
    });
  });

  it('submits with only staged images and no text', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <CommentForm onSubmit={onSubmit} />
    );

    const input = document
      .querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(
      ['x'], 'photo.png', { type: 'image/png' }
    );
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);

    fireEvent.click(
      screen.getByRole('button', { name: 'Post' })
    );

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('', [file]);
    });
  });

  it('calls onSubmit with trimmed content and empty files', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <CommentForm onSubmit={onSubmit} />
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  hello world  ' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Post' })
    );
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        'hello world',
        []
      );
    });
  });

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <CommentForm
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel' })
    );
    expect(onCancel).toHaveBeenCalled();
  });

  it('prefills textarea with initialValue', () => {
    renderWithProviders(
      <CommentForm
        initialValue="existing text"
        onSubmit={vi.fn()}
      />
    );
    expect(
      (screen.getByRole('textbox') as HTMLTextAreaElement)
        .value
    ).toBe('existing text');
  });

  it('selecting a valid file stages a thumbnail', async () => {
    renderWithProviders(
      <CommentForm onSubmit={vi.fn()} />
    );
    const input = document
      .querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);
    await waitFor(() => {
      expect(
        document.querySelectorAll('img[alt="photo.png"]').length
      ).toBe(1);
    });
  });

  it('rejects a file with wrong MIME type', async () => {
    renderWithProviders(
      <CommentForm onSubmit={vi.fn()} />
    );
    const input = document
      .querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(
      ['x'],
      'doc.pdf',
      { type: 'application/pdf' }
    );
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);
    await waitFor(() => {
      expect(
        screen.getByText(/Unsupported file type/i)
      ).toBeInTheDocument();
    });
  });

  it('rejects a file that exceeds 10 MiB', async () => {
    renderWithProviders(
      <CommentForm onSubmit={vi.fn()} />
    );
    const input = document
      .querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = new File(
      [new ArrayBuffer(11 * 1024 * 1024)],
      'big.png',
      { type: 'image/png' }
    );
    Object.defineProperty(input, 'files', {
      value: [bigFile],
      configurable: true,
    });
    fireEvent.change(input);
    await waitFor(() => {
      expect(
        screen.getByText(/File too large/i)
      ).toBeInTheDocument();
    });
  });

  it('enforces the 5-image cap with existingImages', async () => {
    const existing = [1, 2, 3, 4, 5].map((i) =>
      makeImage(`img-${i}`)
    );
    renderWithProviders(
      <CommentForm
        onSubmit={vi.fn()}
        existingImages={existing}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Attach images' })
    ).toBeDisabled();
  });

  it('calls onSubmit with staged files', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <CommentForm onSubmit={onSubmit} />
    );

    const input = document
      .querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'test.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('hello', [file]);
    });
  });
});
