import { http, HttpResponse } from 'msw';
import { API_BASE_URL } from '../config';
import { mockTranslations } from '../__tests__/mocks/data';

// Define your request handlers
const API_URL = `${API_BASE_URL}/api/v1`;
const COMMENT_BASE = `${API_BASE_URL}/api/v1`;

const mockTag = {
  id: '1',
  name: 'Test Tag',
  parent_tag: null,
  created_at: '',
  updated_at: '',
};

const mockNote = {
  id: 'note-1',
  note_text: 'This is a test note.',
  tag: mockTag,
  public: false,
  is_owner: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  verses: [
    {
      book: 'John',
      chapter: 3,
      verse: 16,
      text: 'For God so loved the world...',
    },
  ],
  tag_position: null,
};

export const handlers = [
  // --- Auth ---
  http.post(`${API_BASE_URL}/api/token/`, async ({ request }) => {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };
    if (!body.username || !body.password) {
      return HttpResponse.json(
        {
          non_field_errors: [
            'Unable to log in with provided credentials.',
          ],
        },
        { status: 400 }
      );
    }
    return HttpResponse.json({ token: 'mock-token' });
  }),

  http.post(`${API_URL}/users/register/`, async ({ request }) => {
    const body = (await request.json()) as {
      username?: string;
    };
    return HttpResponse.json(
      {
        token: 'mock-token',
        user: { id: 1, username: body.username ?? 'newuser' },
      },
      { status: 201 }
    );
  }),

  // --- Single /bible Endpoint Handler ---
  http.get(`${API_URL}/bible`, ({ request }) => {
    const url = new URL(request.url);
    const filesetId = url.searchParams.get('fileset_id');
    const isAudio =
      url.searchParams.get('response_format') === 'audio' ||
      (filesetId != null && filesetId.endsWith('DA'));

    // Audio requests return a playable URL — a missing
    // `audio_url` is the coverage-miss contract
    // (`book_not_in_fileset`), exercised by dedicated tests.
    if (isAudio) {
      return HttpResponse.json({ audio_url: 'http://audio.url/test.mp3' });
    }

    // Otherwise, assume it's a verse request
    // This is the success case for verses
    return HttpResponse.json({
      verses: [
        {
          verse: 16,
          text: 'For God so loved the world, that he gave his only ' +
            'begotten Son, that whosoever believeth in him should ' +
            'not perish, but have everlasting life.',
        },
      ],
    });
  }),

  // --- Translations ---
  http.get(`${API_URL}/bible/translations`, () => {
    return HttpResponse.json({ results: mockTranslations });
  }),

  // --- Tags ---
  http.get(`${API_URL}/tags/`, () => {
    return HttpResponse.json([mockTag]);
  }),

  http.get(`${API_URL}/tags/:tagId/`, ({ params }) => {
    return HttpResponse.json({ ...mockTag, id: params.tagId });
  }),

  http.post(`${API_URL}/tags/`, async ({ request }) => {
    const body = (await request.json()) as {
      name?: string;
      parent_tag?: string | null;
    };
    return HttpResponse.json(
      {
        ...mockTag,
        id: 'tag-new',
        name: body.name ?? 'New Tag',
        parent_tag: body.parent_tag ?? null,
      },
      { status: 201 }
    );
  }),

  http.patch(
    `${API_URL}/tags/:tagId/`,
    async ({ params, request }) => {
      const body = (await request.json()) as {
        name?: string;
        parent_tag?: string | null;
      };
      return HttpResponse.json({
        ...mockTag,
        id: params.tagId,
        name: body.name ?? mockTag.name,
        parent_tag:
          body.parent_tag !== undefined
            ? body.parent_tag
            : mockTag.parent_tag,
      });
    }
  ),

  http.delete(`${API_URL}/tags/:tagId/`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // --- Notes ---
  http.post(`${API_URL}/notes/`, async ({ request }) => {
    const body = (await request.json()) as {
      tag?: string;
      note_text?: string;
      verse_references?: unknown[];
    };
    return HttpResponse.json(
      {
        ...mockNote,
        note_text: body.note_text,
        tag: { ...mockTag, id: String(body.tag ?? mockTag.id) },
        verses: body.verse_references || [],
      },
      { status: 201 }
    );
  }),

  // --- Get Notes ---
  // NOTE: the API always calls `/notes/` with a trailing slash —
  // a bare `/notes` pattern would never match and the handler
  // would be dead.
  http.get(`${API_URL}/notes/`, () => {
    return HttpResponse.json({
      count: 1,
      next: null,
      previous: null,
      results: [mockNote],
    });
  }),

  // --- Note ordering ---
  // Static segments (`order-index`, `linked`, `reorder`, `move`)
  // must be registered before `/notes/:noteId/` or the param
  // pattern swallows them.
  http.get(`${API_URL}/notes/order-index/`, () => {
    return HttpResponse.json([
      {
        id: 'note-1',
        tag_position: 1,
        book: 'John',
        chapter: 3,
        verse_start: 16,
        verse_end: 16,
      },
    ]);
  }),

  // --- Linked Notes ---
  http.post(`${API_URL}/notes/linked/`, () => {
    return HttpResponse.json({ count: 0, results: [] });
  }),

  http.post(`${API_URL}/notes/reorder/`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API_URL}/notes/move/`, async ({ request }) => {
    const body = (await request.json()) as { note_id?: string };
    return HttpResponse.json({
      note_id: body.note_id ?? 'note-1',
      tag_position: 1,
      rebalanced: false,
    });
  }),

  // --- Note detail ---
  http.get(`${API_URL}/notes/:noteId/`, ({ params }) => {
    return HttpResponse.json({ ...mockNote, id: params.noteId });
  }),

  http.patch(
    `${API_URL}/notes/:noteId/`,
    async ({ params, request }) => {
      const body = (await request.json()) as {
        tag?: string;
        note_text?: string;
        verse_references?: unknown[];
      };
      return HttpResponse.json({
        ...mockNote,
        id: params.noteId,
        note_text: body.note_text ?? mockNote.note_text,
        tag:
          body.tag !== undefined
            ? { ...mockTag, id: String(body.tag) }
            : mockNote.tag,
        verses: body.verse_references ?? mockNote.verses,
      });
    }
  ),

  // --- Delete Note ---
  http.delete(`${API_URL}/notes/:noteId/`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // --- Reading positions ---
  http.get(`${API_URL}/reading-positions/`, () => {
    return HttpResponse.json([]);
  }),

  http.post(`${API_URL}/reading-positions/`, async ({ request }) => {
    const body = (await request.json()) as {
      book?: string;
      chapter?: number;
      verse?: number;
    };
    return HttpResponse.json(
      {
        id: 'rp-1',
        book: body.book ?? 'John',
        chapter: body.chapter ?? 1,
        verse: body.verse ?? 1,
        last_accessed: new Date().toISOString(),
      },
      { status: 201 }
    );
  }),

  http.post(
    `${API_URL}/reading-positions/bulk/`,
    async ({ request }) => {
      const body = (await request.json()) as {
        books?: string[];
      };
      const positions: Record<
        string,
        { chapter: number; verse: number } | null
      > = {};
      for (const book of body.books ?? []) {
        positions[book] = null;
      }
      return HttpResponse.json(positions);
    }
  ),

  // --- Audio timestamps ---
  http.get(`${API_URL}/bible/timestamps/`, () => {
    return HttpResponse.json({ data: [] });
  }),

  // --- Comments ---
  http.get(`${COMMENT_BASE}/notes/:noteId/comments/`, ({ params }) => {
    return HttpResponse.json([
      {
        id: 'comment-1',
        author: { id: 1, username: 'testuser' },
        note_id: params.noteId,
        parent_comment: null,
        content: 'Test comment',
        timestamp: new Date().toISOString(),
        is_deleted: false,
        replies: [],
        images: [],
      },
    ]);
  }),

  http.post(
    `${COMMENT_BASE}/notes/:noteId/comments/`,
    async ({ params, request }) => {
      const body = (await request.json()) as {
        parent_comment?: string | null;
        content?: string;
      };
      return HttpResponse.json({
        id: 'comment-new',
        author: { id: 1, username: 'testuser' },
        note_id: params.noteId,
        parent_comment: body.parent_comment || null,
        content: body.content,
        timestamp: new Date().toISOString(),
        is_deleted: false,
        replies: [],
        images: [],
      }, { status: 201 });
    }
  ),

  http.patch(
    `${COMMENT_BASE}/notes/:noteId/comments/:commentId/`,
    async ({ params, request }) => {
      const body = (await request.json()) as {
        content?: string;
      };
      return HttpResponse.json({
        id: params.commentId,
        author: { id: 1, username: 'testuser' },
        note_id: params.noteId,
        parent_comment: null,
        content: body.content,
        timestamp: new Date().toISOString(),
        is_deleted: false,
        replies: [],
        images: [],
      });
    }
  ),

  http.delete(
    `${COMMENT_BASE}/notes/:noteId/comments/:commentId/`,
    () => {
      return new HttpResponse(null, { status: 204 });
    }
  ),

  // --- Comment Images ---
  http.post(
    `${COMMENT_BASE}/notes/:noteId/comments/:commentId/images/`,
    async ({ params }) => {
      return HttpResponse.json({
        id: 'img-1',
        storage_url: 'gs://bucket/originals/img-1/img-1.png',
        signed_url: 'https://example.com/img-1.png',
        content_type: 'image/png',
        size_bytes: 1024,
        uploaded_by: 1,
        comment: params.commentId,
        note: params.noteId,
        created_at: new Date().toISOString(),
      }, { status: 201 });
    }
  ),

  http.delete(
    `${COMMENT_BASE}/images/:imageId/`,
    () => {
      return new HttpResponse(null, { status: 204 });
    }
  ),

  http.get(
    `${COMMENT_BASE}/notes/:noteId/comments/:commentId/images/`,
    ({ params }) => {
      return HttpResponse.json([
        {
          id: 'img-1',
          storage_url: 'gs://bucket/originals/img-1/img-1.png',
          signed_url: 'https://example.com/img-1.png',
          content_type: 'image/png',
          size_bytes: 1024,
          uploaded_by: 1,
          comment: params.commentId,
          note: params.noteId,
          created_at: new Date().toISOString(),
        },
      ]);
    }
  ),

  // --- Comment Counts ---
  http.get(`${COMMENT_BASE}/comments/counts/`, ({ request }) => {
    const url = new URL(request.url);
    const noteIds = url.searchParams.get('note_ids');
    const counts: Record<string, number> = {};
    if (noteIds) {
      noteIds.split(',').forEach((id) => {
        counts[id] = 1;
      });
    }
    return HttpResponse.json({ counts });
  }),

  // --- Search ---
  http.get(`${API_URL}/bible/search/`, ({ request }) => {
    const url = new URL(request.url);
    const filesetId = url.searchParams.get('fileset_id');
    const groupBy = url.searchParams.get('group_by');

    // Grouped mode: book-grouped results, no pagination
    if (groupBy === 'book') {
      if (filesetId === 'ENGESV_API') {
        return HttpResponse.json({
          data: {
            groups: [
              {
                book_id: 'JHN',
                count: 1,
                verses: [
                  {
                    book_id: 'JHN',
                    chapter: 3,
                    verse_start: 16,
                    verse_text:
                      'For God so loved the world, that he gave ' +
                      'his only Son.',
                  },
                ],
              },
              {
                book_id: 'ROM',
                count: 1,
                verses: [
                  {
                    book_id: 'ROM',
                    chapter: 8,
                    verse_start: 28,
                    verse_text:
                      'And we know that for those who love God ' +
                      'all things work together for good.',
                  },
                ],
              },
            ],
            meta: { total: 2, truncated: false },
          },
        });
      }
      return HttpResponse.json({
        data: {
          groups: [
            {
              book_id: 'GEN',
              count: 1,
              verses: [
                {
                  book_id: 'GEN',
                  chapter: 1,
                  verse_start: 1,
                  verse_text:
                    'In the beginning God created the heavens ' +
                    'and the earth.',
                },
              ],
            },
          ],
          meta: { total: 1, truncated: false },
        },
      });
    }

    // Mock ESV API search results for ENGESV_API
    if (filesetId === 'ENGESV_API') {
      return HttpResponse.json({
        data: {
          verses: [
            {
              book_id: 'JHN',
              chapter: 3,
              verse_start: 16,
              verse_text:
                'For God so loved the world, that he gave his only Son.',
            },
            {
              book_id: 'ROM',
              chapter: 8,
              verse_start: 28,
              verse_text: 'And we know that for those who love ' +
                'God all things work together for good.',
            }
          ],
          meta: {
            pagination: {
              total: 2,
              count: 2,
              per_page: 50,
              current_page: 1,
              total_pages: 1,
            }
          }
        }
      });
    }
    
    // Mock search results for other filesets
    return HttpResponse.json({
      data: {
        verses: [
          {
            book_id: 'GEN',
            chapter: 1,
            verse_start: 1,
            verse_text:
              'In the beginning God created the heavens and the earth.',
          }
        ],
        meta: {
          pagination: {
            total: 1,
            count: 1,
            per_page: 50,
            current_page: 1,
            total_pages: 1,
          }
        }
      }
    });
  }),

  // --- Copyright ---
  http.get(
    `${API_URL}/bible/copyright/`,
    ({ request }) => {
      const url = new URL(request.url);
      const bibleId = url.searchParams.get(
        'bible_id'
      );
      return HttpResponse.json({
        data: [
          {
            id: bibleId || 'ENGESV',
            type: 'text_plain',
            size: 'C',
            copyright: `© 2001 Test Copyright`,
            copyright_date: '2001',
            copyright_description:
              'The Holy Bible, Test Version',
          },
        ],
      });
    }
  ),
];


