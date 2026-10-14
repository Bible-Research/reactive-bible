import { http, HttpResponse } from 'msw';
import { API_BASE_URL } from '../config';
import { mockTranslations } from '../__tests__/mocks/data';

// Define your request handlers
const API_URL = `${API_BASE_URL}/api/v1`;

// COMMENT_BASE intentionally equals API_URL: api.tsx addresses
// comment endpoints as `${API_BASE_URL}/api/v1/notes/:id/comments/`,
// i.e. the same /api/v1 prefix. The separate constant only exists
// to document that these handlers back the comment API surface —
// it is NOT a different host or a double /api/v1 prefix.
const COMMENT_BASE = `${API_BASE_URL}/api/v1`;

// --- Shared fixtures ---

const mockTag = {
  id: '1',
  name: 'Test Tag',
  parent_tag: null,
  created_at: '',
  updated_at: '',
};

// Matches the Note contract in src/types.ts / api.tsx:
// tag_position + is_owner are required, headings optional.
const mockNote = {
  id: 'note-1',
  note_text: 'This is a test note.',
  tag: mockTag,
  public: false,
  is_owner: true,
  tag_position: null,
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
  headings: [],
};

interface NoteWriteBody {
  tag?: string;
  note_text?: string;
  verse_references?: {
    book: string;
    chapter: number;
    verse: number;
    text?: string;
  }[];
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

  // --- Translations ---
  // api.tsx requests `bible/translations/?language_iso=` (trailing
  // slash); both variants are registered so either form matches.
  http.get(`${API_URL}/bible/translations`, () => {
    return HttpResponse.json({ results: mockTranslations });
  }),
  http.get(`${API_URL}/bible/translations/`, () => {
    return HttpResponse.json({ results: mockTranslations });
  }),

  // --- Audio verse timestamps ---
  http.get(`${API_URL}/bible/timestamps/`, () => {
    return HttpResponse.json({ data: [] });
  }),

  // --- Tags ---
  http.get(`${API_URL}/tags/`, () => {
    return HttpResponse.json([mockTag]);
  }),
  http.get(`${API_URL}/tags`, () => {
    return HttpResponse.json([mockTag]);
  }),

  http.get(`${API_URL}/tags/:id`, ({ params }) => {
    return HttpResponse.json({ ...mockTag, id: params.id });
  }),
  http.get(`${API_URL}/tags/:id/`, ({ params }) => {
    return HttpResponse.json({ ...mockTag, id: params.id });
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
  http.post(`${API_URL}/tags`, async ({ request }) => {
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

  http.patch(`${API_URL}/tags/:id`, async ({ params, request }) => {
    const body = (await request.json()) as {
      name?: string;
      parent_tag?: string | null;
    };
    return HttpResponse.json({
      ...mockTag,
      id: params.id,
      name: body.name ?? mockTag.name,
      parent_tag: body.parent_tag ?? null,
    });
  }),
  http.patch(`${API_URL}/tags/:id/`, async ({ params, request }) => {
    const body = (await request.json()) as {
      name?: string;
      parent_tag?: string | null;
    };
    return HttpResponse.json({
      ...mockTag,
      id: params.id,
      name: body.name ?? mockTag.name,
      parent_tag: body.parent_tag ?? null,
    });
  }),

  http.delete(`${API_URL}/tags/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),
  http.delete(`${API_URL}/tags/:id/`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // --- Notes ---
  // api.tsx requests `notes/?...` (trailing slash); the paginated
  // envelope {count, next, previous, results} mirrors DRF. Both
  // variants are registered.
  http.get(`${API_URL}/notes`, () => {
    return HttpResponse.json({
      count: 1,
      next: null,
      previous: null,
      results: [mockNote],
    });
  }),
  http.get(`${API_URL}/notes/`, () => {
    return HttpResponse.json({
      count: 1,
      next: null,
      previous: null,
      results: [mockNote],
    });
  }),

  // Registered before `/notes/:id` so the literal path wins over
  // the `:id` param.
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
  http.get(`${API_URL}/notes/order-index`, () => {
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

  http.post(`${API_URL}/notes/reorder/`, () => {
    return HttpResponse.json({ status: 'ok' });
  }),
  http.post(`${API_URL}/notes/reorder`, () => {
    return HttpResponse.json({ status: 'ok' });
  }),

  http.post(`${API_URL}/notes/move/`, async ({ request }) => {
    const body = (await request.json()) as { note_id?: string };
    return HttpResponse.json({
      note_id: body.note_id ?? 'note-1',
      tag_position: 1,
      rebalanced: false,
    });
  }),
  http.post(`${API_URL}/notes/move`, async ({ request }) => {
    const body = (await request.json()) as { note_id?: string };
    return HttpResponse.json({
      note_id: body.note_id ?? 'note-1',
      tag_position: 1,
      rebalanced: false,
    });
  }),

  http.post(`${API_URL}/notes/`, async ({ request }) => {
    const body = (await request.json()) as NoteWriteBody;
    // Verse echoes carry `text` like the backend response does.
    const verses = (body.verse_references ?? []).map((v) => ({
      ...v,
      text: v.text ?? 'Test verse text',
    }));
    return HttpResponse.json({
      ...mockNote,
      id: 'note-1',
      note_text: body.note_text ?? mockNote.note_text,
      tag: { ...mockTag, id: body.tag ?? mockTag.id },
      verses,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }),
  http.post(`${API_URL}/notes`, async ({ request }) => {
    const body = (await request.json()) as NoteWriteBody;
    const verses = (body.verse_references ?? []).map((v) => ({
      ...v,
      text: v.text ?? 'Test verse text',
    }));
    return HttpResponse.json({
      ...mockNote,
      id: 'note-1',
      note_text: body.note_text ?? mockNote.note_text,
      tag: { ...mockTag, id: body.tag ?? mockTag.id },
      verses,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }),

  // --- Linked Notes ---
  http.post(`${API_URL}/notes/linked/`, () => {
    return HttpResponse.json({ count: 0, results: [] });
  }),
  http.post(`${API_URL}/notes/linked`, () => {
    return HttpResponse.json({ count: 0, results: [] });
  }),

  // --- Single note (GET/PATCH/DELETE) ---
  http.get(`${API_URL}/notes/:id`, ({ params }) => {
    return HttpResponse.json({ ...mockNote, id: params.id });
  }),
  http.get(`${API_URL}/notes/:id/`, ({ params }) => {
    return HttpResponse.json({ ...mockNote, id: params.id });
  }),

  http.patch(`${API_URL}/notes/:id`, async ({ params, request }) => {
    const body = (await request.json()) as NoteWriteBody;
    const verses = (body.verse_references ?? []).map((v) => ({
      ...v,
      text: v.text ?? 'Test verse text',
    }));
    return HttpResponse.json({
      ...mockNote,
      id: params.id,
      note_text: body.note_text ?? mockNote.note_text,
      tag: { ...mockTag, id: body.tag ?? mockTag.id },
      verses:
        body.verse_references !== undefined
          ? verses
          : mockNote.verses,
      updated_at: new Date().toISOString(),
    });
  }),
  http.patch(`${API_URL}/notes/:id/`, async ({ params, request }) => {
    const body = (await request.json()) as NoteWriteBody;
    const verses = (body.verse_references ?? []).map((v) => ({
      ...v,
      text: v.text ?? 'Test verse text',
    }));
    return HttpResponse.json({
      ...mockNote,
      id: params.id,
      note_text: body.note_text ?? mockNote.note_text,
      tag: { ...mockTag, id: body.tag ?? mockTag.id },
      verses:
        body.verse_references !== undefined
          ? verses
          : mockNote.verses,
      updated_at: new Date().toISOString(),
    });
  }),

  http.delete(`${API_URL}/notes/:id`, () => {
    return HttpResponse.text('Deleted');
  }),
  http.delete(`${API_URL}/notes/:id/`, () => {
    return HttpResponse.text('Deleted');
  }),

  // --- Reading positions (book-NAME keyed, auth-gated) ---
  http.get(`${API_URL}/reading-positions/`, () => {
    return HttpResponse.json([]);
  }),
  http.get(`${API_URL}/reading-positions`, () => {
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
  http.post(`${API_URL}/reading-positions`, async ({ request }) => {
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

  // Bulk endpoint returns a map keyed by book name.
  http.post(`${API_URL}/reading-positions/bulk/`, () => {
    return HttpResponse.json({});
  }),
  http.post(`${API_URL}/reading-positions/bulk`, () => {
    return HttpResponse.json({});
  }),

  // --- Auth ---
  // NOTE: the token endpoint is NOT under /api/v1 — authStore.tsx
  // posts to `${API_BASE_URL}/api/token/`.
  http.post(`${API_BASE_URL}/api/token/`, async ({ request }) => {
    const body = (await request.json()) as { username?: string };
    return HttpResponse.json({
      token: 'test-token',
      user: { username: body.username ?? 'testuser' },
    });
  }),
  http.post(`${API_BASE_URL}/api/token`, async ({ request }) => {
    const body = (await request.json()) as { username?: string };
    return HttpResponse.json({
      token: 'test-token',
      user: { username: body.username ?? 'testuser' },
    });
  }),

  http.post(`${API_URL}/users/register/`, async ({ request }) => {
    const body = (await request.json()) as { username?: string };
    return HttpResponse.json(
      {
        token: 'test-token',
        user: { username: body.username ?? 'testuser' },
      },
      { status: 201 }
    );
  }),
  http.post(`${API_URL}/users/register`, async ({ request }) => {
    const body = (await request.json()) as { username?: string };
    return HttpResponse.json(
      {
        token: 'test-token',
        user: { username: body.username ?? 'testuser' },
      },
      { status: 201 }
    );
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
        content?: string;
        parent_comment?: string | null;
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
      const body = (await request.json()) as { content?: string };
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
