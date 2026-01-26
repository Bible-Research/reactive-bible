import { http, HttpResponse } from 'msw';

// Define your request handlers
export const handlers = [
  // --- Verses --- 
  http.get('*/api/verses', () => {
    return HttpResponse.json({
      verses: [{ verse: 1, text: 'In the beginning...' }]
    });
  }),

  // --- Audio --- 
  http.get('*/api/audio', () => {
    return HttpResponse.json({ audio_url: 'http://audio.url/test.mp3' });
  }),

  // --- Notes --- 
  http.post('*/api/notes', () => {
    return HttpResponse.json({ success: true });
  }),

  // --- Get Notes ---
  http.get('*/api/notes', () => {
    return HttpResponse.json([]);
  }),

  // --- Delete Note ---
  http.delete('*/api/notes/:id', () => {
    return HttpResponse.text('Deleted');
  }),
];

// --- Special Handlers for Error Cases ---
export const serverErrorHandlers = [
  http.get('*/api/audio', () => {
    return new HttpResponse(null, {
      status: 404,
      statusText: 'Not Found',
    });
  }),
];
