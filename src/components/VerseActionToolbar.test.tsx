import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { showNotification } from '@mantine/notifications';
import VerseActionToolbar from './VerseActionToolbar';
import { renderWithProviders } from '../__tests__/helpers';
import { buildShareText } from '../utils/externalLinks';
import {
  setActiveStructure,
  resetActiveStructure,
} from '../utils/bookNameRegistry';

// "Add note" opens this lazily-imported modal (TipTap); keep it
// out of the test entirely.
vi.mock('./AddTagNoteModal', () => ({ default: () => null }));

vi.mock(
  '@mantine/notifications',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    showNotification: vi.fn(),
  })
);

// URL-builder coverage (YouVersion, BibleHub, BLB,
// BibleMapper) lives in ../utils/externalLinks.test.ts —
// the builders moved there with the externalLinks
// extraction.
describe('buildShareText', () => {
  it('includes scraped verse text when present', () => {
    expect(
      buildShareText(
        'For God so loved the world',
        'John 3:16',
        'https://app.test/bible/JHN.3.16'
      )
    ).toBe(
      'For God so loved the world\n\n' +
        'John 3:16\n\n' +
        'https://app.test/bible/JHN.3.16'
    );
  });

  it('falls back to the bare reference when no verse text ' +
    'was scraped', () => {
      expect(
        buildShareText(
          '',
          'John 3:16-18',
          'https://app.test/bible/JHN.3.16-18'
        )
      ).toBe(
        'John 3:16-18\n\nhttps://app.test/bible/JHN.3.16-18'
      );
    });
});

describe('external-link favicons', () => {
  const selectedBibleState = {
    verseSelection: {
      scope: 'bible',
      refs: [{ bookId: 'JHN', chapter: 3, verse: 16 }],
    },
  };

  it('hides the icon instead of showing a broken image ' +
    'when the favicon fails to load', () => {
      renderWithProviders(<VerseActionToolbar />, {
        stores: { bible: selectedBibleState },
      });

      const img = screen.getByAltText('BibleMapper');
      expect(img).toBeVisible();

      fireEvent.error(img);

      expect(img).not.toBeVisible();
      // The button itself stays clickable — only the
      // decorative icon is dropped.
      expect(
        screen.getByTitle('Copy passage & open WebViewer')
      ).toBeInTheDocument();
    });
});

describe('VerseActionToolbar auth gating', () => {
  const selectedBibleState = {
    verseSelection: {
      scope: 'bible',
      refs: [{ bookId: 'JHN', chapter: 3, verse: 16 }],
    },
  };

  it('hides the Add-note action for anonymous visitors', () => {
    renderWithProviders(<VerseActionToolbar />, {
      stores: {
        bible: selectedBibleState,
        auth: { isAuthenticated: false, user: null, token: null },
      },
    });

    expect(
      screen.queryByTitle('Add note')
    ).not.toBeInTheDocument();
    // Read-only affordances stay visible.
    expect(
      screen.getByTitle('Share this passage')
    ).toBeInTheDocument();
  });

  it('shows the Add-note action when authenticated', () => {
    renderWithProviders(<VerseActionToolbar />, {
      stores: {
        bible: selectedBibleState,
        auth: {
          isAuthenticated: true,
          token: 'test-token',
          user: { username: 'testuser' },
        },
      },
    });

    expect(screen.getByTitle('Add note')).toBeInTheDocument();
  });
});

describe('BibleMapper clipboard copy', () => {
  const selectedBibleState = {
    verseSelection: {
      scope: 'bible',
      refs: [{ bookId: 'JHN', chapter: 3, verse: 16 }],
    },
  };

  const setNavigator = (
    key: 'share' | 'clipboard',
    value: unknown
  ) =>
    Object.defineProperty(window.navigator, key, {
      value,
      configurable: true,
      writable: true,
    });

  afterEach(() => {
    resetActiveStructure();
    setNavigator('share', undefined);
    setNavigator('clipboard', undefined);
    vi.restoreAllMocks();
  });

  it('copies the English ref while share/notification ' +
    'copy stays localized', async () => {
      // A Latvian structure is active: JHN displays as
      // "Jāņa evaņģēlijs".
      setActiveStructure({
        books: [{
          book_id: 'JHN',
          name: 'Jāņa evaņģēlijs',
          name_short: 'Jņ',
          testament: 'NT',
          chapters: [3],
        }],
      });
      const writeText = vi.fn().mockResolvedValue(undefined);
      const share = vi.fn().mockResolvedValue(undefined);
      const open = vi
        .spyOn(window, 'open')
        .mockImplementation(() => null);
      setNavigator('clipboard', { writeText });
      setNavigator('share', share);
      renderWithProviders(<VerseActionToolbar />, {
        stores: { bible: selectedBibleState },
      });

      await userEvent.click(
        screen.getByTitle('Copy passage & open WebViewer')
      );
      // BibleMapper is an English-language tool — the
      // pasted ref is English even under a Latvian
      // structure, like every external-link surface.
      await vi.waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('John 3:16');
      });
      expect(open).toHaveBeenCalled();
      // The toast echoes what actually landed on the
      // clipboard — the English ref, not the localized
      // display name.
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'John 3:16 copied to clipboard',
        })
      );

      // The share surfaces keep the localized display name.
      await userEvent.click(
        screen.getByTitle('Share this passage')
      );
      await vi.waitFor(() => {
        expect(share).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Jāņa evaņģēlijs 3:16',
            text: expect.stringContaining(
              'Jāņa evaņģēlijs 3:16'
            ),
          })
        );
      });
    });
});
