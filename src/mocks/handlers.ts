import { http, HttpResponse } from 'msw';

// Define your request handlers
const API_URL = 'https://bible-research-489314.ey.r.appspot.com/api/v1';
const LOCAL_API_URL = 'http://localhost:8000/api/v1';

export const handlers = [
  // --- Single /bible Endpoint Handler ---
  http.get(`${API_URL}/bible`, ({ request }) => {
    const url = new URL(request.url);
    const filesetId = url.searchParams.get('fileset_id');

    // Check if it's an audio request (audio filesets are suffixed with 'DA')
    if (filesetId && filesetId.endsWith('DA')) {
      // This is the success case for audio URLs
      return HttpResponse.json({ audio_url: 'http://audio.url/test.mp3' });
    }

    // Otherwise, assume it's a verse request
    // This is the success case for verses
    return HttpResponse.json({
      verses: [
        {
          verse: 16,
          text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
        },
      ],
    });
  }),

  // --- Translations ---
  http.get(`${API_URL}/bible/translations`, () => {
    return HttpResponse.json({ results: [] });
  }),

  // --- Tags ---
  http.get(`${API_URL}/tags/`, () => {
    return HttpResponse.json([
      { id: '1', name: 'Test Tag', parent_tag: null, created_at: '', updated_at: '' }
    ]);
  }),

  // --- Notes ---
  http.post(`${API_URL}/notes/`, async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({ 
      id: 'note-1',
      note_text: body.note_text,
      tag: { id: body.tag, name: 'Test Tag', parent_tag: null, created_at: '', updated_at: '' },
      public: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      verses: body.verse_references || []
    });
  }),

  // --- Get Notes ---
  http.get(`${API_URL}/notes`, () => {
    return HttpResponse.json([
      {
        id: 'note-1',
        note_text: 'This is a test note.',
        tag: { id: '1', name: 'Test Tag', parent_tag: null, created_at: '', updated_at: '' },
        public: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        verses: [{ book: 'John', chapter: 3, verse: 16, text: 'For God so loved the world...' }]
      }
    ]);
  }),

  // --- Delete Note ---
  http.delete(`${API_URL}/notes/:id`, () => {
    return HttpResponse.text('Deleted');
  }),

  // --- Comments (intercepted on both prod and local URLs) ---
  http.get(`${LOCAL_API_URL}/notes/:noteId/comments/`, ({ params }) => {
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
      },
    ]);
  }),

  http.post(
    `${LOCAL_API_URL}/notes/:noteId/comments/`,
    async ({ params, request }) => {
      const body = await request.json() as any;
      return HttpResponse.json({
        id: 'comment-new',
        author: { id: 1, username: 'testuser' },
        note_id: params.noteId,
        parent_comment: body.parent_comment || null,
        content: body.content,
        timestamp: new Date().toISOString(),
        is_deleted: false,
        replies: [],
      }, { status: 201 });
    }
  ),

  http.patch(
    `${LOCAL_API_URL}/notes/:noteId/comments/:commentId/`,
    async ({ params, request }) => {
      const body = await request.json() as any;
      return HttpResponse.json({
        id: params.commentId,
        author: { id: 1, username: 'testuser' },
        note_id: params.noteId,
        parent_comment: null,
        content: body.content,
        timestamp: new Date().toISOString(),
        is_deleted: false,
        replies: [],
      });
    }
  ),

  http.delete(
    `${LOCAL_API_URL}/notes/:noteId/comments/:commentId/`,
    () => {
      return new HttpResponse(null, { status: 204 });
    }
  ),

  // --- Comment Counts ---
  http.get(`${LOCAL_API_URL}/comments/counts/`, ({ request }) => {
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


