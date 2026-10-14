import { act, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { API_BASE_URL } from '../config';
import PassageView from './PassageView';
import {
  flushPromises,
  renderWithProviders,
} from '../__tests__/helpers';
import { useBibleStore, type Translation } from '../store';
import * as api from '../api';

// Split-testament translation — both members are present.
const splitTranslation: Translation = {
  abbr: 'ENGWWH',
  name: 'World English Test',
  language: 'English',
  language_iso: 'eng',
  filesets: [
    { id: 'EN1WEBO_ET', type: 'text_plain', size: 'OT',
      codec: null, bitrate: null },
    { id: 'EN1WEBN_ET', type: 'text_plain', size: 'NT',
      codec: null, bitrate: null },
  ],
};

// NT-only translation: the resolver has no OT member to hop to,
// so requesting GEN (OT) is a genuine coverage miss — the
// backend answers 404 with `book_not_in_fileset`.
const ntOnlyTranslation: Translation = {
  ...splitTranslation,
  filesets: [
    { id: 'EN1WEBN_ET', type: 'text_plain', size: 'NT',
      codec: null, bitrate: null },
  ],
};

const useBibleHandler = (body: object, status = 200) =>
  server.use(
    http.get(`${API_BASE_URL}/api/v1/bible`, ({ request }) => {
      const url = new URL(request.url);
      if (
        url.searchParams.get('response_format') === 'audio'
      ) {
        return HttpResponse.json({
          audio_url: 'http://audio.url/test.mp3',
        });
      }
      return HttpResponse.json(body, { status });
    }),
  );

describe('PassageView error display', () => {
  it('shows the coverage mismatch hint instead of "Provider ' +
    'Unavailable" for a book_not_in_fileset miss', async () => {
      useBibleHandler(
        {
          error: 'Book not available in this fileset',
          error_code: 'book_not_in_fileset',
        },
        404,
      );

      renderWithProviders(<PassageView />, {
        storeOverrides: {
          activeBookId: 'GEN',
          activeChapter: 1,
          activeTextFilesetId: 'EN1WEBN_ET',
          translations: [ntOnlyTranslation],
        },
      });

      // A coverage miss is a ProviderError subclass but must not
      // use the provider-error title — the body points at the
      // testament mismatch instead.
      await waitFor(() =>
        expect(
          screen.getByText('Failed to load text'),
        ).toBeInTheDocument(),
      );
      expect(
        screen.queryByText('Provider Unavailable'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/only covers the New Testament/),
      ).toBeInTheDocument();
    },
  );

  it('still shows "Provider Unavailable" for provider errors',
    async () => {
      useBibleHandler({
        message: 'The provider is exhausted',
        verses: [],
      });

      renderWithProviders(<PassageView />, {
        storeOverrides: {
          activeBookId: 'GEN',
          activeChapter: 1,
          activeTextFilesetId: 'EN1WEBO_ET',
          translations: [splitTranslation],
        },
      });

      await waitFor(() =>
        expect(
          screen.getByText('Provider Unavailable'),
        ).toBeInTheDocument(),
      );
    },
  );

  it('shows a "no content" hint for KJV instead of a blank ' +
    'page', async () => {
      // ENGKJV reads the bundled JSON — a chapter the structure
      // doesn't have (or a failed load) must not render empty.
      renderWithProviders(<PassageView />, {
        storeOverrides: {
          activeBookId: 'JHN',
          activeChapter: 999,
          activeTextFilesetId: 'ENGKJV',
          translations: [],
        },
      });

      await waitFor(() =>
        expect(
          screen.getByText('No content for John 999'),
        ).toBeInTheDocument(),
      );
    },
  );
});

describe('PassageView audio prefetch effect', () => {
  it('does not refire the text fetch when only the audio ' +
    'version changes', async () => {
      const fetchSpy = vi.spyOn(api, 'getVersesInChapter');
      renderWithProviders(<PassageView />, {
        storeOverrides: {
          activeBookId: 'JHN',
          activeChapter: 3,
          activeTextFilesetId: 'ENGKJV',
          activeAudioFilesetId: 'ENGKJV',
          translations: [],
        },
      });

      await waitFor(() =>
        expect(
          screen.getByTitle('passage-verse-3-16'),
        ).toBeInTheDocument(),
      );
      const callsAfterLoad = fetchSpy.mock.calls.length;

      act(() => {
        useBibleStore.setState({
          activeAudioFilesetId: 'ENGNIVC1DA',
        });
      });
      await act(async () => {
        await flushPromises();
      });

      // The audio prefetch effect refires, but the chapter
      // fetch/loading effect must not.
      expect(fetchSpy.mock.calls.length).toBe(callsAfterLoad);
      fetchSpy.mockRestore();
    },
  );
});

describe('PassageView pendingScrollVerse', () => {
  const kjvView = {
    activeBookId: 'JHN',
    activeChapter: 1,
    activeTextFilesetId: 'ENGKJV',
    translations: [],
  };

  it('clears a pending position only when the book matches',
    async () => {
      renderWithProviders(<PassageView />, {
        storeOverrides: {
          ...kjvView,
          pendingScrollVerse: {
            bookId: 'MRK',
            chapter: 1,
            verse: 5,
          },
        },
      });

      await waitFor(() =>
        expect(
          screen.getByTitle('passage-verse-1-1'),
        ).toBeInTheDocument(),
      );
      // The pending MRK position belongs to a different book —
      // the JHN load must not discard it.
      expect(
        useBibleStore.getState().pendingScrollVerse,
      ).toEqual({ bookId: 'MRK', chapter: 1, verse: 5 });
    },
  );

  it('consumes a pending position matching the loaded chapter',
    async () => {
      renderWithProviders(<PassageView />, {
        storeOverrides: {
          ...kjvView,
          pendingScrollVerse: {
            bookId: 'JHN',
            chapter: 1,
            verse: 5,
          },
        },
      });

      await waitFor(() =>
        expect(
          screen.getByTitle('passage-verse-1-1'),
        ).toBeInTheDocument(),
      );
      expect(
        useBibleStore.getState().pendingScrollVerse,
      ).toBeNull();
    },
  );
});
