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

  it('reaches another same-language translation\u2019s audio ' +
    'for a coverage-missed book', () => {
      // Reported flow: Latvian GLU8 text on screen, LAVLVR
      // audio selected — its OT member is a partial recording
      // missing Jeremiah, so candidates must continue into the
      // read version's generated audio.
      const lav = (
        abbr: string,
        filesets: Fileset[],
      ): Translation => ({
        abbr,
        name: abbr,
        language: 'Latvian',
        language_iso: 'lvs',
        filesets,
      });
      const LAVLVR = lav('LAVLVR', [
        fs('LATLVRP1DA', 'audio', 'OTP'),
        fs('LATLVRP1DA-opus16', 'audio', 'OTP'),
        fs('LATLVRN1DA', 'audio', 'NT'),
        fs('LATLVRN1DA-opus16', 'audio', 'NT'),
      ]);
      const GLU8 = lav('GLU8', [
        fs('LVSGLU8', 'text_plain', 'C'),
        fs('LVSGLU8C1DA', 'audio', 'C'),
        fs('LVSGLU8C2DA', 'audio', 'C'),
      ]);
      expect(
        orderedAudioCandidates(
          'LAVLVR:audio:1',
          'JER',
          [LAVLVR, GLU8],
          undefined,
          'GLU8:text:1',
        ),
      ).toEqual([
        'LATLVRP1DA-opus16',
        'LATLVRP1DA',
        'LATLVRN1DA-opus16',
        'LATLVRN1DA',
        'LVSGLU8C1DA',
        'LVSGLU8C2DA',
      ]);
    },
  );

  it('never promotes a cross-translation candidate for the ' +
    'remembered codec', () => {
      // Chapter N coverage-miss landed on a foreign fallback
      // whose codec got remembered; for a chapter the selected
      // product covers, its own primary must lead again — a
      // foreign id matching the codec must not be unshifted
      // above it (sticky silent version swap). The owner here
      // has only an opus16 member, so 'mp3' can ONLY match the
      // foreign tail.
      const lav = (
        abbr: string,
        filesets: Fileset[],
      ): Translation => ({
        abbr,
        name: abbr,
        language: 'Latvian',
        language_iso: 'lvs',
        filesets,
      });
      const OPUS_ONLY = lav('OPONLY', [
        fs('OPONLYN1DA-opus16', 'audio', 'NT'),
      ]);
      const FOREIGN_MP3 = lav('FRMP3', [
        fs('FRMP3N1DA', 'audio', 'NT'),
      ]);
      expect(
        orderedAudioCandidates(
          'OPONLY:audio:1',
          'JHN',
          [OPUS_ONLY, FOREIGN_MP3],
          'mp3',
        ),
      ).toEqual(['OPONLYN1DA-opus16', 'FRMP3N1DA']);
    },
  );

  it('does not promote an owner codec member above the ' +
    'timestamped-sibling primary', () => {
      // The ENGESH selection's OT play landed on ENGESVO1DA
      // (the designed timestamped swap) and remembered its
      // codec — the leader already carries 'opus16', so no
      // owner member may be unshifted above it: promoting
      // ENGESHN1DA-opus16 (NT-only) would miss every OT book
      // and poison preloadNextChapter with the
      // wrong-testament id.
      const base = orderedAudioCandidates(
        'ENGESHN1DA',
        'GEN',
        [ENGESH, ENGESV],
      );
      expect(
        orderedAudioCandidates(
          'ENGESHN1DA',
          'GEN',
          [ENGESH, ENGESV],
          'opus16',
        ),
      ).toEqual(base);
      // But a remembered codec the leader lacks still
      // promotes the first covering owner member.
      expect(
        orderedAudioCandidates(
          'ENGESHN1DA',
          'GEN',
          [ENGESH, ENGESV],
          'mp3',
        )[0],
      ).toBe('ENGESHO1DA');
    },
  );

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
