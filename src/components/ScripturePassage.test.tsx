import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { API_BASE_URL } from '../config';
import ScripturePassage from './ScripturePassage';
import { renderWithProviders } from '../__tests__/helpers';

/** Captures the fileset_id of every /bible request. */
const captureFilesetIds = (): string[] => {
  const seen: string[] = [];
  server.use(
    http.get(`${API_BASE_URL}/api/v1/bible`, ({ request }) => {
      seen.push(
        new URL(request.url).searchParams.get('fileset_id') ?? ''
      );
      return HttpResponse.json({ verses: [], headings: [] });
    })
  );
  return seen;
};

const jhn316 = {
  book: 'John',
  chapter: 3,
  verses: [16],
};

describe('ScripturePassage', () => {
  it('fetches the preview in the selected translation', async () => {
    const seen = captureFilesetIds();
    renderWithProviders(
      <ScripturePassage reference={jhn316} />,
      { storeOverrides: { activeTextFilesetId: 'LVSGLU8' } }
    );

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0]).toBe('LVSGLU8');
  });

  it('fetches the preview in the pinned translation when ' +
    'an override is set', async () => {
      const seen = captureFilesetIds();
      renderWithProviders(
        <ScripturePassage reference={jhn316} />,
        {
          storeOverrides: {
            activeTextFilesetId: 'LVSGLU8',
            noteRefFilesetId: 'RUSSYN',
          },
        }
      );

      await waitFor(() => expect(seen.length).toBeGreaterThan(0));
      expect(seen[0]).toBe('RUSSYN');
    });

  it('resolves the display-name book to USFM before ' +
    'picking a testament member', async () => {
      // reference.book is a DISPLAY name ('John') — without
      // the toUsfmCode hop, getTestament('John') is null and a
      // testament-split product id collapses to its OT member.
      const esv = {
        abbr: 'ENGESV',
        name: 'English Standard Version',
        language: 'English',
        language_iso: 'eng',
        filesets: [
          {
            id: 'ENGESVO_ET',
            type: 'text_plain' as const,
            size: 'OT',
            codec: null,
            bitrate: null,
          },
          {
            id: 'ENGESVN_ET',
            type: 'text_plain' as const,
            size: 'NT',
            codec: null,
            bitrate: null,
          },
        ],
      };
      const seen = captureFilesetIds();
      renderWithProviders(
        <ScripturePassage reference={jhn316} />,
        {
          storeOverrides: {
            translations: [esv],
            activeTextFilesetId: 'ENGESV:text:1',
          },
        }
      );

      await waitFor(() => expect(seen.length).toBeGreaterThan(0));
      expect(seen[0]).toBe('ENGESVN_ET');
    });

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
