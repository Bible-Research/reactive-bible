import { describe, it, expect } from 'vitest';
import { buildShareText } from '../utils/externalLinks';

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
