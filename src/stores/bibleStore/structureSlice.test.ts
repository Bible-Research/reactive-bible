import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStructureSlice } from './structureSlice';
import { initialState, type BibleState } from '../../store';
import {
  resetActiveStructure,
  localizedName,
  isBookCovered,
} from '../../utils/bookNameRegistry';
import {
  resetStorageCacheForTests,
  cacheStructure,
  clearStructureCache,
} from '../../utils/cacheManager';
import { fetchBibleStructure } from '../../api';
import type { BibleStructure } from '../../types';
import catalogLv from '../../assets/bookNames.lv.json';
import catalogEn from '../../assets/bookNames.en.json';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchBibleStructure: vi.fn(),
}));

const LV = catalogLv as unknown as BibleStructure;
const EN = catalogEn as unknown as BibleStructure;

const LV_TRANSLATIONS = [
  {
    abbr: 'LAVNLI',
    name: 'Jaunā Latviešu Bībele',
    language: 'Latvian',
    language_iso: 'lvs',
    filesets: [
      {
        id: 'LAVNLI',
        type: 'text_plain' as const,
        size: 'C',
        codec: null,
        bitrate: null,
      },
    ],
  },
];

/**
 * Minimal stand-in store — same shape the real persist store
 * gives the slice: data state + a mutating set().
 */
const makeStore = (overrides: Partial<BibleState> = {}) => {
  const state = {
    ...initialState,
    structureByBible: {},
    activeStructureKey: null,
    ...overrides,
  } as BibleState;
  const set = (
    partial:
      | Partial<BibleState>
      | ((s: BibleState) => Partial<BibleState>),
  ) =>
    Object.assign(
      state,
      typeof partial === 'function' ? partial(state) : partial,
    );
  const get = () => state;
  const slice = createStructureSlice(set as never, get, {} as never);
  Object.assign(state, slice);
  return { state, set, get, slice };
};

beforeEach(() => {
  vi.clearAllMocks();
  resetActiveStructure();
  resetStorageCacheForTests();
  clearStructureCache();
});

describe('loadStructure SWR resolution', () => {
  it('stages bundled catalog then swaps on fetch', async () => {
    const { state, slice } = makeStore({
      activeTextFilesetId: 'LAVNLI',
      translations: LV_TRANSLATIONS,
    });
    vi.mocked(fetchBibleStructure).mockResolvedValue(LV);

    slice.loadStructure();

    // Bundled lv catalog applied synchronously — Latvian
    // names already visible before the network resolves.
    expect(state.activeStructureKey).toBe('LAVNLI');
    expect(localizedName('GEN')).toBe('1. Mozus grāmata');

    await vi.waitFor(() => {
      expect(fetchBibleStructure).toHaveBeenCalledWith('LAVNLI');
    });
    await vi.waitFor(() => {
      expect(state.structureByBible['LAVNLI']).toEqual(LV);
    });
  });

  it('serves localStorage before bundled', async () => {
    const stored: BibleStructure = {
      books: [{
        book_id: 'GEN', name: 'Cached Genesis',
        name_short: 'Cached', testament: 'OT',
        chapters: [1],
      }],
    };
    cacheStructure('ENGKJV', stored);
    const { slice } = makeStore({
      activeTextFilesetId: 'ENGKJV',
      translations: [],
    });
    vi.mocked(fetchBibleStructure).mockResolvedValue(EN);

    const p = slice.loadStructure();

    expect(localizedName('GEN')).toBe('Cached Genesis');
    await p;
  });

  it('keeps previous names rendered until fetch resolves',
    async () => {
    const { state, slice } = makeStore({
      activeTextFilesetId: 'LAVNLI',
      translations: LV_TRANSLATIONS,
    });
    vi.mocked(fetchBibleStructure).mockResolvedValue(LV);
    // Latvian structure already live.
    state.structureByBible = { LAVNLI: LV };
    await slice.loadStructure();
    expect(localizedName('GEN')).toBe('1. Mozus grāmata');

    // Switch to an unknown bible whose structure isn't
    // resolvable from cache/bundled — previous names must
    // stay rendered until the fetch lands.
    state.translations = [
      {
        abbr: 'RUSXXX',
        name: 'Russian X',
        language: 'Russian',
        language_iso: 'rus',
        filesets: [
          {
            id: 'RUSXXX',
            type: 'text_plain' as const,
            size: 'C', codec: null, bitrate: null,
          },
        ],
      },
    ];
    state.activeTextFilesetId = 'RUSXXX';
    // Hold the fetch pending so the staged tier is observable.
    let resolveFetch!: (s: BibleStructure) => void;
    vi.mocked(fetchBibleStructure).mockImplementation(
      () => new Promise((r) => { resolveFetch = r; }),
    );

    // Bundled ru exists -> staged immediately, so previous
    // Latvian names swap to bundled ru in the same tick.
    const p = slice.loadStructure();
    expect(state.activeStructureKey).toBe('RUSXXX');
    // Bundled ru staged — GEN now Russian, not Latvian.
    expect(localizedName('GEN')).toBe('Бытие');
    await vi.waitFor(() => {
      expect(fetchBibleStructure).toHaveBeenCalledWith('RUSXXX');
    });
    resolveFetch(LV);
    await p;
  });

  it('retains previous names for an unshipped language',
    async () => {
      const { state, slice } = makeStore({
        activeTextFilesetId: 'LAVNLI',
        translations: LV_TRANSLATIONS,
      });
      vi.mocked(fetchBibleStructure).mockResolvedValue(LV);
      state.structureByBible = { LAVNLI: LV };
      await slice.loadStructure();
      expect(localizedName('GEN')).toBe('1. Mozus grāmata');

      // A bible whose language has no bundled catalog and
      // no cache: the previous structure keeps rendering
      // until the fetch resolves — bundled 'en' must NOT
      // floor the names of a non-shipped language.
      state.translations = [
        {
          abbr: 'DEUBIB',
          name: 'German Bible',
          language: 'German',
          language_iso: 'deu',
          filesets: [
            {
              id: 'DEUBIB',
              type: 'text_plain' as const,
              size: 'C', codec: null, bitrate: null,
            },
          ],
        },
      ];
      state.activeTextFilesetId = 'DEUBIB';
      let resolveFetch!: (s: BibleStructure) => void;
      vi.mocked(fetchBibleStructure).mockImplementation(
        () => new Promise((r) => { resolveFetch = r; }),
      );

      const p = slice.loadStructure();
      expect(state.activeStructureKey).toBe('DEUBIB');
      // Latvian names stay — no English flash in between.
      expect(localizedName('GEN')).toBe('1. Mozus grāmata');
      await vi.waitFor(() => {
        expect(fetchBibleStructure)
          .toHaveBeenCalledWith('DEUBIB');
      });
      const german: BibleStructure = {
        books: [{
          book_id: 'GEN', name: '1. Mose',
          name_short: '1Mo', testament: 'OT',
          chapters: [1],
        }],
      };
      resolveFetch(german);
      await p;
      expect(localizedName('GEN')).toBe('1. Mose');
    });

  it('reuses the pre-translations fetch when the owner ' +
    'resolves mid-flight', async () => {
      // Fileset selected before the translations list lands:
      // the first load keys on the raw fileset id. When the
      // list arrives the re-kick must reuse that fetch and
      // re-key the result under the bible abbr — not fire a
      // second fetch or leave a fileset-id entry behind.
      const { state, slice } = makeStore({
        activeTextFilesetId: 'LAVNLIX_ET',
        translations: [],
      });
      let resolveFetch!: (s: BibleStructure) => void;
      vi.mocked(fetchBibleStructure).mockImplementation(
        () => new Promise((r) => { resolveFetch = r; }),
      );
      const p1 = slice.loadStructure();
      expect(state.activeStructureKey).toBe('LAVNLIX_ET');
      await vi.waitFor(() => {
        expect(fetchBibleStructure).toHaveBeenCalledTimes(1);
      });

      state.translations = [
        {
          abbr: 'LAVNLIX',
          name: 'Latvian X',
          language: 'Latvian',
          language_iso: 'lvs',
          filesets: [
            {
              id: 'LAVNLIX_ET',
              type: 'text_plain' as const,
              size: 'C', codec: null, bitrate: null,
            },
          ],
        },
      ];
      const p2 = slice.loadStructure();
      expect(state.activeStructureKey).toBe('LAVNLIX');
      expect(fetchBibleStructure).toHaveBeenCalledTimes(1);

      resolveFetch(LV);
      await Promise.all([p1, p2]);
      // The single fetch lands under the resolved abbr.
      expect(state.structureByBible['LAVNLIX']).toEqual(LV);
    });

  it('atomically swaps names+coverage when fetch lands', async () => {
    const { state, slice } = makeStore({
      activeTextFilesetId: 'LAVNLI',
      translations: LV_TRANSLATIONS,
    });
    let resolveFetch!: (s: BibleStructure) => void;
    vi.mocked(fetchBibleStructure).mockImplementation(
      () => new Promise((r) => { resolveFetch = r; }),
    );

    const p = slice.loadStructure();
    expect(localizedName('GEN')).toBe('1. Mozus grāmata');
    expect(isBookCovered('EXO')).toBe(true);

    // A partial-canon answer — names and coverage must flip
    // in the same apply.
    const partial: BibleStructure = {
      books: [{
        book_id: 'GEN', name: 'X', name_short: 'X',
        testament: 'OT', chapters: [1, 2],
      }],
    };
    await vi.waitFor(() => {
      expect(fetchBibleStructure).toHaveBeenCalled();
    });
    resolveFetch(partial);
    await p;
    expect(state.structureByBible['LAVNLI']).toEqual(partial);
    expect(localizedName('GEN')).toBe('X');
    expect(isBookCovered('EXO')).toBe(false);
  });

  it('dedupes concurrent fetches per abbr', async () => {
    const { slice } = makeStore({
      activeTextFilesetId: 'LAVNLI',
      translations: LV_TRANSLATIONS,
    });
    let resolveFetch!: (s: BibleStructure) => void;
    vi.mocked(fetchBibleStructure).mockImplementation(
      () => new Promise((r) => { resolveFetch = r; }),
    );
    const p = slice.loadStructure();
    void slice.loadStructure();
    void slice.loadStructure();
    await vi.waitFor(() => {
      expect(fetchBibleStructure).toHaveBeenCalledTimes(1);
    });
    resolveFetch(LV);
    await p;
  });
});
