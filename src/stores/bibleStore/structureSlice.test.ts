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
  getCachedStructure,
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

const EN_TRANSLATIONS = [
  {
    abbr: 'ENGKJV',
    name: 'King James Version',
    language: 'English',
    language_iso: 'eng',
    filesets: [
      {
        id: 'ENGKJV',
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

  it.each([
    { books: 'not-an-array' },
    // Row shape: `setActiveStructure` iterates
    // `book.book_id` — a tampered/skewed row missing it
    // must evict too, not throw synchronously.
    { books: [{ name: 'x' }] },
  ])(
    'skips a malformed localStorage entry %# instead of ' +
      'throwing',
    async (malformed) => {
      // A corrupted/version-skewed cache row must fall
      // through to the next tier — the slice applies the
      // localStorage result unguarded, so the tier itself
      // evicts malformed `books` bodies.
      localStorage.setItem(
        'bible_structure_cache',
        JSON.stringify({
          ENGKJV: {
            data: malformed,
            cachedAt: Date.now(),
          },
        }),
      );
      const { state, slice } = makeStore({
        activeTextFilesetId: 'ENGKJV',
        translations: EN_TRANSLATIONS,
      });
      vi.mocked(fetchBibleStructure).mockResolvedValue(EN);

      const p = slice.loadStructure();

      // Bundled en catalog staged synchronously — no
      // TypeError from iterating a malformed `books`.
      expect(localizedName('GEN')).toBe('Genesis');
      await p;
      expect(state.structureByBible['ENGKJV']).toEqual(EN);
      // The bad row was evicted on read — the fetch tier
      // repopulated the entry with a valid body.
      expect(getCachedStructure('ENGKJV')).toEqual(EN);
    },
  );

  it.each(['lat', 'lav'])(
    'stages the bundled lv catalog for the 639-2 %s ' +
      'spelling',
    async (iso) => {
      // DBT reports Latvian under 639-2 spellings — the
      // backend's _ISO_ALIASES normalises them to 'lvs',
      // so the bundled lv tier must apply on cold load.
      const { slice } = makeStore({
        activeTextFilesetId: 'LAVNLI',
        translations: [
          { ...LV_TRANSLATIONS[0], language_iso: iso },
        ],
      });
      vi.mocked(fetchBibleStructure).mockResolvedValue(LV);

      const p = slice.loadStructure();
      expect(localizedName('GEN')).toBe('1. Mozus grāmata');
      await p;
    },
  );

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

  it('fetches by the resolved abbr for a grouped ' +
    'product id', async () => {
      // Stored selections are grouped product ids minted as
      // '{abbr}:text:{n}' by groupTextFilesets — the ':'
      // fails the backend FILESET_ID_RE (400
      // invalid_parameter), so the fetch must go out under
      // the resolved listing abbr.
      const { state, slice } = makeStore({
        activeTextFilesetId: 'LAVNLI:text:1',
        translations: LV_TRANSLATIONS,
      });
      vi.mocked(fetchBibleStructure).mockResolvedValue(LV);

      const p = slice.loadStructure();
      expect(state.activeStructureKey).toBe('LAVNLI');
      await vi.waitFor(() => {
        expect(fetchBibleStructure)
          .toHaveBeenCalledWith('LAVNLI');
      });
      await p;
    });

  it('resolves the product-id abbr prefix before the ' +
    'translations list lands', async () => {
      // No owner resolvable yet — the abbr still comes off
      // the '{abbr}:{kind}:{n}' prefix so the request is
      // never fired with a ':'-bearing product id.
      const { state, slice } = makeStore({
        activeTextFilesetId: 'LAVNLI:text:1',
        translations: [],
      });
      vi.mocked(fetchBibleStructure).mockResolvedValue(LV);

      const p = slice.loadStructure();
      expect(state.activeStructureKey).toBe('LAVNLI');
      await vi.waitFor(() => {
        expect(fetchBibleStructure)
          .toHaveBeenCalledWith('LAVNLI');
      });
      await p;
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

  it('applies a degraded body but never persists it',
    async () => {
      // The SWORD canonical-name-overlay failure ships
      // `degraded: true` with `no-store` — usable in memory
      // but it must not pin English names into the 24h
      // localStorage tier.
      const { state, slice } = makeStore({
        activeTextFilesetId: 'LAVNLI',
        translations: LV_TRANSLATIONS,
      });
      const degraded: BibleStructure = {
        degraded: true,
        books: [{
          book_id: 'GEN', name: 'Genesis',
          name_short: 'Gen', testament: 'OT',
          chapters: [1],
        }],
      };
      vi.mocked(fetchBibleStructure)
        .mockResolvedValue(degraded);

      await slice.loadStructure();

      expect(state.structureByBible['LAVNLI'])
        .toEqual(degraded);
      expect(localizedName('GEN')).toBe('Genesis');
      expect(getCachedStructure('LAVNLI')).toBeNull();
    });

  it('treats an empty books body as a fetch failure',
    async () => {
      const { state, slice } = makeStore({
        activeTextFilesetId: 'LAVNLI',
        translations: LV_TRANSLATIONS,
      });
      // The previous structure is already live — a
      // `{books: []}` anomaly must not replace it with an
      // all-66-uncovered view, in memory or on disk.
      state.structureByBible = { LAVNLI: LV };
      vi.mocked(fetchBibleStructure).mockResolvedValue({
        books: [],
      });
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      await slice.loadStructure();

      expect(state.structureByBible['LAVNLI']).toEqual(LV);
      expect(localizedName('GEN')).toBe('1. Mozus grāmata');
      expect(getCachedStructure('LAVNLI')).toBeNull();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
});
