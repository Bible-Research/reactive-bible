import {
  act,
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

  const useStaleImageThread = (
    onImagesFetch: () => void,
    refreshedUrl = 'https://example.com/fresh.png'
  ) => {
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
              signed_url: refreshedUrl,
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

  it('caps image refreshes per image set', async () => {
    let fetchCalls = 0;
    // The refresh mints no new URL, so the image set never
    // changes and the retry budget binds at 3.
    useStaleImageThread(
      () => {
        fetchCalls += 1;
      },
      'https://example.com/stale.png'
    );

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

  it('grants a fresh retry budget to a changed image set', async () => {
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

    // First refresh changes stale.png -> fresh.png, which earns
    // a fresh budget: 4 more errors yield 3 more fetches.
    for (let i = 0; i < 5; i++) {
      fireEvent.error(staleThumb());
      await waitFor(() => {
        expect(fetchCalls).toBe(Math.min(i + 1, 4));
      });
    }
    expect(fetchCalls).toBe(4);
  });

  it('clears the loader when a silent refresh lands mid-Retry', async () => {
    let calls = 0;
    let releaseLoad: () => void = () => undefined;
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    const commentFor = (content: string) => ({
      id: 'comment-1',
      author: { id: 1, username: 'testuser' },
      note_id: NOTE_ID,
      parent_comment: null,
      content,
      timestamp: new Date().toISOString(),
      is_deleted: false,
      replies: [],
      images: [],
    });
    server.use(
      http.get(
        `${API_URL}/notes/${NOTE_ID}/comments/`,
        async () => {
          calls += 1;
          // A 500 fails fast — HttpResponse.error() would be
          // retried by publicFetch and consume call 2.
          if (calls === 1) {
            return HttpResponse.json({}, { status: 500 });
          }
          if (calls === 2) {
            // The Retry load hangs until released.
            await loadGate;
            return HttpResponse.json([
              commentFor('from load'),
            ]);
          }
          return HttpResponse.json([
            commentFor('from poll'),
          ]);
        }
      )
    );

    renderWithProviders(
      <CommentThread noteId={NOTE_ID} />
    );
    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: /retry loading comments/i,
        })
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /retry loading comments/i,
      })
    );
    await waitFor(() => expect(calls).toBe(2));

    // A poll landing while the load is in flight must not
    // stale out the loader.
    await act(async () => {
      fireEvent(
        document,
        new Event('visibilitychange', { bubbles: true })
      );
    });
    await waitFor(() => expect(calls).toBe(3));
    await waitFor(() => {
      expect(
        screen.getByTestId('thread-loader')
      ).toBeInTheDocument();
    });

    releaseLoad();
    await waitFor(() => {
      expect(
        screen.queryByTestId('thread-loader')
      ).not.toBeInTheDocument();
    });
    // The poll response was newer — its data wins.
    expect(screen.getByText('from poll')).toBeInTheDocument();
  });

  it('keeps a new comment when the refresh misses it', async () => {
    // The GET response lags behind the POST (eventual
    // consistency) — the optimistic insert must survive.
    server.use(
      http.get(`${API_URL}/notes/${NOTE_ID}/comments/`, () =>
        HttpResponse.json([
          {
            id: 'comment-1',
            author: { id: 1, username: 'testuser' },
            note_id: NOTE_ID,
            parent_comment: null,
            content: 'Old comment',
            timestamp: new Date().toISOString(),
            is_deleted: false,
            replies: [],
            images: [],
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
        screen.getByPlaceholderText('Add a comment…')
      ).toBeInTheDocument();
    });
    fireEvent.change(
      screen.getByPlaceholderText('Add a comment…'),
      { target: { value: 'My new comment' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => {
      expect(
        screen.getByText('My new comment')
      ).toBeInTheDocument();
    });

    // The post-create silentLoad and any later poll must not
    // wipe the optimistic insert.
    await act(async () => {
      fireEvent(
        document,
        new Event('visibilitychange', { bubbles: true })
      );
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(
      screen.getByText('My new comment')
    ).toBeInTheDocument();
    expect(screen.getByText('Old comment')).toBeInTheDocument();
  });
  const commentsFixture = () => [
    {
      id: 'comment-1',
      author: { id: 1, username: 'testuser' },
      note_id: NOTE_ID,
      parent_comment: null,
      content: 'Test comment',
      timestamp: new Date().toISOString(),
      is_deleted: false,
      replies: [],
      images: [],
    },
  ];

  it('polls for new comments every 30 seconds', async () => {
    let fetches = 0;
    server.use(
      http.get(`${API_URL}/notes/${NOTE_ID}/comments/`, () => {
        fetches += 1;
        return HttpResponse.json(commentsFixture());
      })
    );

    // Fake timers must be on before render so the component's
    // interval is scheduled under them.
    vi.useFakeTimers();
    try {
      renderWithProviders(
        <CommentThread noteId={NOTE_ID} />
      );
      // Flush the initial fetch — MSW resolves off microtasks,
      // and a long vi.waitFor would advance fake time into a
      // poll tick.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(
        screen.getByText('Test comment')
      ).toBeInTheDocument();
      const baseline = fetches;
      expect(baseline).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(29999);
      });
      expect(fetches).toBe(baseline);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(fetches).toBe(baseline + 1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(fetches).toBe(baseline + 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-polls when the tab becomes visible', async () => {
    let fetches = 0;
    server.use(
      http.get(`${API_URL}/notes/${NOTE_ID}/comments/`, () => {
        fetches += 1;
        return HttpResponse.json(commentsFixture());
      })
    );

    renderWithProviders(
      <CommentThread noteId={NOTE_ID} />
    );
    await waitFor(() => {
      expect(
        screen.getByText('Test comment')
      ).toBeInTheDocument();
    });
    const baseline = fetches;

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(fetches).toBe(baseline + 1);
    });
  });

  it('ignores a stale fetch resolving after a newer load',
    async () => {
      let resolveFirst: (r: Response) => void =
        () => undefined;
      let resolveSecond: (r: Response) => void =
        () => undefined;
      // The MSW handler runs asynchronously after the fetch is
      // issued — wait for the resolver before settling it.
      let firstPending = false;
      let secondPending = false;
      const comment = (id: string, content: string) => ({
        id,
        author: { id: 1, username: 'testuser' },
        note_id: 'x',
        parent_comment: null,
        content,
        timestamp: new Date().toISOString(),
        is_deleted: false,
        replies: [],
        images: [],
      });
      server.use(
        http.get(`${API_URL}/notes/note-1/comments/`, () =>
          new Promise<Response>((resolve) => {
            firstPending = true;
            resolveFirst = resolve;
          })
        ),
        http.get(`${API_URL}/notes/note-2/comments/`, () =>
          new Promise<Response>((resolve) => {
            secondPending = true;
            resolveSecond = resolve;
          })
        )
      );

      const { rerender } = renderWithProviders(
        <CommentThread noteId="note-1" />
      );
      await waitFor(() => {
        expect(firstPending).toBe(true);
      });

      // Switch note before the first fetch resolves — the new
      // load bumps loadVersion, superseding the first.
      rerender(<CommentThread noteId="note-2" />);
      await waitFor(() => {
        expect(secondPending).toBe(true);
      });

      await act(async () => {
        resolveSecond(
          HttpResponse.json([comment('c2', 'Newer comment')])
        );
      });
      await waitFor(() => {
        expect(
          screen.getByText('Newer comment')
        ).toBeInTheDocument();
      });

      // The stale first response must be dropped, not
      // resurrected over the newer list.
      await act(async () => {
        resolveFirst(
          HttpResponse.json([comment('c1', 'Stale comment')])
        );
      });
      expect(
        screen.queryByText('Stale comment')
      ).not.toBeInTheDocument();
      expect(
        screen.getByText('Newer comment')
      ).toBeInTheDocument();
    });

  it('keeps the new comment when one of two image uploads ' +
    'fails', async () => {
      const okImage = {
        id: 'img-ok',
        storage_url: 'gs://bucket/originals/img-ok/ok.png',
        signed_url: 'https://example.com/ok.png',
        content_type: 'image/png',
        size_bytes: 100,
        uploaded_by: 1,
        created_at: new Date().toISOString(),
      };
      let created: Record<string, unknown> | null = null;
      const uploads: string[] = [];
      server.use(
        http.get(
          `${API_URL}/notes/${NOTE_ID}/comments/`,
          () =>
            HttpResponse.json(
              created
                ? [...commentsFixture(), created]
                : commentsFixture()
            )
        ),
        http.post(
          `${API_URL}/notes/${NOTE_ID}/comments/`,
          async ({ params, request }) => {
            const body = (await request.json()) as {
              content?: string;
            };
            created = {
              id: 'comment-new',
              author: { id: 1, username: 'testuser' },
              note_id: params.noteId,
              parent_comment: null,
              content: body.content,
              timestamp: new Date().toISOString(),
              is_deleted: false,
              replies: [],
              images: [okImage],
            };
            return HttpResponse.json(created, { status: 201 });
          }
        ),
        http.post(
          `${API_URL}/notes/${NOTE_ID}/comments/` +
            ':commentId/images/',
          async ({ request }) => {
            const fd = await request.formData();
            const file = fd.get('file') as File | null;
            uploads.push(file?.name ?? '?');
            if (file?.name === 'bad.png') {
              return HttpResponse.json(
                { detail: 'Broken upload' },
                { status: 500 }
              );
            }
            return HttpResponse.json(okImage, { status: 201 });
          }
        )
      );

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

      const input = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      const good = new File(['x'], 'good.png', {
        type: 'image/png',
      });
      const bad = new File(['x'], 'bad.png', {
        type: 'image/png',
      });
      Object.defineProperty(input, 'files', {
        value: [good, bad],
        configurable: true,
      });
      fireEvent.change(input);

      fireEvent.change(
        screen.getByPlaceholderText('Add a comment…'),
        { target: { value: 'Two images' } }
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Post' })
      );

      // Both uploads attempted; the failed one does not roll
      // back the comment or the successful image.
      await waitFor(() => {
        expect(onCountChange).toHaveBeenCalledWith(1);
      });
      await vi.waitFor(() => {
        expect(uploads.sort()).toEqual(['bad.png', 'good.png']);
      });
      await waitFor(() => {
        expect(
          screen.getByText('Two images')
        ).toBeInTheDocument();
      });
      expect(
        document.querySelector('img[alt="ok.png"]')
      ).toBeInTheDocument();
      // The failed upload surfaces its own 'Upload failed'
      // notification instead of failing the whole comment.
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Upload failed' })
      );
    });
});
