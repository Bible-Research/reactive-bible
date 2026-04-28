import { http, HttpResponse } from 'msw';
import { mockBooks, mockPassages } from '../__tests__/mocks/data';
import { API_BASE_URL } from '../config';

// Define your request handlers
const API_URL = `${API_BASE_URL}/api/v1`;

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

  http.get(`${API_URL}/bible/passages/`, () => {
    return HttpResponse.json({ results: mockPassages });
  }),

  http.get(`${API_URL}/bible/books/`, () => {
    return HttpResponse.json({ results: mockBooks });
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


