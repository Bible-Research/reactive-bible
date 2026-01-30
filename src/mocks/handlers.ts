import { http, HttpResponse } from 'msw';

// Define your request handlers
const API_URL = 'https://bibleresearchapi.vercel.app/api/v1';

export const handlers = [
  // --- Single /bible Endpoint Handler ---
  http.get(`${API_URL}/bible`, ({ request }) => {
    const url = new URL(request.url);
    const filesetId = url.searchParams.get('fileset_id');

    // Check if it's an audio request (audio filesets are suffixed with 'DA')
    if (filesetId && filesetId.endsWith('DA')) {
      return HttpResponse.json({ audio_url: 'http://audio.url/test.mp3' });
    } 

    // Otherwise, assume it's a verse request
    // Return John 3:16 for integration tests
    return HttpResponse.json({ 
      verses: [
        { verse: 16, text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' }
      ] 
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
];

// --- Special Handlers for Specific Test Cases ---
// This handler is for the error case only - it checks for audio filesets
export const audioErrorHandler = http.get(`${API_URL}/bible`, ({ request }) => {
  const url = new URL(request.url);
  const filesetId = url.searchParams.get('fileset_id');
  
  // Only match audio requests (ending with 'DA')
  if (filesetId && filesetId.endsWith('DA')) {
    return new HttpResponse(null, { status: 404, statusText: 'Not Found' });
  }
  
  // Pass through to default handler for non-audio requests
  return HttpResponse.json({ verses: [{ verse: 1, text: 'In the beginning...' }] });
});
