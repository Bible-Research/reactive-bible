import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import VerseActionToolbar from './VerseActionToolbar';
import { renderWithProviders } from '../__tests__/helpers';
import { buildShareText } from '../utils/externalLinks';

// "Add note" opens this lazily-imported modal (TipTap); keep it
// out of the test entirely.
vi.mock('./AddTagNoteModal', () => ({ default: () => null }));

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
