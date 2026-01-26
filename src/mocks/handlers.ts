import { http, HttpResponse } from 'msw';

// Define your request handlers
const API_URL = 'https://bibleresearchapi.vercel.app/api/v1';

export const handlers = [
  // --- Verses ---
  http.get(`${API_URL}/bible`, ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.has('passage')) {
      return HttpResponse.json({
        verses: [{ verse: 1, text: 'In the beginning...' }]
      });
    }
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
export const audioSuccessHandler = http.get(
  `${API_URL}/bible/filesets/ESV/GEN/1`,
  () => {
    return HttpResponse.json({ audio_url: 'http://audio.url/test.mp3' });
  }
);

export const audioErrorHandler = http.get(
  `${API_URL}/bible/filesets/ESV/GEN/1`,
  () => {
    return new HttpResponse(null, {
      status: 404,
      statusText: 'Not Found',
    });
  }
);
