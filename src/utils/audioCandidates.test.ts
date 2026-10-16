import { describe, it, expect } from 'vitest';
import { orderedAudioCandidates } from './audioCandidates';
import type { Fileset, Translation } from '../store';

const fs = (
  id: string,
  type: Fileset['type'],
  size: string,
): Fileset => ({ id, type, size, codec: null, bitrate: null });

const tr = (
  abbr: string,
  filesets: Fileset[],
): Translation => ({
  abbr,
  name: abbr,
  language: 'Test',
  language_iso: 'eng',
  filesets,
});

// Split-testament audio product, both codecs per testament.
const ENGESH = tr('ENGESH', [
  fs('ENGESHO1DA', 'audio', 'OT'),
  fs('ENGESHO1DA-opus16', 'audio', 'OT'),
  fs('ENGESHN1DA', 'audio', 'NT'),
  fs('ENGESHN1DA-opus16', 'audio', 'NT'),
]);

// The timestamped ESV DBT recording lives in a separate product
// from the "Hear the Word" audio (ENGESHO1DA -> ENGESVO1DA in
// TIMESTAMP_BACKED_AUDIO).
const ENGESV = tr('ENGESV', [
  fs('ENGESVO1DA', 'audio', 'OT'),
  fs('ENGESVO1DA-opus16', 'audio', 'OT'),
  fs('ENGESVN1DA', 'audio', 'NT'),
  fs('ENGESVN1DA-opus16', 'audio', 'NT'),
]);

describe('orderedAudioCandidates', () => {
  it('returns [] when the selection resolves to nothing', () => {
    expect(
      orderedAudioCandidates(null, 'JHN', [ENGESH]),
    ).toEqual([]);
  });

  it('passes ENGKJV through as the only candidate', () => {
    expect(
      orderedAudioCandidates('ENGKJV', 'JHN', [ENGESH]),
    ).toEqual(['ENGKJV']);
  });

  it('passes an unknown id through unchanged', () => {
    // Stale persisted ids keep working as before — the bare id
    // is the only candidate.
    expect(
      orderedAudioCandidates('FOO1DA', 'JHN', [ENGESH]),
    ).toEqual(['FOO1DA']);
  });

  it('leads with the preferred codec and orders alternates ' +
    'mp3-sibling, other-testament, then resolved id', () => {
      expect(
        orderedAudioCandidates('ENGESHN1DA', 'JHN', [ENGESH]),
      ).toEqual([
        'ENGESHN1DA-opus16',
        'ENGESHN1DA',
        'ENGESHO1DA-opus16',
        'ENGESHO1DA',
      ]);
    },
  );

  it('resolves the same-testament member for a book', () => {
    // An NT selection loading an OT book hops to the OT members.
    expect(
      orderedAudioCandidates('ENGESHN1DA', 'GEN', [ENGESH]),
    ).toEqual([
      'ENGESHO1DA-opus16',
      'ENGESHO1DA',
      'ENGESHN1DA-opus16',
      'ENGESHN1DA',
    ]);
  });

  it('leads with the timestamp-backed sibling when it is ' +
    'loaded', () => {
      // Issue #57: ENGESHO1DA has no DBT timestamps; the swap to
      // ENGESVO1DA keeps the resolved id as a fallback.
      expect(
        orderedAudioCandidates(
          'ENGESHN1DA',
          'GEN',
          [ENGESH, ENGESV],
        ),
      ).toEqual([
        'ENGESVO1DA-opus16',
        'ENGESHO1DA',
        'ENGESHN1DA-opus16',
        'ENGESHN1DA',
        'ENGESHO1DA-opus16',
      ]);
    },
  );

  it('keeps the resolved order when the timestamped sibling ' +
    'is not loaded', () => {
      // Without the ENGESV translation in the list, ENGESVO1DA
      // cannot be swapped in — the timestampless original leads.
      expect(
        orderedAudioCandidates('ENGESHN1DA', 'GEN', [ENGESH])[0],
      ).toBe('ENGESHO1DA-opus16');
    },
  );

  it('promotes the remembered codec to the front', () => {
    // After an opus16 decode failure the next load leads with
    // the mp3 sibling instead of re-picking opus16.
    expect(
      orderedAudioCandidates(
        'ENGESHN1DA',
        'JHN',
        [ENGESH],
        'mp3',
      ),
    ).toEqual([
      'ENGESHN1DA',
      'ENGESHN1DA-opus16',
      'ENGESHO1DA-opus16',
      'ENGESHO1DA',
    ]);
  });

  it('leaves the order unchanged when the remembered codec is ' +
    'absent or already first', () => {
      const base = orderedAudioCandidates(
        'ENGESHN1DA',
        'JHN',
        [ENGESH],
      );
      expect(
        orderedAudioCandidates(
          'ENGESHN1DA',
          'JHN',
          [ENGESH],
          'generated',
        ),
      ).toEqual(base);
      expect(
        orderedAudioCandidates(
          'ENGESHN1DA',
          'JHN',
          [ENGESH],
          'opus16',
        ),
      ).toEqual(base);
    },
  );
});
