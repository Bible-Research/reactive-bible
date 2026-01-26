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
    return HttpResponse.json({ verses: [{ verse: 1, text: 'In the beginning...' }] });
  }),

  // --- Translations ---
  http.get(`${API_URL}/bible/translations`, () => {
    return HttpResponse.json({ results: [] });
  }),

  // --- Notes ---
  http.post(`${API_URL}/notes/`, () => {
    return HttpResponse.json({ success: true });
  }),

  // --- Get Notes ---
  http.get(`${API_URL}/notes`, () => {
    return HttpResponse.json([]);
  }),

  // --- Delete Note ---
  http.delete(`${API_URL}/notes/:id`, () => {
    return HttpResponse.text('Deleted');
  }),
];

// --- Special Handlers for Specific Test Cases ---
// This handler is now for the error case only
export const audioErrorHandler = http.get(`${API_URL}/bible`, () => {
  return new HttpResponse(null, { status: 404, statusText: 'Not Found' });
});
