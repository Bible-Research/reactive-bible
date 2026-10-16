import { http, HttpResponse } from 'msw';
import { API_BASE_URL } from '../config';
import { mockTranslations } from '../__tests__/mocks/data';

// Define your request handlers
const API_URL = `${API_BASE_URL}/api/v1`;
const COMMENT_BASE = `${API_BASE_URL}/api/v1`;

interface NoteCreateBody {
  note_text?: string;
  tag?: string;
  verse_references?: unknown[];
}

interface CommentWriteBody {
  content?: string;
  parent_comment?: string | null;
}

export const handlers = [
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

  // --- Auth ---
  // POST /api/token/ lives OUTSIDE /api/v1.
  http.post(`${API_BASE_URL}/api/token/`, () => {
    return HttpResponse.json({ token: 'test-token' });
  }),

  http.post(`${API_URL}/users/register/`, async ({ request }) => {
    const body = (await request.json()) as {
      username?: string;
      email?: string;
    };
    return HttpResponse.json(
      {
        user: {
          id: 1,
          username: body.username ?? 'testuser',
          email: body.email ?? null,
        },
        token: 'test-token',
        message: 'User registered successfully',
      },
      { status: 201 }
    );
  }),

  // --- Translations ---
  http.get(`${API_URL}/bible/translations/`, () => {
    return HttpResponse.json({ results: mockTranslations });
  }),

  // --- Tags ---
  http.get(`${API_URL}/tags/`, () => {
    return HttpResponse.json([
      {
        id: '1', name: 'Test Tag', parent_tag: null,
        created_at: '', updated_at: ''
      }
    ]);
  }),

  http.get(`${API_URL}/tags/:tagId/`, ({ params }) => {
    return HttpResponse.json({
      id: params.tagId, name: 'Test Tag', parent_tag: null,
      created_at: '', updated_at: ''
    });
  }),

  http.post(`${API_URL}/tags/`, async ({ request }) => {
    const body = (await request.json()) as {
      name?: string;
      parent_tag?: string | null;
    };
    return HttpResponse.json(
      {
        id: 'tag-new',
        name: body.name ?? 'New Tag',
        parent_tag: body.parent_tag ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { status: 201 }
    );
  }),

  http.patch(`${API_URL}/tags/:tagId/`, async ({ params, request }) => {
    const body = (await request.json()) as {
      name?: string;
      parent_tag?: string | null;
    };
    return HttpResponse.json({
      id: params.tagId,
      name: body.name ?? 'Test Tag',
      parent_tag: body.parent_tag ?? null,
      created_at: '',
      updated_at: new Date().toISOString(),
    });
  }),

  http.delete(`${API_URL}/tags/:tagId/`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // --- Notes ---
  http.post(`${API_URL}/notes/`, async ({ request }) => {
    const body = (await request.json()) as NoteCreateBody;
    return HttpResponse.json({
      id: 'note-1',
      note_text: body.note_text,
      tag: {
        id: body.tag, name: 'Test Tag', parent_tag: null,
        created_at: '', updated_at: ''
      },
      public: false,
      is_owner: true,
      tag_position: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // The backend resolves verse text; refs arrive without it.
      verses: (body.verse_references || []).map((ref) => ({
        text: '',
        ...(ref as Record<string, unknown>),
      }))
    });
  }),

  // --- Get Notes ---
  // Real contract: a paginated envelope, NOT a bare array.
  http.get(`${API_URL}/notes/`, () => {
    return HttpResponse.json({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 'note-1',
          note_text: 'This is a test note.',
          tag: {
            id: '1', name: 'Test Tag', parent_tag: null,
            created_at: '', updated_at: ''
          },
          public: false,
          is_owner: true,
          tag_position: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          verses: [{
            book: 'John', chapter: 3, verse: 16,
            text: 'For God so loved the world...'
          }]
        }
      ]
    });
  }),

  // --- Linked Notes ---
  http.post(`${API_URL}/notes/linked/`, () => {
    return HttpResponse.json({ count: 0, results: [] });
  }),

  // --- Note ordering ---
  // Literal sub-paths are registered BEFORE `/notes/:noteId/` so
  // 'order-index' isn't swallowed by the path parameter.
  http.get(`${API_URL}/notes/order-index/`, () => {
    return HttpResponse.json([]);
  }),

  http.post(`${API_URL}/notes/reorder/`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API_URL}/notes/move/`, async ({ request }) => {
    const body = (await request.json()) as { note_id?: string };
    return HttpResponse.json({
      note_id: body.note_id,
      tag_position: 1,
      rebalanced: false,
    });
  }),

  // --- Single Note ---
  http.get(`${API_URL}/notes/:noteId/`, ({ params }) => {
    return HttpResponse.json({
      id: params.noteId,
      note_text: 'This is a test note.',
      tag: {
        id: '1', name: 'Test Tag', parent_tag: null,
        created_at: '', updated_at: ''
      },
      public: false,
      is_owner: true,
      tag_position: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      verses: [{
        book: 'John', chapter: 3, verse: 16,
        text: 'For God so loved the world...'
      }]
    });
  }),

  http.patch(
    `${API_URL}/notes/:noteId/`,
    async ({ params, request }) => {
      const body = (await request.json()) as NoteCreateBody;
      return HttpResponse.json({
        id: params.noteId,
        note_text: body.note_text,
        tag: {
          id: body.tag, name: 'Test Tag', parent_tag: null,
          created_at: '', updated_at: ''
        },
        public: false,
        is_owner: true,
        tag_position: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        verses: (body.verse_references || []).map((ref) => ({
          text: '',
          ...(ref as Record<string, unknown>),
        }))
      });
    }
  ),

  // --- Delete Note ---
  http.delete(`${API_URL}/notes/:id/`, () => {
    return HttpResponse.text('Deleted');
  }),

  // --- Reading Positions ---
  http.get(`${API_URL}/reading-positions/`, () => {
    return HttpResponse.json([]);
  }),

  http.post(`${API_URL}/reading-positions/`, () => {
    return HttpResponse.json({}, { status: 201 });
  }),

  http.post(`${API_URL}/reading-positions/bulk/`, () => {
    return HttpResponse.json({});
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
      const body = (await request.json()) as CommentWriteBody;
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
      const body = (await request.json()) as CommentWriteBody;
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

  // --- Audio Timestamps ---
  // ENGESHO1DA (ESV "Hear the Word" OT audio) has no DBT verse
  // timestamp rows — mirrors production, so tests can exercise
  // the graceful-degradation path. Other filesets return a
  // small fixed row set.
  http.get(`${API_URL}/bible/timestamps/`, ({ request }) => {
    const url = new URL(request.url);
    const filesetId = url.searchParams.get('fileset_id');
    if (filesetId === 'ENGESHO1DA') {
      return HttpResponse.json({ data: [] });
    }
    return HttpResponse.json({
      data: [
        { verse_start: 0, timestamp: 0 },
        { verse_start: 1, timestamp: 2.44 },
        { verse_start: 2, timestamp: 5.0 },
        { verse_start: 3, timestamp: 8.5 },
      ],
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


