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

  it('retains previous structure when no tier can stage', async () => {
    const { state, slice } = makeStore({
      activeTextFilesetId: 'LAVNLI',
      translations: LV_TRANSLATIONS,
    });
    vi.mocked(fetchBibleStructure).mockResolvedValue(LV);
    state.structureByBible = { LAVNLI: LV };
    await slice.loadStructure();
    expect(localizedName('GEN')).toBe('1. Mozus grāmata');

    // A fileset with no translation owner, no cache, no
    // bundled for its (unknown) language — bundled 'en' IS
    // the floor, so names swap to English, never stay wrong.
    state.activeTextFilesetId = 'UNKNOWN1';
    state.translations = [];
    vi.mocked(fetchBibleStructure).mockResolvedValue(EN);
    await slice.loadStructure();
    expect(state.activeStructureKey).toBe('UNKNOWN1');
    expect(localizedName('GEN')).toBe('Genesis');
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
