import React from 'react';
import {
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest';
import { http, HttpResponse } from 'msw';
import CommentThread from '../CommentThread';
import { renderWithProviders } from '../../__tests__/helpers';
import { server } from '../../mocks/server';

const API_URL = 'http://localhost:8000/api/v1';

const NOTE_ID = 'note-1';

describe('CommentThread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loader initially', () => {
    renderWithProviders(
      <CommentThread noteId={NOTE_ID} />
    );
    expect(
      document.querySelector('.mantine-Loader-root') ||
        document.querySelector('[data-testid="loader"]') ||
        document.querySelector('svg')
    ).toBeTruthy();
  });

  it('renders comments after fetch', async () => {
    renderWithProviders(
      <CommentThread noteId={NOTE_ID} />
    );
    await waitFor(() => {
      expect(
        screen.getByText('Test comment')
      ).toBeInTheDocument();
    });
  });

  it('shows "No comments yet" when list is empty', async () => {
    server.use(
      http.get(
        `${API_URL}/notes/note-1/comments/`,
        () => HttpResponse.json([])
      )
    );
    renderWithProviders(
      <CommentThread noteId={NOTE_ID} />
    );
    await waitFor(() => {
      expect(
        screen.getByText(/No comments yet/i)
      ).toBeInTheDocument();
    });
  });

  it('shows error message on fetch failure', async () => {
    server.use(
      http.get(
        `${API_URL}/notes/note-1/comments/`,
        () => HttpResponse.error()
      )
    );
    renderWithProviders(
      <CommentThread noteId={NOTE_ID} />
    );
    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load comments/i)
      ).toBeInTheDocument();
    });
  });

  it('shows comment form for authenticated users', async () => {
    renderWithProviders(
      <CommentThread noteId={NOTE_ID} />,
      {
        stores: {
          auth: {
            isAuthenticated: true,
            user: { username: 'testuser' },
            token: 'fake-token',
          },
        },
      }
    );
    await waitFor(() => {
      expect(
        screen.getByText('Test comment')
      ).toBeInTheDocument();
    });
    expect(
      screen.getByPlaceholderText('Add a comment…')
    ).toBeInTheDocument();
  });

  it('hides comment form for unauthenticated users', async () => {
    renderWithProviders(
      <CommentThread noteId={NOTE_ID} />,
      {
        stores: {
          auth: {
            isAuthenticated: false,
            user: null,
            token: null,
          },
        },
      }
    );
    await waitFor(() => {
      expect(
        screen.getByText('Test comment')
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByPlaceholderText('Add a comment…')
    ).not.toBeInTheDocument();
  });

  it('calls onCountChange with +1 after successful create', async () => {
    const onCountChange = vi.fn();
    renderWithProviders(
      <CommentThread
        noteId={NOTE_ID}
        onCountChange={onCountChange}
      />,
      {
        stores: {
          auth: {
            isAuthenticated: true,
            user: { username: 'testuser' },
            token: 'fake-token',
          },
        },
      }
    );

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('Add a comment…')
      ).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText('Add a comment…'),
      { target: { value: 'My new comment' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => {
      expect(onCountChange).toHaveBeenCalledWith(1);
    });
  });
});
