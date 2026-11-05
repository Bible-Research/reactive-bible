import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { API_BASE_URL } from '../config';
import ScripturePassage from './ScripturePassage';
import { renderWithProviders } from '../__tests__/helpers';

describe('ScripturePassage', () => {
  it('renders every heading anchored before the same verse',
    async () => {
      // Sentry 158512450: ESV Psalm 18 returns both the
      // section heading and the superscription at
      // before_verse 1 — a .find() would drop the second.
      server.use(
        http.get(`${API_BASE_URL}/api/v1/bible`, () =>
          HttpResponse.json({
            verses: [
              {
                verse: 1,
                text: 'I love you, O LORD, my strength.',
              },
            ],
            headings: [
              {
                before_verse: 1,
                text: 'The Lord Is My Rock and My Fortress',
              },
              {
                before_verse: 1,
                text: 'To the choirmaster. A Psalm of David.',
              },
            ],
          })
        )
      );

      renderWithProviders(
        <ScripturePassage
          reference={{
            book: 'Psalms',
            chapter: 18,
            verses: [1],
          }}
        />
      );

      await waitFor(() =>
        expect(
          screen.getByText(
            'The Lord Is My Rock and My Fortress'
          ),
        ).toBeInTheDocument(),
      );
      expect(
        screen.getByText(
          'To the choirmaster. A Psalm of David.'
        ),
      ).toBeInTheDocument();
    },
  );
});
