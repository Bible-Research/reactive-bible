import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as api from './api';
import * as cacheManager from './utils/cacheManager';
import * as fums from './utils/fums';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import * as kjvDataLoader from './utils/kjvDataLoader';
import * as errorReporter from './utils/errorReporter';
import { sentryBeforeSend } from './utils/sentry';
import { API_BASE_URL } from './config';
import type { Translation } from './store';
import type { ErrorEvent, EventHint } from '@sentry/react';

const API_URL = `${API_BASE_URL}/api/v1`;
const COMMENT_BASE = `${API_URL}`;

describe('API Functions', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();

    // Spy on the KJV loader (calls through to the real dynamic
    // import) so tests can assert when lazy loading is triggered.
    vi.spyOn(kjvDataLoader, 'loadKjvData');
    vi.spyOn(cacheManager, 'getCachedVerses').mockReturnValue(null);
    vi.spyOn(cacheManager, 'cacheVerses');
    vi.spyOn(cacheManager, 'getCachedAudioUrl').mockReturnValue(null);
    vi.spyOn(cacheManager, 'cacheAudioUrl');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Lazy Loading', () => {
    it('getBooks should NOT load KJV data (uses lightweight ' +
      'structure)', () => {
      api.getBooks();
      expect(kjvDataLoader.loadKjvData).not.toHaveBeenCalled();
    });

    it('getChapterList should NOT load KJV data (uses ' +
      'lightweight structure)', () => {
      api.getChapterList();
      expect(kjvDataLoader.loadKjvData).not.toHaveBeenCalled();
    });

    it('getVersesInKjvChapter SHOULD load KJV data', async () => {
      await api.getVersesInKjvChapter('GEN', 1);
      expect(kjvDataLoader.loadKjvData).toHaveBeenCalled();
    });
  });

  describe('Navigation Functions', () => {
    it('getBooks should return books from structure data', () => {
      const books = api.getBooks();
      expect(books.length).toBeGreaterThan(0);
      expect(books[0].book_name).toBe('Genesis');
      expect(books[0].book_id).toBe('GEN');
    });

    it('getChapters should return the correct number of chapters',
      () => {
      const chapters = api.getChapters('GEN');
      expect(chapters.length).toBe(50);
    });

    it('getVersesInKjvChapter should lazy load KJV data and ' +
      'return all verses for a given chapter', async () => {
      const result = await api.getVersesInKjvChapter('JHN', 3);
      expect(kjvDataLoader.loadKjvData).toHaveBeenCalled();
      expect(result.verses.length).toBe(36);
      expect(result.verses[15].text)
        .toContain('For God so loved the world');
      expect(result.headings).toEqual([]);
    });

    it('getAdjacentChapters should return correct previous and ' +
      'next chapters', () => {
      const adjacent = api.getAdjacentChapters('JHN', 1);
      expect(adjacent.previous).toEqual({ bookId: 'LUK', chapter: 24 });
      expect(adjacent.next).toEqual({ bookId: 'JHN', chapter: 2 });
    });
  });

  // --- API-Calling Functions ---
  describe('API-Calling Functions', () => {
    it('getVersesFromApi should fetch from API when not cached', async () => {
      const mockVerses = [{
        verse: 16,
        text: 'For God so loved the world, that he gave his ' +
          'only begotten Son, that whosoever believeth in him ' +
          'should not perish, but have everlasting life.',
      }];
      const result = await api.getVersesFromApi('GEN', 1, 'ESV');

      expect(cacheManager.getCachedVerses).toHaveBeenCalledWith(
        'GEN', 1, 'ESV');
      expect(cacheManager.cacheVerses).toHaveBeenCalledWith(
        'GEN', 1, 'ESV', mockVerses);
      expect(result.verses).toEqual(mockVerses);
      expect(result.headings).toEqual([]);
    });

    it('getVersesFromApi should return from cache when available',
      async () => {
      const mockVerses = [{ verse: 1, text: 'Cached verse' }];
      vi.spyOn(cacheManager, 'getCachedVerses').mockReturnValue(mockVerses);

      const result = await api.getVersesFromApi('GEN', 1, 'ESV');

      expect(result.verses).toEqual(mockVerses);
      expect(result.headings).toEqual([]);
    });

    it('getVersesFromApi should throw RateLimitError on 429', async () => {
      // Override the MSW handler to return 429
      server.use(
        http.get(`${API_URL}/bible`, () => {
          return new HttpResponse(null, { status: 429 });
        })
      );

      await expect(
        api.getVersesFromApi('JHN', 3, 'ENGESV')
      ).rejects.toThrow(api.RateLimitError);

      await expect(
        api.getVersesFromApi('JHN', 3, 'ENGESV')
      ).rejects.toThrow(
        'The translation provider is currently rate-limited'
      );
      await expect(
        api.getVersesFromApi('JHN', 3, 'ENGESV')
      ).rejects.toThrow('in about 1 minute');
    });

    it('getVersesFromApi should throw RateLimitError when a ' +
      'non-OK error body mentions rate limiting', async () => {
      server.use(
        http.get(`${API_URL}/bible`, () => {
          return HttpResponse.json(
            { error: '(429) Reason: Too Many Requests' },
            { status: 400 }
          );
        })
      );

      await expect(
        api.getVersesFromApi('JHN', 3, 'ENGESV')
      ).rejects.toThrow(api.RateLimitError);
    });

    it('getVersesFromApi should throw RateLimitError when a ' +
      'response carries a rate_limited error_code',
      async () => {
      server.use(
        http.get(`${API_URL}/bible`, () => {
          return HttpResponse.json(
            {
              error:
                'Bible provider rate limit exceeded (HTTP 429)',
              error_code: 'rate_limited',
            },
            { status: 429 }
          );
        })
      );

      await expect(
        api.getVersesFromApi('JHN', 3, 'ENGESV')
      ).rejects.toThrow(api.RateLimitError);
    });

    it('getVersesFromApi should throw ProviderError when a ' +
      'response carries a provider_error error_code',
      async () => {
      server.use(
        http.get(`${API_URL}/bible`, () => {
          return HttpResponse.json(
            {
              error: 'Bible provider error (HTTP 503)',
              error_code: 'provider_error',
            },
            { status: 502 }
          );
        })
      );

      await expect(
        api.getVersesFromApi('JHN', 3, 'ENGESV')
      ).rejects.toThrow(api.ProviderError);
      await expect(
        api.getVersesFromApi('JHN', 3, 'ENGESV')
      ).rejects.toThrow('Bible provider error (HTTP 503)');
    });

    it('getVersesFromApi should throw ProviderError when the ' +
      'API wraps a provider failure in a 200 response',
      async () => {
      server.use(
        http.get(`${API_URL}/bible`, () => {
          return HttpResponse.json({
            book: 'JHN',
            book_name: 'John',
            chapter: 3,
            verses: [],
            message: 'No verses found for the specified passage',
          });
        })
      );

      await expect(
        api.getVersesFromApi('JHN', 3, 'ENGESV')
      ).rejects.toThrow(api.ProviderError);
    });

    it('getBibleAudioUrl should fetch from API when not cached', async () => {
      const mockUrl = 'http://audio.url/test.mp3';
      const url = await api.getBibleAudioUrl('GEN', 1, 'ESVDA');

      expect(cacheManager.getCachedAudioUrl).toHaveBeenCalledWith(
        'GEN', 1, 'ESVDA');
      expect(cacheManager.cacheAudioUrl).toHaveBeenCalledWith(
        'GEN', 1, 'ESVDA', mockUrl, 0, 0);
      expect(url).toBe(mockUrl);
    });

    it('getBibleAudioUrl should report FUMS meta from the ' +
      'response', async () => {
      vi.spyOn(cacheManager, 'getCachedAudioUrl')
        .mockReturnValue(null);
      const reportFumsSpy = vi.spyOn(fums, 'reportFums');
      server.use(
        http.get(`${API_URL}/bible`, () => {
          return HttpResponse.json({
            audio_url: 'http://audio.url/fums.mp3',
            meta: { fumsId: 'audio-fums-token' },
          });
        })
      );

      await api.getBibleAudioUrl('EXO', 2, 'FUMSDA');

      expect(reportFumsSpy).toHaveBeenCalledWith(
        { fumsId: 'audio-fums-token' });
    });

    it('addTagNote should make a POST request with the ' +
      'correct body', async () => {
      let capturedBody: {
        tag?: string;
        note_text?: string;
        verse_references?: unknown[];
      } | undefined;
      server.use(
        http.post(`${API_URL}/notes/`, async ({ request }) => {
          capturedBody = (await request.json()) as {
            tag?: string;
            note_text?: string;
            verse_references?: unknown[];
          };
          return HttpResponse.json({
            id: 'note-1',
            note_text: capturedBody.note_text,
            verses: [],
          });
        })
      );

      const verseRefs = [{ book: 'John', chapter: 3, verse: 16 }];
      const result = await api.addTagNote('tag1', 'My note', verseRefs);

      expect(capturedBody).toEqual({
        tag: 'tag1',
        note_text: 'My note',
        verse_references: verseRefs,
      });
      expect(result.id).toBe('note-1');
      expect(result.note_text).toBe('My note');
    });

    it('should throw an error if the fetch response is not ok', async () => {
      server.use(
        http.get(`${API_URL}/bible`, ({ request }) => {
          const url = new URL(request.url);
          const filesetId = url.searchParams.get('fileset_id');
          if (filesetId === 'ERRORTEST') {
            return new HttpResponse(
              null, { status: 404, statusText: 'Not Found' });
          }
          return;
        })
      );

      await expect(
        api.getBibleAudioUrl('GEN', 1, 'ERRORTEST')
      ).rejects.toThrow(
        'Failed to fetch audio for ERRORTEST: Not Found'
      );
    });

    it('should make a DELETE request with note id', async () => {
      let capturedId: string | undefined;
      server.use(
        http.delete(`${API_URL}/notes/:id/`, ({ params }) => {
          capturedId = params.id as string;
          return HttpResponse.text('Deleted');
        })
      );

      const removeNote = await api.deleteNote('abc-123');

      expect(capturedId).toBe('abc-123');
      expect(removeNote).toBe('Deleted');
    });
  });

  describe('error mapping', () => {
    it('getVersesFromApi throws BookNotInFilesetError on a ' +
      'non-OK book_not_in_fileset body', async () => {
      server.use(
        http.get(`${API_URL}/bible`, () =>
          HttpResponse.json(
            {
              error: 'Book not available in this fileset',
              error_code: 'book_not_in_fileset',
            },
            { status: 404 }
          )
        )
      );

      await expect(
        api.getVersesFromApi('JHN', 3, 'NOJHN')
      ).rejects.toBeInstanceOf(api.BookNotInFilesetError);
      await expect(
        api.getVersesFromApi('JHN', 3, 'NOJHN')
      ).rejects.toThrow('Book not available in this fileset');
    });

    it('getVersesFromApi throws BookNotInFilesetError when a ' +
      '200 response wraps the error_code', async () => {
      server.use(
        http.get(`${API_URL}/bible`, () =>
          HttpResponse.json({
            verses: [],
            error: 'Book not covered by this fileset',
            error_code: 'book_not_in_fileset',
          })
        )
      );

      await expect(
        api.getVersesFromApi('JHN', 3, 'NOJHN')
      ).rejects.toBeInstanceOf(api.BookNotInFilesetError);
    });

    it('getBibleAudioUrl throws BookNotInFilesetError on a ' +
      'non-OK book_not_in_fileset body', async () => {
      server.use(
        http.get(`${API_URL}/bible`, () =>
          HttpResponse.json(
            {
              error: 'Audio not available for this book',
              error_code: 'book_not_in_fileset',
            },
            { status: 404 }
          )
        )
      );

      await expect(
        api.getBibleAudioUrl('JHN', 3, 'NOAUDDA')
      ).rejects.toBeInstanceOf(api.BookNotInFilesetError);
      await expect(
        api.getBibleAudioUrl('JHN', 3, 'NOAUDDA')
      ).rejects.toThrow('Audio not available for this book');
    });

    it('getBibleAudioUrl throws BookNotInFilesetError when a ' +
      '200 response wraps the error_code', async () => {
      server.use(
        http.get(`${API_URL}/bible`, () =>
          HttpResponse.json({
            error: 'Book not covered by this fileset',
            error_code: 'book_not_in_fileset',
          })
        )
      );

      await expect(
        api.getBibleAudioUrl('JHN', 3, 'NOAUDDA')
      ).rejects.toBeInstanceOf(api.BookNotInFilesetError);
    });

    it('getBibleAudioUrl throws BookNotInFilesetError when a ' +
      '200 response has no audio_url', async () => {
      // Older backends answer 200 with empty verses/a message for
      // audio the fileset does not carry — callers walk the
      // alternates chain on BookNotInFilesetError, so the
      // mapping must not degrade into ProviderError/Error.
      server.use(
        http.get(`${API_URL}/bible`, () =>
          HttpResponse.json({ duration_seconds: 0 })
        )
      );

      await expect(
        api.getBibleAudioUrl('JHN', 3, 'NOAUDDA')
      ).rejects.toBeInstanceOf(api.BookNotInFilesetError);
      await expect(
        api.getBibleAudioUrl('JHN', 3, 'NOAUDDA')
      ).rejects.toThrow('No audio URL in API response');
    });

    it('reorderNotes throws ConflictError on a 409 response',
      async () => {
        server.use(
          http.post(`${API_URL}/notes/reorder/`, () =>
            HttpResponse.json(
              { message: 'Positions changed by another client' },
              { status: 409 }
            )
          )
        );

        await expect(
          api.reorderNotes('tag1', [
            { note_id: 'n1', position: 1 },
            { note_id: 'n2', position: 2 },
          ])
        ).rejects.toBeInstanceOf(api.ConflictError);
        await expect(
          api.reorderNotes('tag1', [
            { note_id: 'n1', position: 1 },
          ])
        ).rejects.toThrow('Positions changed by another client');
      });

    it('moveNote throws ConflictError on a 409 response',
      async () => {
        server.use(
          http.post(`${API_URL}/notes/move/`, () =>
            HttpResponse.json(
              { message: 'Positions changed by another client' },
              { status: 409 }
            )
          )
        );

        await expect(
          api.moveNote('tag1', 'n1', 'n2', 'after')
        ).rejects.toBeInstanceOf(api.ConflictError);
      });

    it('moveNote resolves with the server-assigned position',
      async () => {
        const result = await api.moveNote(
          'tag1', 'n1', 'n2', 'after'
        );

        expect(result.note_id).toBe('n1');
        expect(result.tag_position).toBe(1);
        expect(result.rebalanced).toBe(false);
      });
  });

  describe('custom-endpoint 429 handling', () => {
    const throttleBody = {
      // A bare DRF throttle response — no `error_code`, and
      // 'Request was throttled…' does not match the
      // rate-limit message pattern, so only the HTTP status
      // can map this onto RateLimitError.
      detail:
        'Request was throttled. Expected available in ' +
        '60 seconds.',
    };
    const beforeSendDrops = (err: unknown): boolean =>
      sentryBeforeSend(
        { event_id: 'api-429' } as ErrorEvent,
        { originalException: err } as EventHint
      ) === null;

    it('reorderNotes maps a 429 to a RateLimitError ' +
      'sentryBeforeSend drops', async () => {
        server.use(
          http.post(`${API_URL}/notes/reorder/`, () =>
            HttpResponse.json(throttleBody, { status: 429 })
          )
        );

        const err = await api
          .reorderNotes('tag1', [{ note_id: 'n1', position: 1 }])
          .catch((e: unknown) => e);

        // A throttling failure on a custom `!response.ok`
        // endpoint must not emit a level-error handled-api
        // event — same contract fetchJson endpoints have.
        expect(err).toBeInstanceOf(api.RateLimitError);
        expect((err as Error).message)
          .toBe(throttleBody.detail);
        expect(api.errorDetailsOf(err)).toEqual({
          code: 'rate_limited',
          status: 429,
          endpoint: '/api/v1/notes/reorder/',
        });
        expect(beforeSendDrops(err)).toBe(true);
      });

    it('deleteNote keeps the rate-limit type/code through ' +
      'its message re-wrap', async () => {
        server.use(
          http.delete(`${API_URL}/notes/:id/`, () =>
            HttpResponse.json(throttleBody, { status: 429 })
          )
        );

        const err = await api
          .deleteNote('n1')
          .catch((e: unknown) => e);

        // The outer catch re-wraps into a friendlier message;
        // the wrapped error must still carry the RateLimitError
        // class and `rate_limited` code so the event drops.
        expect(err).toBeInstanceOf(api.RateLimitError);
        expect((err as Error).message).toBe(
          'Failed to delete your note, please try again'
        );
        expect(api.errorDetailsOf(err).code)
          .toBe('rate_limited');
        expect(api.errorDetailsOf(err).status).toBe(429);
        expect(beforeSendDrops(err)).toBe(true);
      });

    it('updateReadingPosition reports a dropped ' +
      'RateLimitError on 429', async () => {
        // The position writes swallow their failure into
        // captureHandledError — a throttled save must reach
        // Sentry (if at all) as a drop, not an error event.
        const handled = vi
          .spyOn(errorReporter, 'captureHandledError')
          .mockImplementation(() => undefined);
        server.use(
          http.post(`${API_URL}/reading-positions/`, () =>
            HttpResponse.json(throttleBody, { status: 429 })
          )
        );

        await api.updateReadingPosition('GEN', 1);

        expect(handled).toHaveBeenCalledTimes(1);
        const err = handled.mock.calls[0][0];
        expect(err).toBeInstanceOf(api.RateLimitError);
        expect(beforeSendDrops(err)).toBe(true);
      });
  });

  describe('fetchCommentCounts', () => {
    it('chunks requests when noteIds exceeds 200', async () => {
      const noteIds = Array.from(
        { length: 201 },
        (_, i) => `n${i}`
      );
      const result = await api.fetchCommentCounts({ noteIds });
      expect(Object.keys(result).length).toBe(201);
      noteIds.forEach((id) => {
        expect(result[id]).toBe(1);
      });
    });

    it('uses tag_id only and ignores noteIds when tagId is set', async () => {
      let capturedUrl: string | undefined;
      let callCount = 0;
      server.use(
        http.get(
          `${COMMENT_BASE}/comments/counts/`,
          ({ request }) => {
            capturedUrl = request.url;
            callCount++;
            return HttpResponse.json({ counts: { 'note-x': 5 } });
          }
        )
      );
      const noteIds = Array.from(
        { length: 201 },
        (_, i) => `n${i}`
      );
      const result = await api.fetchCommentCounts({
        tagId: 'tag-1',
        noteIds,
      });
      expect(result).toEqual({ 'note-x': 5 });
      expect(callCount).toBe(1);
      expect(capturedUrl).toBeDefined();
      const url = new URL(capturedUrl as string);
      expect(url.searchParams.get('tag_id')).toBe('tag-1');
      expect(url.searchParams.has('note_ids')).toBe(false);
    });
  });

  describe('note images', () => {
    it('uploadNoteImage posts multipart and resolves the ' +
      'image body', async () => {
      const file = new File(
        ['x'], 'photo.png', { type: 'image/png' }
      );
      const img = await api.uploadNoteImage('note-1', file);

      expect(img.id).toBe('img-1');
      expect(img.signed_url).toBe(
        'https://example.com/img-1.png'
      );
      expect(img.content_type).toBe('image/png');
    });

    it('uploadNoteImage posts to the note-scoped endpoint',
      async () => {
        let capturedUrl: string | undefined;
        server.use(
          http.post(
            `${COMMENT_BASE}/notes/:noteId/images/`,
            ({ params, request }) => {
              capturedUrl = request.url;
              return HttpResponse.json(
                { id: 'img-9', note: params.noteId },
                { status: 201 }
              );
            }
          )
        );

        await api.uploadNoteImage(
          'note-42',
          new File(['x'], 'a.png', { type: 'image/png' })
        );

        expect(capturedUrl).toContain(
          '/api/v1/notes/note-42/images/'
        );
      });

    it('uploadNoteImage surfaces the server error body',
      async () => {
        server.use(
          http.post(
            `${COMMENT_BASE}/notes/:noteId/images/`,
            () =>
              HttpResponse.json(
                { file: ['Maximum 10 images per note.'] },
                { status: 400 }
              )
          )
        );

        await expect(
          api.uploadNoteImage(
            'note-1',
            new File(['x'], 'a.png', { type: 'image/png' })
          )
        ).rejects.toThrow('Maximum 10 images per note.');
      });

    it('uploadNoteImage falls back to detail on other ' +
      'failures', async () => {
        server.use(
          http.post(
            `${COMMENT_BASE}/notes/:noteId/images/`,
            () =>
              HttpResponse.json(
                { detail: 'Unsupported type' },
                { status: 415 }
              )
          )
        );

        await expect(
          api.uploadNoteImage(
            'note-1',
            new File(['x'], 'a.txt', { type: 'text/plain' })
          )
        ).rejects.toThrow('Unsupported type');
      });

    it('fetchNoteImages returns the image list', async () => {
      const images = await api.fetchNoteImages('note-1');

      expect(images).toHaveLength(1);
      expect(images[0].id).toBe('img-1');
      expect(images[0].signed_url).toBe(
        'https://example.com/img-1.png'
      );
    });
  });

  describe('getAvailableTranslations', () => {
    const cached: Translation[] = [
      {
        abbr: 'KJV',
        name: 'King James Version',
        language: 'English',
        language_iso: 'eng',
        filesets: [{
          id: 'ENGKJV', type: 'text_plain', size: 'NT',
          codec: null, bitrate: null,
        }],
      },
    ];

    const fresh: Translation[] = [
      ...cached,
      {
        abbr: 'NIV',
        name: 'New International Version',
        language: 'English',
        language_iso: 'eng',
        filesets: [{
          id: 'ENGNIV', type: 'text_plain', size: 'C',
          codec: null, bitrate: null,
        }],
      },
    ];

    // `getAvailableTranslations` injects the bundled `ENGKJV`
    // audio pseudo-fileset into any translation that owns
    // `ENGKJV*` filesets, so the expected result carries it.
    const kjvAudioFileset = {
      id: 'ENGKJV', type: 'audio', size: 'C',
      codec: null, bitrate: null,
    };
    const cachedInjected = [
      {
        ...cached[0],
        filesets: [...cached[0].filesets, kjvAudioFileset],
      },
    ];
    const freshInjected = [cachedInjected[0], fresh[1]];

    beforeEach(() => {
      vi.spyOn(cacheManager, 'getCachedTranslations');
      vi.spyOn(cacheManager, 'cacheTranslations');
    });

    it('returns cached translations without hitting API', async () => {
      vi.spyOn(cacheManager, 'getCachedTranslations')
        .mockReturnValue(cached);
      const fetchSpy = vi.spyOn(global, 'fetch');

      const result = await api.getAvailableTranslations('eng');

      expect(result).toEqual(cachedInjected);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('bypasses cache when forceRefresh=true and updates cache', async () => {
      vi.spyOn(cacheManager, 'getCachedTranslations')
        .mockReturnValue(cached);
      server.use(
        http.get(
          `${API_URL}/bible/translations/`,
          () => HttpResponse.json({ results: fresh })
        )
      );

      const result = await api.getAvailableTranslations('eng', true);

      expect(result).toEqual(freshInjected);
      expect(cacheManager.cacheTranslations)
        .toHaveBeenCalledWith('eng', freshInjected);
    });

    it('throws instead of caching a 200 error body', async () => {
      server.use(
        http.get(
          `${API_URL}/bible/translations/`,
          () => HttpResponse.json({
            error: 'Bible provider error (HTTP 503)',
            error_code: 'provider_error',
          })
        )
      );

      await expect(
        api.getAvailableTranslations('eng', true)
      ).rejects.toThrow(api.ProviderError);
      expect(cacheManager.cacheTranslations)
        .not.toHaveBeenCalled();
    });

    it('throws on a non-OK response and does not cache it',
      async () => {
        vi.spyOn(cacheManager, 'getCachedTranslations')
          .mockReturnValue(null);
        vi.spyOn(console, 'error').mockImplementation(
          () => undefined
        );
        server.use(
          http.get(
            `${API_URL}/bible/translations/`,
            () => HttpResponse.json(
              { detail: 'down' }, { status: 503 }
            )
          )
        );

        await expect(
          api.getAvailableTranslations('eng', true)
        ).rejects.toThrow(api.ProviderError);
        // A failure must never be written to the no-TTL cache as
        // an empty list.
        expect(cacheManager.cacheTranslations)
          .not.toHaveBeenCalled();
      });

    it('throws instead of caching an error body with no ' +
      'results array', async () => {
      vi.spyOn(cacheManager, 'getCachedTranslations')
        .mockReturnValue(null);
      vi.spyOn(console, 'error').mockImplementation(
        () => undefined
      );
      server.use(
        http.get(
          `${API_URL}/bible/translations/`,
          () => HttpResponse.json({ error: 'provider exploded' })
        )
      );

      await expect(
        api.getAvailableTranslations('eng', true)
      ).rejects.toThrow(api.ProviderError);
      expect(cacheManager.cacheTranslations)
        .not.toHaveBeenCalled();
    });

    it('throws instead of caching a 200 error body', async () => {
      server.use(
        http.get(
          `${API_URL}/bible/translations/`,
          () => HttpResponse.json({
            error: 'Bible provider error (HTTP 503)',
            error_code: 'provider_error',
          })
        )
      );

      await expect(
        api.getAvailableTranslations('eng', true)
      ).rejects.toThrow(api.ProviderError);
      expect(cacheManager.cacheTranslations)
        .not.toHaveBeenCalled();
    });

    it('throws RateLimitError for a rate-limit-shaped 200 ' +
      'error body', async () => {
      server.use(
        http.get(
          `${API_URL}/bible/translations/`,
          () => HttpResponse.json({
            error: '(429) Reason: Too Many Requests',
          })
        )
      );

      await expect(
        api.getAvailableTranslations('eng', true)
      ).rejects.toThrow(api.RateLimitError);
      expect(cacheManager.cacheTranslations)
        .not.toHaveBeenCalled();
    });
  });

  describe('fetchHeadingsOnly', () => {
    beforeEach(() => {
      vi.spyOn(cacheManager, 'getCachedHeadings')
        .mockReturnValue(null);
      vi.spyOn(cacheManager, 'cacheHeadings');
    });

    it('returns and caches headings from a 200 response',
      async () => {
        const headings = [
          { before_verse: 1, text: 'The beginning' },
        ];
        server.use(
          http.get(`${API_URL}/bible`, () => {
            return HttpResponse.json({ headings });
          })
        );

        const result = await api.fetchHeadingsOnly(
          'JHN', 3, 'NONKJVFS');

        expect(result).toEqual(headings);
        expect(cacheManager.cacheHeadings).toHaveBeenCalledWith(
          'JHN', 3, 'NONKJVFS', headings);
      });

    it('does not cache a 200 body carrying a `message`',
      async () => {
        server.use(
          http.get(`${API_URL}/bible`, () => {
            return HttpResponse.json({
              verses: [],
              message:
                'No verses found for the specified passage',
            });
          })
        );

        const result = await api.fetchHeadingsOnly(
          'JHN', 3, 'NONKJVFS');

        expect(result).toEqual([]);
        expect(cacheManager.cacheHeadings).not.toHaveBeenCalled();
      });

    it('does not cache a non-OK response', async () => {
      server.use(
        http.get(`${API_URL}/bible`, () => {
          return HttpResponse.json(
            { error: 'provider broke' }, { status: 500 });
        })
      );

      const result = await api.fetchHeadingsOnly(
        'JHN', 3, 'NONKJVFS');

      expect(result).toEqual([]);
      expect(cacheManager.cacheHeadings).not.toHaveBeenCalled();
    });
  });

  describe('searchBibleGrouped', () => {
    it('throws ProviderError when a 200 body carries a ' +
      '`message` and no groups', async () => {
      server.use(
        http.get(`${API_URL}/bible/search/`, () => {
          return HttpResponse.json({
            data: { groups: [] },
            message: 'Search provider unavailable',
          });
        })
      );

      await expect(
        api.searchBibleGrouped('love', 'ENGESV_API')
      ).rejects.toThrow(api.ProviderError);
    });
    it('throws RateLimitError when a 200 `message` body is ' +
      'rate-limit-shaped', async () => {
      server.use(
        http.get(`${API_URL}/bible/search/`, () => {
          return HttpResponse.json({
            data: { groups: [] },
            message:
              'Bible provider rate limit exceeded (HTTP 429)',
          });
        })
      );

      await expect(
        api.searchBibleGrouped('love', 'ENGESV_API')
      ).rejects.toThrow(api.RateLimitError);
    });

    // Ported from main's `searchBible` tests — the merged api
    // exposes only `searchBibleGrouped`.
    it('throws RateLimitError on 429', async () => {
      server.use(
        http.get(`${API_URL}/bible/search/`, () =>
          HttpResponse.json(
            { error: 'throttled', error_code: 'rate_limited' },
            { status: 429 }
          )
        )
      );

      await expect(
        api.searchBibleGrouped('love', 'ENGESV_API')
      ).rejects.toThrow(api.RateLimitError);
    });

    it('throws ProviderError when a 200 body ' +
      'carries error/error_code', async () => {
      server.use(
        http.get(`${API_URL}/bible/search/`, () =>
          HttpResponse.json({
            error: 'upstream exploded',
            error_code: 'provider_error',
          })
        )
      );

      await expect(
        api.searchBibleGrouped('love', 'ENGESV_API')
      ).rejects.toThrow(api.ProviderError);
    });

    it('attaches code, status and endpoint to a ' +
      '200-wrapped error body', async () => {
      server.use(
        http.get(`${API_URL}/bible/search/`, () =>
          HttpResponse.json({
            error: 'upstream exploded',
            error_code: 'provider_error',
          })
        )
      );

      const err = await api
        .searchBibleGrouped('love', 'ENGESV_API')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(api.ProviderError);
      // Query stays out of the endpoint — it carries the
      // raw search text.
      expect(api.errorDetailsOf(err)).toEqual({
        code: 'provider_error',
        status: 200,
        endpoint: '/api/v1/bible/search/',
      });
    });

    it('attaches status and endpoint to a 200 `message` ' +
      'failure', async () => {
      server.use(
        http.get(`${API_URL}/bible/search/`, () =>
          HttpResponse.json({
            data: { groups: [] },
            message: 'Search provider unavailable',
          })
        )
      );

      const err = await api
        .searchBibleGrouped('love', 'ENGESV_API')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(api.ProviderError);
      expect(api.errorDetailsOf(err)).toEqual({
        code: undefined,
        status: 200,
        endpoint: '/api/v1/bible/search/',
      });
    });

    it('throws RateLimitError when a 200 `message` body is ' +
      'rate-limit-shaped', async () => {
      server.use(
        http.get(`${API_URL}/bible/search/`, () => {
          return HttpResponse.json({
            data: { groups: [] },
            message:
              'Bible provider rate limit exceeded (HTTP 429)',
          });
        })
      );

      await expect(
        api.searchBibleGrouped('love', 'ENGESV_API')
      ).rejects.toThrow(api.RateLimitError);
    });

    it('follows next_cursor and merges split book groups ' +
      'in canonical order', async () => {
      const seen: (string | null)[] = [];
      server.use(
        http.get(`${API_URL}/bible/search/`, ({ request }) => {
          const cursor =
            new URL(request.url).searchParams.get('cursor');
          seen.push(cursor);
          if (!cursor) {
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
                        verse_text: 'gen 1:1',
                      },
                    ],
                  },
                  {
                    book_id: 'EXO',
                    count: 1,
                    verses: [
                      {
                        book_id: 'EXO',
                        chapter: 2,
                        verse_start: 5,
                        verse_text: 'exo 2:5',
                      },
                    ],
                  },
                ],
                meta: {
                  total: 2,
                  truncated: true,
                  next_cursor: 'djE6MQ==',
                  progress: {
                    chapters_scanned: 10,
                    chapters_total: 20,
                  },
                },
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
                      chapter: 3,
                      verse_start: 2,
                      verse_text: 'gen 3:2',
                    },
                  ],
                },
                {
                  book_id: 'LEV',
                  count: 1,
                  verses: [
                    {
                      book_id: 'LEV',
                      chapter: 1,
                      verse_start: 1,
                      verse_text: 'lev 1:1',
                    },
                  ],
                },
              ],
              meta: {
                // Per-window match count, like the real
                // SWORD provider emits — the client must
                // accumulate across windows.
                total: 2,
                truncated: false,
                progress: {
                  chapters_scanned: 20,
                  chapters_total: 20,
                },
              },
            },
          });
        })
      );

      const progress: { scanned: number; total: number }[] = [];
      const res = await api.searchBibleGrouped(
        'love', 'LVSGLU8', undefined,
        (p) =>
          progress.push({
            scanned: p.chapters_scanned,
            total: p.chapters_total,
          })
      );

      // Exactly two requests; the second carried the cursor.
      expect(seen).toEqual([null, 'djE6MQ==']);
      // Groups merged by book_id, first-seen canonical order,
      // verses sorted by (chapter, verse_start).
      expect(res.groups.map((g) => g.book_id)).toEqual([
        'GEN', 'EXO', 'LEV']);
      const gen = res.groups[0];
      expect(gen.count).toBe(2);
      expect(
        gen.verses.map((v) => `${v.chapter}:${v.verse_start}`)
      ).toEqual(['1:1', '3:2']);
      // Final meta comes from the last window.
      expect(res.meta.total).toBe(4);
      expect(res.meta.truncated).toBe(false);
      // Progress surfaced per window.
      expect(progress).toEqual([
        { scanned: 10, total: 20 },
        { scanned: 20, total: 20 },
      ]);
    });

    it('does not loop when meta.next_cursor is absent',
      async () => {
        let calls = 0;
        server.use(
          http.get(`${API_URL}/bible/search/`, () => {
            calls += 1;
            return HttpResponse.json({
              data: {
                groups: [],
                meta: { total: 0, truncated: false },
              },
            });
          })
        );

        const res = await api.searchBibleGrouped(
          'zzz', 'LVSGLU8');

        expect(calls).toBe(1);
        expect(res.meta).toEqual({ total: 0, truncated: false });
      });

    it('stops when the server repeats the same next_cursor',
      async () => {
        let calls = 0;
        server.use(
          http.get(`${API_URL}/bible/search/`, () => {
            calls += 1;
            return HttpResponse.json({
              data: {
                groups: [],
                meta: {
                  total: 0,
                  truncated: true,
                  // Same token every window — a server that
                  // cannot advance must not loop the client.
                  next_cursor: 'djE6MQ==',
                },
              },
            });
          })
        );

        const res = await api.searchBibleGrouped(
          'love', 'LVSGLU8');

        expect(calls).toBe(2);
        expect(res.meta.truncated).toBe(true);
      });

    it('aborts between windows when the signal fires',
      async () => {
        let calls = 0;
        server.use(
          http.get(`${API_URL}/bible/search/`, () => {
            calls += 1;
            return HttpResponse.json({
              data: {
                groups: [],
                meta: {
                  total: 0,
                  truncated: true,
                  next_cursor: 'djE6MQ==',
                  progress: {
                    chapters_scanned: 1,
                    chapters_total: 2,
                  },
                },
              },
            });
          })
        );

        const controller = new AbortController();
        await expect(
          api.searchBibleGrouped(
            'love', 'LVSGLU8', controller.signal,
            () => controller.abort())
        ).rejects.toMatchObject({ name: 'AbortError' });
        // The second window's request never fired — abort
        // between windows short-circuits the loop.
        expect(calls).toBe(1);
      });

    it('throws SearchDisabledError on a 403 ' +
      'search_disabled body', async () => {
      server.use(
        http.get(`${API_URL}/bible/search/`, () =>
          HttpResponse.json(
            {
              error: 'Search is disabled',
              error_code: 'search_disabled',
            },
            { status: 403 }
          )
        )
      );

      await expect(
        api.searchBibleGrouped('love', 'LVSGLU8')
      ).rejects.toThrow(api.SearchDisabledError);
    });

    it('throws SearchDisabledError when a 200 body carries ' +
      'search_disabled', async () => {
      server.use(
        http.get(`${API_URL}/bible/search/`, () =>
          HttpResponse.json({
            error: 'Search is disabled',
            error_code: 'search_disabled',
          })
        )
      );

      await expect(
        api.searchBibleGrouped('love', 'LVSGLU8')
      ).rejects.toThrow(api.SearchDisabledError);
    });
  });

  describe('notes mutation cache invalidation', () => {
    it('addTagNote clears the tag cache on create', async () => {
      const clearSpy = vi.spyOn(cacheManager, 'clearNotesCache');

      await api.addTagNote('tag-9', 'hello', []);

      expect(clearSpy).toHaveBeenCalledWith('tag-9');
    });

    it('editNote clears all notes cache on update', async () => {
      const clearSpy = vi.spyOn(cacheManager, 'clearNotesCache');
      server.use(
        http.patch(`${API_URL}/notes/:id`, () =>
          HttpResponse.json({ id: 'note-1' })
        )
      );

      await api.editNote('note-1', 'tag-9', 'hello');

      expect(clearSpy).toHaveBeenCalledWith();
    });
  });

  describe('searchLanguages', () => {
    const row = {
      iso: 'spa',
      name: 'Spanish',
      autonym: 'español',
      bibles: 42,
      filesets: 84,
    };

    beforeEach(() => {
      vi.spyOn(cacheManager, 'getCachedLanguageSearch')
        .mockReturnValue(null);
      vi.spyOn(cacheManager, 'cacheLanguageSearch');
    });

    it('passes search, page and limit through to the query ' +
      'string and caches the page', async () => {
      let capturedUrl: string | undefined;
      server.use(
        http.get(
          `${API_URL}/bible/languages/`,
          ({ request }) => {
            capturedUrl = request.url;
            return HttpResponse.json({ results: [row] });
          }
        )
      );

      const result = await api.searchLanguages('spa', 1, 150);

      expect(result).toEqual([row]);
      const url = new URL(capturedUrl as string);
      expect(url.searchParams.get('search')).toBe('spa');
      expect(url.searchParams.get('page')).toBe('1');
      expect(url.searchParams.get('limit')).toBe('150');
      expect(cacheManager.cacheLanguageSearch)
        .toHaveBeenCalledWith('spa:1:150', [row]);
    });

    it('omits limit from the query string when not ' +
      'provided', async () => {
      let capturedUrl: string | undefined;
      server.use(
        http.get(
          `${API_URL}/bible/languages/`,
          ({ request }) => {
            capturedUrl = request.url;
            return HttpResponse.json({ results: [row] });
          }
        )
      );

      await api.searchLanguages('spa');

      const url = new URL(capturedUrl as string);
      expect(url.searchParams.has('limit')).toBe(false);
    });

    it('does not cache a non-OK error response', async () => {
      server.use(
        http.get(`${API_URL}/bible/languages/`, () =>
          HttpResponse.json(
            {
              error: 'Rate limited',
              error_code: 'rate_limited',
            },
            { status: 429 }
          )
        )
      );

      const result = await api.searchLanguages('spa');

      expect(result).toEqual([]);
      expect(cacheManager.cacheLanguageSearch)
        .not.toHaveBeenCalled();
    });

    it('does not cache a 200 response wrapping an error ' +
      'body', async () => {
      server.use(
        http.get(`${API_URL}/bible/languages/`, () =>
          HttpResponse.json({
            error: 'DBT upstream failed',
            error_code: 'provider_error',
          })
        )
      );

      const result = await api.searchLanguages('spa');

      expect(result).toEqual([]);
      expect(cacheManager.cacheLanguageSearch)
        .not.toHaveBeenCalled();
    });

    it('does not cache an empty results page', async () => {
      server.use(
        http.get(`${API_URL}/bible/languages/`, () =>
          HttpResponse.json({ results: [] })
        )
      );

      const result = await api.searchLanguages('zzzzz');

      expect(result).toEqual([]);
      expect(cacheManager.cacheLanguageSearch)
        .not.toHaveBeenCalled();
    });

    it('returns a cached page without hitting the API',
      async () => {
        vi.spyOn(cacheManager, 'getCachedLanguageSearch')
          .mockReturnValue([row]);
        const fetchSpy = vi.spyOn(global, 'fetch');

        const result = await api.searchLanguages('spa');

        expect(result).toEqual([row]);
        expect(fetchSpy).not.toHaveBeenCalled();
      });
  });

  describe('getBulkReadingPositions', () => {
    it('retries a network failure once — the bulk ' +
      'endpoint is a read-only POST', async () => {
        let calls = 0;
        server.use(
          http.post(
            `${API_URL}/reading-positions/bulk/`,
            () => {
              calls += 1;
              if (calls === 1) {
                return HttpResponse.error();
              }
              return HttpResponse.json({
                John: { chapter: 3, verse: 16 },
              });
            }
          )
        );

        const result = await api.getBulkReadingPositions(
          ['JHN']
        );

        expect(calls).toBe(2);
        expect(result).toEqual({
          JHN: { chapter: 3, verse: 16 },
        });
      });

    it('fails soft and reports once when the network ' +
      'failure persists', async () => {
        const handled = vi
          .spyOn(errorReporter, 'captureHandledError')
          .mockImplementation(() => undefined);
        let calls = 0;
        server.use(
          http.post(
            `${API_URL}/reading-positions/bulk/`,
            () => {
              calls += 1;
              return HttpResponse.error();
            }
          )
        );

        const result = await api.getBulkReadingPositions(
          ['JHN']
        );

        expect(calls).toBe(2);
        expect(result).toEqual({});
        expect(handled).toHaveBeenCalledTimes(1);
      });

    it('does not retry a non-OK HTTP response', async () => {
      const handled = vi
        .spyOn(errorReporter, 'captureHandledError')
        .mockImplementation(() => undefined);
      let calls = 0;
      server.use(
        http.post(
          `${API_URL}/reading-positions/bulk/`,
          () => {
            calls += 1;
            return HttpResponse.json(
              {
                error: 'boom',
                error_code: 'provider_error',
              },
              { status: 500 }
            );
          }
        )
      );

      const result = await api.getBulkReadingPositions(['JHN']);

      expect(calls).toBe(1);
      expect(result).toEqual({});
      expect(handled).toHaveBeenCalledTimes(1);
    });
  });
});
