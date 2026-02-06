import { http, HttpResponse } from 'msw';
import { Note, Tag } from '../types';
import { NoteVerse } from '../api';

// Mock data
export const mockTags: Tag[] = [
  {
    id: 'tag-1',
    name: 'Theology',
    parent_tag: null,
    created_at: '2026-02-06T08:00:00Z',
    updated_at: '2026-02-06T08:00:00Z',
  },
  {
    id: 'tag-2',
    name: 'Soteriology',
    parent_tag: 'tag-1',
    created_at: '2026-02-06T08:00:00Z',
    updated_at: '2026-02-06T08:00:00Z',
  },
];

export const mockVerses: NoteVerse[] = [
  {
    book: 'John',
    chapter: 3,
    verse: 16,
    text: 'For God so loved the world...',
  },
];

export const mockNotes: Note[] = [
  {
    id: 'note-1',
    note_text: 'This is a test note',
    public: true,
    created_at: '2026-02-06T08:00:00Z',
    updated_at: '2026-02-06T08:00:00Z',
    tag: mockTags[0],
    verses: [mockVerses[0]],
  },
];

// API Handlers
export const handlers = [
  // Tags endpoints
  http.get('https://bibleresearchapi.vercel.app/api/v1/tags', () => {
    return HttpResponse.json(mockTags);
  }),

  http.get('https://bibleresearchapi.vercel.app/api/v1/tags/:tagId', ({ params }) => {
    const { tagId } = params;
    const tag = mockTags.find(t => t.id === tagId);
    if (!tag) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(tag);
  }),

  http.post('https://bibleresearchapi.vercel.app/api/v1/tags', async ({ request }) => {
    const data = await request.json() as { name: string; parent_tag?: string | null };
    const newTag: Tag = {
      id: `tag-${Date.now()}`,
      name: data.name,
      parent_tag: data.parent_tag || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json(newTag);
  }),

  // Notes endpoints
  http.get('https://bibleresearchapi.vercel.app/api/v1/notes', ({ request }) => {
    const url = new URL(request.url);
    const tagId = url.searchParams.get('tag_id');
    const isPublic = url.searchParams.get('public') === 'true';
    
    let filteredNotes = [...mockNotes];
    if (tagId) {
      filteredNotes = filteredNotes.filter(n => n.tag.id === tagId);
    }
    if (isPublic) {
      filteredNotes = filteredNotes.filter(n => n.public);
    }
    return HttpResponse.json(filteredNotes);
  }),

  http.get('https://bibleresearchapi.vercel.app/api/v1/notes/:noteId', ({ params }) => {
    const { noteId } = params;
    const note = mockNotes.find(n => n.id === noteId);
    if (!note) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(note);
  }),

  http.get('https://bibleresearchapi.vercel.app/api/v1/notes/search', ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.toLowerCase();
    const tagId = url.searchParams.get('tag_id');
    
    let results = [...mockNotes];
    if (query) {
      results = results.filter(n => 
        n.note_text.toLowerCase().includes(query) ||
        n.verses.some(v => v.text.toLowerCase().includes(query))
      );
    }
    if (tagId) {
      results = results.filter(n => n.tag.id === tagId);
    }
    return HttpResponse.json(results);
  }),

  // Bible endpoints
  http.get('https://bibleresearchapi.vercel.app/api/v1/bible', () => {
    return HttpResponse.json({
      verses: [
        { verse: 16, text: 'For God so loved the world...' },
        { verse: 17, text: 'For God sent not his Son into the world...' },
      ],
    });
  }),
];
