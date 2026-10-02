import { describe, it, expect } from 'vitest';
import {
  groupFilesets,
  resolveAudioFileset,
  resolveTextFileset,
  findTranslationByFilesetId,
} from './filesetGroups';
import type { Fileset, Translation } from '../store';

const fs = (
  id: string,
  type: Fileset['type'],
  size: string,
): Fileset => ({ id, type, size, codec: null, bitrate: null });

const tr = (
  abbr: string,
  filesets: Fileset[],
  extra: Partial<Translation> = {},
): Translation => ({
  abbr,
  name: abbr,
  language: 'Test',
  language_iso: 'eng',
  filesets,
  ...extra,
});

// Latvian New Latvian Interconfessional: 8 audio filesets —
// {plain, drama} × {OTP, NT} × {mp3, opus16}.
const LAVNLI = tr('LAVNLI', [
  fs('LATBSLP1DA', 'audio', 'OTP'),
  fs('LATBSLP1DA-opus16', 'audio', 'OTP'),
  fs('LATBSLN1DA', 'audio', 'NT'),
  fs('LATBSLN1DA-opus16', 'audio', 'NT'),
  fs('LATBSLP2DA', 'audio_drama', 'OTP'),
  fs('LATBSLP2DA-opus16', 'audio_drama', 'OTP'),
  fs('LATBSLN2DA', 'audio_drama', 'NT'),
  fs('LATBSLN2DA-opus16', 'audio_drama', 'NT'),
]);

// Latvian 1953 BFBS: audio-only, partial OT lettered 'P'.
const LAVLVR = tr('LAVLVR', [
  fs('LATLVRP1DA', 'audio', 'OTP'),
  fs('LATLVRP1DA-opus16', 'audio', 'OTP'),
  fs('LATLVRN1DA', 'audio', 'NT'),
  fs('LATLVRN1DA-opus16', 'audio', 'NT'),
]);

// GLU8: SWORD text + generated TTS audio.
const GLU8 = tr('GLU8', [
  fs('LVSGLU8', 'text_plain', 'C'),
  fs('LVSGLU8C1DA', 'audio', 'C'),
]);

// ESV: api.esv.org proxied text + audio.
const ENGESV = tr('ENGESV', [
  fs('ENGESV_API', 'text_plain', 'C'),
  fs('ENGESVO_ET', 'text_plain', 'OT'),
  fs('ENGESVN_ET', 'text_plain', 'NT'),
  fs('ENGESV_API', 'audio', 'C'),
]);

// ENGWWH filesets use the unrelated EN1WEB prefix.
const ENGWWH = tr('ENGWWH', [
  fs('EN1WEBO_ET', 'text_plain', 'OT'),
  fs('EN1WEBN_ET', 'text_plain', 'NT'),
  fs('EN1WEBN1DA', 'audio', 'NT'),
  fs('EN1WEBN1DA-opus16', 'audio', 'NT'),
]);

// Australian WBT: both testaments, both partial.
const AUSWBT = tr('AUSWBT', [
  fs('AUSWBTP1DA', 'audio', 'NTPOTP'),
  fs('AUSWBTP1DA-opus16', 'audio', 'NTPOTP'),
]);

// KJV with the injected bundled filesets.
const ENGKJV = tr('ENGKJV', [
  fs('ENGKJVO_ET', 'text_plain', 'OT'),
  fs('ENGKJVN_ET', 'text_plain', 'NT'),
  fs('ENGKJV', 'text_plain', 'C'),
  fs('ENGKJV', 'audio', 'C'),
]);

describe('groupFilesets', () => {
  it('merges codec pairs and coverage into audio options', () => {
    const { audio, text } = groupFilesets(LAVNLI);
    expect(text).toBeNull();
    expect(audio).toHaveLength(2);
    expect(audio[0].kind).toBe('audio');
    expect(audio[0].byTestament).toEqual({
      OT: {
        mp3: 'LATBSLP1DA',
        opus16: 'LATBSLP1DA-opus16',
      },
      NT: {
        mp3: 'LATBSLN1DA',
        opus16: 'LATBSLN1DA-opus16',
      },
    });
    expect(audio[0].coverageLabel).toBe('Full Bible (partial)');
    expect(audio[0].partial).toEqual({ OT: true, NT: false });
    expect(audio[1].kind).toBe('audio_drama');
    expect(audio[1].byTestament.NT?.opus16).toBe('LATBSLN2DA-opus16');
  });

  it('treats LVSGLU8C1DA as a generated singleton option', () => {
    const { audio, text } = groupFilesets(GLU8);
    expect(audio).toHaveLength(1);
    expect(audio[0].kind).toBe('generated');
    expect(audio[0].members).toEqual(['LVSGLU8C1DA']);
    expect(audio[0].byTestament).toEqual({
      OT: { generated: 'LVSGLU8C1DA' },
      NT: { generated: 'LVSGLU8C1DA' },
    });
    expect(text?.byTestament).toEqual({
      OT: { default: 'LVSGLU8' },
      NT: { default: 'LVSGLU8' },
    });
  });

  it('treats ENGESV_API as an audio singleton option', () => {
    const { audio } = groupFilesets(ENGESV);
    expect(audio).toHaveLength(1);
    expect(audio[0].kind).toBe('audio');
    expect(audio[0].byTestament.NT?.api).toBe('ENGESV_API');
    expect(audio[0].coverageLabel).toBe('Full Bible');
  });

  it('groups filesets with unrelated id prefixes', () => {
    const { audio, text } = groupFilesets(ENGWWH);
    expect(audio).toHaveLength(1);
    expect(audio[0].byTestament.NT?.opus16).toBe(
      'EN1WEBN1DA-opus16',
    );
    expect(text?.byTestament).toEqual({
      OT: { default: 'EN1WEBO_ET' },
      NT: { default: 'EN1WEBN_ET' },
    });
  });

  it('marks NTPOTP coverage as both testaments partial', () => {
    const { audio } = groupFilesets(AUSWBT);
    expect(audio[0].byTestament.OT?.mp3).toBe('AUSWBTP1DA');
    expect(audio[0].byTestament.NT?.mp3).toBe('AUSWBTP1DA');
    expect(audio[0].partial).toEqual({ OT: true, NT: true });
  });

  it('consumes backend audio_options when present', () => {
    const backend = tr(
      'LAVNLI',
      [fs('LATBSLN1DA', 'audio', 'NT')],
      {
        audio_options: [
          {
            id: 'LAVNLI:audio:0',
            kind: 'audio',
            coverage: 'NT+OT-partial',
            by_testament: {
              OT: {
                mp3: 'LATBSLP1DA',
                opus16: 'LATBSLP1DA-opus16',
              },
              NT: {
                mp3: 'LATBSLN1DA',
                opus16: 'LATBSLN1DA-opus16',
              },
            },
          },
        ],
      },
    );
    const { audio } = groupFilesets(backend);
    expect(audio).toHaveLength(1);
    expect(audio[0].id).toBe('LAVNLI:audio:0');
    expect(audio[0].byTestament.OT?.opus16).toBe(
      'LATBSLP1DA-opus16',
    );
    expect(audio[0].partial).toEqual({ OT: true, NT: true });
  });
});

describe('resolveAudioFileset', () => {
  it('prefers opus16 for the book testament', () => {
    const resolved = resolveAudioFileset(
      'LAVNLI:audio:0',
      'JHN',
      [LAVNLI],
    );
    expect(resolved?.filesetId).toBe('LATBSLN1DA-opus16');
    expect(resolved?.codec).toBe('opus16');
  });

  it('auto-switches testament within the same product', () => {
    const resolved = resolveAudioFileset(
      'LATBSLN1DA-opus16',
      'GEN',
      [LAVNLI],
    );
    expect(resolved?.filesetId).toBe('LATBSLP1DA-opus16');
  });

  it('orders mp3 sibling before other-testament alternates', () => {
    const resolved = resolveAudioFileset(
      'LATBSLN1DA',
      'JHN',
      [LAVNLI],
    );
    expect(resolved?.filesetId).toBe('LATBSLN1DA-opus16');
    expect(resolved?.alternates).toEqual([
      'LATBSLN1DA',
      'LATBSLP1DA-opus16',
      'LATBSLP1DA',
      'LATBSLN2DA-opus16',
    ]);
  });

  it('reaches the P-lettered OT member (LAVLVR P↔N pair)', () => {
    const resolved = resolveAudioFileset(
      'LATLVRN1DA',
      'GEN',
      [LAVLVR],
    );
    expect(resolved?.filesetId).toBe('LATLVRP1DA-opus16');
    expect(resolved?.alternates).toContain('LATLVRP1DA');
  });

  it('passes ENGKJV through untouched', () => {
    const resolved = resolveAudioFileset('ENGKJV', 'GEN', [ENGKJV]);
    expect(resolved).toEqual({
      filesetId: 'ENGKJV',
      codec: 'mp3',
      alternates: [],
    });
  });

  it('resolves the generated LVSGLU8C1DA singleton', () => {
    const resolved = resolveAudioFileset(
      'LVSGLU8C1DA',
      'JHN',
      [GLU8],
    );
    expect(resolved?.filesetId).toBe('LVSGLU8C1DA');
    expect(resolved?.codec).toBe('generated');
  });

  it('resolves ENGESV_API as codec api', () => {
    const resolved = resolveAudioFileset(
      'ENGESV_API',
      'JHN',
      [ENGESV],
    );
    expect(resolved?.filesetId).toBe('ENGESV_API');
    expect(resolved?.codec).toBe('api');
  });

  it('passes unknown persisted ids through unchanged', () => {
    const resolved = resolveAudioFileset(
      'ENGESHN1DA-opus16',
      'JHN',
      [],
    );
    expect(resolved).toEqual({
      filesetId: 'ENGESHN1DA-opus16',
      codec: 'opus16',
      alternates: [],
    });
  });

  it('returns null for a null selection', () => {
    expect(resolveAudioFileset(null, 'JHN', [LAVNLI])).toBeNull();
  });
});

describe('resolveTextFileset', () => {
  it('resolves _ET splits per book testament', () => {
    expect(
      resolveTextFileset('EN1WEBO_ET', 'JHN', [ENGWWH]),
    ).toBe('EN1WEBN_ET');
    expect(
      resolveTextFileset('EN1WEBN_ET', 'GEN', [ENGWWH]),
    ).toBe('EN1WEBO_ET');
  });

  it('prefers a complete member over testament splits', () => {
    expect(
      resolveTextFileset('ENGESVO_ET', 'JHN', [ENGESV]),
    ).toBe('ENGESV_API');
    expect(
      resolveTextFileset('ENGESVN_ET', 'GEN', [ENGESV]),
    ).toBe('ENGESV_API');
  });

  it('resolves complete filesets for any book', () => {
    expect(
      resolveTextFileset('ENGESV_API', 'GEN', [ENGESV]),
    ).toBe('ENGESV_API');
  });

  it('keeps the ENGKJV local bundle id', () => {
    expect(resolveTextFileset('ENGKJV', 'GEN', [ENGKJV])).toBe(
      'ENGKJV',
    );
  });

  it('passes unknown ids through for the error path', () => {
    expect(resolveTextFileset('STALE_ID', 'GEN', [LAVNLI])).toBe(
      'STALE_ID',
    );
  });

  it('returns null for a null selection', () => {
    expect(resolveTextFileset(null, 'JHN', [ENGESV])).toBeNull();
  });
});

describe('findTranslationByFilesetId', () => {
  it('finds by member id and by product id', () => {
    expect(
      findTranslationByFilesetId('LATBSLN1DA', [LAVNLI, GLU8])
        ?.abbr,
    ).toBe('LAVNLI');
    expect(
      findTranslationByFilesetId('LAVNLI:audio:0', [LAVNLI])?.abbr,
    ).toBe('LAVNLI');
    expect(findTranslationByFilesetId('NOPE', [LAVNLI])).toBeNull();
  });
});

describe('product id prefix fallback (index drift)', () => {
  // The backend mints `{abbr}:{kind}:{n}` ids 1-based while ids
  // persisted by this client are 0-based — a stored `*:kind:0`
  // must still resolve once backend options ship.

  // ENGNIV as the backend would describe it post-rollout.
  const backendNiv = tr(
    'ENGNIV',
    [fs('ENGNIVO_ET', 'text_plain', 'OT'),
     fs('ENGNIVN_ET', 'text_plain', 'NT')],
    {
      text_options: [
        {
          id: 'ENGNIV:text:1',
          kind: 'text',
          by_testament: {
            OT: { default: 'ENGNIVO_ET' },
            NT: { default: 'ENGNIVN_ET' },
          },
          members: ['ENGNIVO_ET', 'ENGNIVN_ET'],
        },
      ],
    },
  );

  // LAVNLI with 1-based backend option ids.
  const backendLavnli = tr('LAVNLI', LAVNLI.filesets, {
    audio_options: [
      {
        id: 'LAVNLI:audio:1',
        kind: 'audio',
        by_testament: {
          OT: { mp3: 'LATBSLP1DA', opus16: 'LATBSLP1DA-opus16' },
          NT: { mp3: 'LATBSLN1DA', opus16: 'LATBSLN1DA-opus16' },
        },
      },
      {
        id: 'LAVNLI:audio_drama:1',
        kind: 'audio_drama',
        by_testament: {
          NT: { mp3: 'LATBSLN2DA', opus16: 'LATBSLN2DA-opus16' },
        },
      },
    ],
  });

  it('resolves a drifted text product id to its option', () => {
    expect(
      resolveTextFileset('ENGNIV:text:0', 'JHN', [backendNiv]),
    ).toBe('ENGNIVN_ET');
    expect(
      resolveTextFileset('ENGNIV:text:0', 'GEN', [backendNiv]),
    ).toBe('ENGNIVO_ET');
  });

  it('resolves a drifted audio product id to its option', () => {
    const resolved = resolveAudioFileset(
      'LAVNLI:audio:0',
      'JHN',
      [backendLavnli],
    );
    expect(resolved?.filesetId).toBe('LATBSLN1DA-opus16');
    expect(resolved?.alternates).toContain('LATBSLN2DA-opus16');
  });

  it('keeps kinds separate in the prefix fallback', () => {
    const resolved = resolveAudioFileset(
      'LAVNLI:audio_drama:0',
      'JHN',
      [backendLavnli],
    );
    expect(resolved?.filesetId).toBe('LATBSLN2DA-opus16');
  });

  it('finds the owning translation for drifted ids', () => {
    expect(
      findTranslationByFilesetId('ENGNIV:text:0', [backendNiv])
        ?.abbr,
    ).toBe('ENGNIV');
    expect(
      findTranslationByFilesetId('LAVNLI:audio:0', [backendLavnli])
        ?.abbr,
    ).toBe('LAVNLI');
  });

  it('never borrows another translation via prefix fallback', () => {
    expect(
      resolveTextFileset('ENGNIV:text:0', 'JHN', [backendLavnli]),
    ).toBe('ENGNIV:text:0');
  });

  it('collapses ENGKJV product ids to the offline bundle id', () => {
    // Works even before the translations list is loaded.
    expect(resolveTextFileset('ENGKJV:text:0', 'GEN', [])).toBe(
      'ENGKJV',
    );
    expect(
      resolveAudioFileset('ENGKJV:audio:0', 'GEN', [])?.filesetId,
    ).toBe('ENGKJV');
  });
});
