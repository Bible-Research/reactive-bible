import { http, HttpResponse } from 'msw';

// Define your request handlers
const API_URL = 'https://bibleresearchapi.vercel.app/api/v1';

export const handlers = [
  // --- Verses ---
  http.get(`${API_URL}/bible`, () => {
    return HttpResponse.json({
      verses: [{ verse: 1, text: 'In the beginning...' }]
    });
  }),

  // --- Translations ---
  http.get(`${API_URL}/bible/translations`, () => {
    return HttpResponse.json({ results: [] });
  }),

  // --- Audio ---
  http.get(`${API_URL}/bible/filesets/:filesetId/:book/:chapter`, () => {
    return HttpResponse.json({ audio_url: 'http://audio.url/test.mp3' });
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

// --- Special Handlers for Error Cases ---
export const serverErrorHandlers = [
  http.get(`${API_URL}/bible/filesets/ENGESV/Genesis/1`, () => {
    return new HttpResponse(null, {
      status: 404,
      statusText: 'Not Found',
    });
  }),
];
