import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { API_BASE_URL } from '../config';
import PassageView from './PassageView';
import { renderWithProviders } from '../__tests__/helpers';
import type { Translation } from '../store';

// NT-only member selection on a split-testament translation —
// requesting GEN (OT) makes the backend answer 404 with
// `book_not_in_fileset`.
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
          translations: [splitTranslation],
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
});
