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

vi.mock('@mantine/modals', () => ({
  openConfirmModal: vi.fn(
    ({ onConfirm }: { onConfirm?: () => void }) =>
      onConfirm?.()
  ),
}));

// ProseMirror needs DOM APIs happy-dom lacks — stub the editor.
vi.mock('../RichTextEditor', async () => ({
  default: (
    await import('../../__tests__/mocks/RichTextEditorStub')
  ).default,
}));
import { http, HttpResponse } from 'msw';
import CommentThread from '../CommentThread';
import { renderWithProviders } from '../../__tests__/helpers';
import { server } from '../../mocks/server';
import { API_BASE_URL } from '../../config';

const API_URL = `${API_BASE_URL}/api/v1`;

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
      screen.getByTestId('thread-loader')
    ).toBeInTheDocument();
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

  it('calls onCountChange with -1 after successful delete', async () => {
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
        screen.getByText('Test comment')
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete' })
    );

    await waitFor(() => {
      expect(onCountChange).toHaveBeenCalledWith(-1);
    });
  });

  it('updates comment content after successful edit', async () => {
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

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit' })
    );
    fireEvent.change(
      screen.getByDisplayValue('Test comment'),
      { target: { value: 'Updated content' } }
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save' })
    );

    await waitFor(() => {
      expect(
        screen.getByText('Updated content')
      ).toBeInTheDocument();
    });
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

  it('removes image from comment after delete-image', async () => {
    server.use(
      http.get(
        `${API_URL}/notes/${NOTE_ID}/comments/`,
        () =>
          HttpResponse.json([
            {
              id: 'comment-1',
              author: { id: 1, username: 'testuser' },
              note_id: NOTE_ID,
              parent_comment: null,
              content: 'Test comment',
              timestamp: new Date().toISOString(),
              is_deleted: false,
              replies: [],
              images: [
                {
                  id: 'img-1',
                  storage_url:
                    'gs://bucket/originals/img-1/img-1.png',
                  signed_url: 'https://example.com/img-1.png',
                  content_type: 'image/png',
                  size_bytes: 1024,
                  uploaded_by: 1,
                  created_at: new Date().toISOString(),
                },
              ],
            },
          ])
      )
    );

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
        document.querySelector('img[alt="img-1.png"]')
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete image img-1' })
    );

    await waitFor(() => {
      expect(
        document.querySelector('img[alt="img-1.png"]')
      ).not.toBeInTheDocument();
    });
  });

  it('retains form content when createComment fails', async () => {
    server.use(
      http.post(
        `${API_URL}/notes/${NOTE_ID}/comments/`,
        () => HttpResponse.error()
      )
    );

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
        screen.getByPlaceholderText('Add a comment…')
      ).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText('Add a comment…'),
      { target: { value: 'Keep me on failure' } }
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Post' })
    );

    await waitFor(() => {
      expect(
        (screen.getByPlaceholderText(
          'Add a comment…'
        ) as HTMLTextAreaElement).value
      ).toBe('Keep me on failure');
    });
  });

  it('uploads staged images after creating the comment', async () => {
    let uploadCalled = false;
    server.use(
      http.post(
        `${API_URL}/notes/${NOTE_ID}/comments/:commentId/images/`,
        async () => {
          uploadCalled = true;
          return HttpResponse.json(
            {
              id: 'img-new',
              storage_url:
                'gs://bucket/originals/img-new/img-new.png',
              signed_url: 'https://example.com/img-new.png',
              content_type: 'image/png',
              size_bytes: 100,
              uploaded_by: 1,
              created_at: new Date().toISOString(),
            },
            { status: 201 }
          );
        }
      )
    );

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
        screen.getByPlaceholderText('Add a comment…')
      ).toBeInTheDocument();
    });

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(['x'], 'test.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);

    fireEvent.change(
      screen.getByPlaceholderText('Add a comment…'),
      { target: { value: 'Comment with image' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => {
      expect(uploadCalled).toBe(true);
    });
  });

  const useStaleImageThread = (onImagesFetch: () => void) => {
    const staleImg = {
      id: 'img-1',
      storage_url: 'gs://bucket/originals/img-1/pic.png',
      signed_url: 'https://example.com/stale.png',
      content_type: 'image/png',
      size_bytes: 1024,
      uploaded_by: 1,
      created_at: new Date().toISOString(),
    };
    server.use(
      http.get(`${API_URL}/notes/${NOTE_ID}/comments/`, () =>
        HttpResponse.json([
          {
            id: 'comment-1',
            author: { id: 1, username: 'testuser' },
            note_id: NOTE_ID,
            parent_comment: null,
            content: 'Test comment',
            timestamp: new Date().toISOString(),
            is_deleted: false,
            replies: [],
            images: [staleImg],
          },
        ])
      ),
      http.get(
        `${API_URL}/notes/${NOTE_ID}/comments/comment-1/images/`,
        () => {
          onImagesFetch();
          return HttpResponse.json([
            {
              ...staleImg,
              signed_url: 'https://example.com/fresh.png',
            },
          ]);
        }
      )
    );
  };

  const staleThumb = () =>
    document.querySelector(
      'img[alt="pic.png"]'
    ) as HTMLImageElement;

  it('refreshes only the failing comment\'s images', async () => {
    let fetchCalls = 0;
    useStaleImageThread(() => {
      fetchCalls += 1;
    });

    renderWithProviders(
      <CommentThread noteId={NOTE_ID} />
    );
    await waitFor(() => {
      expect(staleThumb()).toBeInTheDocument();
    });

    fireEvent.error(staleThumb());

    await waitFor(() => {
      expect(staleThumb().src).toBe(
        'https://example.com/fresh.png'
      );
    });
    expect(fetchCalls).toBe(1);
  });

  it('caps image refreshes per comment', async () => {
    let fetchCalls = 0;
    useStaleImageThread(() => {
      fetchCalls += 1;
    });

    renderWithProviders(
      <CommentThread noteId={NOTE_ID} />
    );
    await waitFor(() => {
      expect(staleThumb()).toBeInTheDocument();
    });

    for (let i = 0; i < 5; i++) {
      fireEvent.error(staleThumb());
      await waitFor(() => {
        expect(fetchCalls).toBe(Math.min(i + 1, 3));
      });
    }
    expect(fetchCalls).toBe(3);
  });
});
