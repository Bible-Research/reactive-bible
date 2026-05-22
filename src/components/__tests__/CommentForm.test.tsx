import React from 'react';
import {
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CommentForm from '../CommentForm';
import { renderWithProviders } from '../../__tests__/helpers';

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
        screen.getByText('Comment cannot be empty.')
      ).toBeInTheDocument();
    });
  });

  it('calls onSubmit with trimmed content', async () => {
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
      expect(onSubmit).toHaveBeenCalledWith('hello world');
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
});
