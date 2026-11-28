import { describe, it, expect, beforeEach } from 'vitest';
import {
  isChapterCoveredForAbbr,
  isChapterCoveredForFileset,
  registerStructureCoverage,
  resetStructureCoverage,
} from './structureCoverage';
import {
  cacheStructure,
  clearStructureCache,
  resetStorageCacheForTests,
} from './cacheManager';
import type {
  BibleStructure,
  Fileset,
  Translation,
} from '../types';

/** Psalms + NT only — the real LAVLVR coverage shape (no Job). */
const lavlvrStructure: BibleStructure = {
  books: [
    {
      book_id: 'PSA',
      name: 'Psalms',
      name_short: 'Psa',
      testament: 'OT',
      chapters: [1, 2, 150],
    },
    {
      book_id: 'JHN',
      name: 'John',
      name_short: 'John',
      testament: 'NT',
      chapters: [1, 3],
    },
  ],
};

const fs = (
  id: string,
  type: Fileset['type'],
  size: string,
): Fileset => ({ id, type, size, codec: null, bitrate: null });

const LAVLVR: Translation = {
  abbr: 'LAVLVR',
  name: 'Latvian Audio',
  language: 'Latvian',
  language_iso: 'lvs',
  filesets: [
    fs('LATLVRP1DA', 'audio', 'OTP'),
    fs('LATLVRP1DA-opus16', 'audio', 'OTP'),
    fs('LATLVRN1DA', 'audio', 'NT'),
    fs('LATLVRN1DA-opus16', 'audio', 'NT'),
  ],
};

beforeEach(() => {
  resetStructureCoverage();
  resetStorageCacheForTests();
  clearStructureCache();
});

describe('isChapterCoveredForAbbr', () => {
  it('returns true for an unknown abbr — covered-when-unknown',
    () => {
      expect(
        isChapterCoveredForAbbr('NOPE', 'JOB', 14)
      ).toBe(true);
      expect(
        isChapterCoveredForAbbr(null, 'JOB', 14)
      ).toBe(true);
      expect(
        isChapterCoveredForAbbr(undefined, 'JOB', 14)
      ).toBe(true);
    },
  );

  it('answers from a registered structure', () => {
    registerStructureCoverage('LAVLVR', lavlvrStructure);
    expect(
      isChapterCoveredForAbbr('LAVLVR', 'JOB', 14)
    ).toBe(false);
    expect(
      isChapterCoveredForAbbr('LAVLVR', 'PSA', 150)
    ).toBe(true);
    expect(
      isChapterCoveredForAbbr('LAVLVR', 'PSA', 100)
    ).toBe(false);
  });

  it('falls back to the localStorage structure tier', () => {
    cacheStructure('LAVLVR', lavlvrStructure);
    expect(
      isChapterCoveredForAbbr('LAVLVR', 'JOB', 14)
    ).toBe(false);
    expect(
      isChapterCoveredForAbbr('LAVLVR', 'JHN', 3)
    ).toBe(true);
  });
});

describe('isChapterCoveredForFileset', () => {
  it('always covers bundled KJV wordpocket audio', () => {
    expect(
      isChapterCoveredForFileset('ENGKJV', 'JOB', 14, [])
    ).toBe(true);
  });

  it('always covers a null fileset id', () => {
    expect(
      isChapterCoveredForFileset(null, 'JOB', 14, [LAVLVR])
    ).toBe(true);
  });

  it('resolves the owning bible of a raw member id', () => {
    registerStructureCoverage('LAVLVR', lavlvrStructure);
    expect(
      isChapterCoveredForFileset(
        'LATLVRP1DA', 'JOB', 14, [LAVLVR],
      )
    ).toBe(false);
    expect(
      isChapterCoveredForFileset(
        'LATLVRN1DA', 'JHN', 3, [LAVLVR],
      )
    ).toBe(true);
  });

  it('resolves the owner of an -opus16 codec variant and a ' +
    'grouped product id', () => {
      registerStructureCoverage('LAVLVR', lavlvrStructure);
      expect(
        isChapterCoveredForFileset(
          'LATLVRP1DA-opus16', 'JOB', 14, [LAVLVR],
        )
      ).toBe(false);
      expect(
        isChapterCoveredForFileset(
          'LAVLVR:audio:1', 'JOB', 14, [LAVLVR],
        )
      ).toBe(false);
    },
  );

  it('covers when the owner cannot be resolved', () => {
    // The reported residual case is the inverse — a KNOWN
    // absent coverage. An unresolvable owner must never skip.
    expect(
      isChapterCoveredForFileset('FOO1DA', 'JOB', 14, [LAVLVR])
    ).toBe(true);
    expect(
      isChapterCoveredForFileset(
        'LATLVRP1DA', 'JOB', 14, [],
      )
    ).toBe(true);
  });
});
