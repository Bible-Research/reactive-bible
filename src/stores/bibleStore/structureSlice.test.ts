import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createStructureSlice,
  resetStructureInflightForTests,
} from './structureSlice';
import { initialState, type BibleState } from '../../store';
import {
  resetActiveStructure,
  setActiveStructure,
  localizedName,
  isBookCovered,
} from '../../utils/bookNameRegistry';
import {
  isChapterCoveredForFileset,
  resetStructureCoverage,
} from '../../utils/structureCoverage';
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
  resetStructureCoverage();
  resetStructureInflightForTests();
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

  it('waits out the translations list for a ' +
    'product-id selection', async () => {
      // No owner resolvable yet — the ':'-shaped stored id
      // can never route and its prefix abbr is display
      // keying only, so nothing goes on the wire until the
      // translations-land re-kick resolves the owner.
      const { state, slice } = makeStore({
        activeTextFilesetId: 'LAVNLI:text:1',
        translations: [],
      });
      vi.mocked(fetchBibleStructure).mockResolvedValue(LV);
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      await slice.loadStructure();
      expect(state.activeStructureKey).toBe('LAVNLI');
      expect(fetchBibleStructure).not.toHaveBeenCalled();

      state.translations.push(...LV_TRANSLATIONS);
      const p = slice.loadStructure();
      await vi.waitFor(() => {
        expect(fetchBibleStructure)
          .toHaveBeenCalledWith('LAVNLI');
      });
      await p;
      warn.mockRestore();
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

describe('loadStructure fetch id resolution', () => {
  // The api.esv.org listing: its abbr ('ESV') is not a
  // registered fileset id — only the member ENGESV_API
  // routes on the backend (GLU8/NIV resolve their abbrs via
  // registry aliases, ESV did not — the prod 404 this
  // guards against).
  const ESV_TRANSLATIONS = [
    {
      abbr: 'ESV',
      name: 'English Standard Version',
      language: 'English',
      language_iso: 'eng',
      filesets: [
        {
          id: 'ENGESV_API',
          type: 'text_plain' as const,
          size: 'C',
          codec: null,
          bitrate: null,
        },
      ],
    },
  ];

  it.each(['ESV:text:1', 'ENGESV_API'])(
    'fetches the member fileset id, not the bare ' +
      "listing abbr, for stored id '%s'",
    async (storedId) => {
      const { state, slice } = makeStore({
        activeTextFilesetId: storedId,
        translations: ESV_TRANSLATIONS,
      });
      vi.mocked(fetchBibleStructure).mockResolvedValue(EN);

      const p = slice.loadStructure();
      expect(state.activeStructureKey).toBe('ESV');
      await vi.waitFor(() => {
        expect(fetchBibleStructure)
          .toHaveBeenCalledWith('ENGESV_API');
      });
      await p;
      // Local keying stays the listing abbr.
      expect(state.structureByBible['ESV']).toEqual(EN);
    },
  );

  it('resolves a legacy two-part {abbr}:{n} selection ' +
    'to the owner member', async () => {
      // 'ESV:1' predates the '{abbr}:{kind}:{n}' product
      // grammar — sending it is a guaranteed 400 and the
      // abbr half alone 404s; the owner lookup by prefix
      // recovers the routable member id.
      const { state, slice } = makeStore({
        activeTextFilesetId: 'ESV:1',
        translations: ESV_TRANSLATIONS,
      });
      vi.mocked(fetchBibleStructure).mockResolvedValue(EN);

      const p = slice.loadStructure();
      expect(state.activeStructureKey).toBe('ESV');
      await vi.waitFor(() => {
        expect(fetchBibleStructure)
          .toHaveBeenCalledWith('ENGESV_API');
      });
      await p;
    },
  );

  it('sends a member fileset id for a testament-split ' +
    'text product', async () => {
      const { slice } = makeStore({
        activeTextFilesetId: 'ENGESV:text:1',
        translations: [
          {
            abbr: 'ENGESV',
            name: 'English Standard Version',
            language: 'English',
            language_iso: 'eng',
            filesets: [
              {
                id: 'ENGESVO_ET',
                type: 'text_plain' as const,
                size: 'OT',
                codec: null,
                bitrate: null,
              },
              {
                id: 'ENGESVN_ET',
                type: 'text_plain' as const,
                size: 'NT',
                codec: null,
                bitrate: null,
              },
            ],
          },
        ],
      });
      vi.mocked(fetchBibleStructure).mockResolvedValue(EN);

      const p = slice.loadStructure();
      await vi.waitFor(() => {
        expect(fetchBibleStructure).toHaveBeenCalledWith(
          expect.stringMatching(/^ENGESV[ON]_ET$/),
        );
      });
      await p;
    },
  );

  it('never puts a colon-bearing owner abbr on the wire',
    async () => {
      // A stale/corrupted translations entry can carry an
      // abbr that is itself a product id ('ESV:1' was seen
      // hitting the endpoint in prod) — its member fileset
      // id still routes, the ':'-bearing abbr must not.
      const { state, slice } = makeStore({
        activeTextFilesetId: 'ENGESV_API',
        translations: [
          {
            ...ESV_TRANSLATIONS[0],
            abbr: 'ESV:1',
          },
        ],
      });
      vi.mocked(fetchBibleStructure).mockResolvedValue(EN);

      const p = slice.loadStructure();
      await vi.waitFor(() => {
        expect(fetchBibleStructure)
          .toHaveBeenCalledWith('ENGESV_API');
      });
      await p;
      expect(state.structureByBible['ESV:1']).toEqual(EN);
    },
  );

  it('skips the fetch when nothing resolves to a ' +
    'routable id', async () => {
      // The ':'-bearing abbr of an audio-only translation
      // leaves no member to route on — the stored id must
      // not reach the wire at all; the previous/staged
      // structure keeps rendering.
      const { slice } = makeStore({
        activeTextFilesetId: 'ESVAUD1DA',
        translations: [
          {
            abbr: 'ESV:1',
            name: 'English Standard Version',
            language: 'English',
            language_iso: 'eng',
            filesets: [
              {
                id: 'ESVAUD1DA',
                type: 'audio' as const,
                size: 'C',
                codec: null,
                bitrate: null,
              },
            ],
          },
        ],
      });
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      await slice.loadStructure();

      expect(fetchBibleStructure).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    },
  );

  it('skips a colon-bearing selection until the ' +
    'translations list loads', async () => {
      // No owner yet — the ':'-shaped stored id is a
      // guaranteed wire failure and the bare prefix abbr
      // ('ESV') is not routable either, so nothing may be
      // sent. The translations-land re-kick then resolves
      // the member id normally.
      const { state, slice } = makeStore({
        activeTextFilesetId: 'ESV:text:1',
        translations: [],
      });
      vi.mocked(fetchBibleStructure).mockResolvedValue(EN);
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      await slice.loadStructure();
      expect(fetchBibleStructure).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();

      state.translations.push(...ESV_TRANSLATIONS);
      const p = slice.loadStructure();
      await vi.waitFor(() => {
        expect(fetchBibleStructure)
          .toHaveBeenCalledWith('ENGESV_API');
      });
      await p;
      warn.mockRestore();
    },
  );
});

// The reported Latvian audio translation: LAVLVR's filesets
// cover Psalms + NT (LATLVRN1DA is NT-only; LATLVRP1DA is a
// partial OT recording lacking Job).
const LAVLVR_TRANSLATIONS = [
  {
    abbr: 'LAVLVR',
    name: 'Latvian Audio',
    language: 'Latvian',
    language_iso: 'lvs',
    filesets: [
      {
        id: 'LATLVRP1DA',
        type: 'audio' as const,
        size: 'OTP', codec: null, bitrate: null,
      },
      {
        id: 'LATLVRP1DA-opus16',
        type: 'audio' as const,
        size: 'OTP', codec: null, bitrate: null,
      },
      {
        id: 'LATLVRN1DA',
        type: 'audio' as const,
        size: 'NT', codec: null, bitrate: null,
      },
      {
        id: 'LATLVRN1DA-opus16',
        type: 'audio' as const,
        size: 'NT', codec: null, bitrate: null,
      },
    ],
  },
];

const LAVLVR_STRUCTURE: BibleStructure = {
  books: [
    {
      book_id: 'PSA', name: 'Psalms', name_short: 'Psa',
      testament: 'OT', chapters: [1, 2, 150],
    },
    {
      book_id: 'JHN', name: 'John', name_short: 'John',
      testament: 'NT', chapters: [1, 3],
    },
  ],
};

describe('ensureStructure (audio coverage warm-up)', () => {
  it('fills structureByBible + the coverage oracle for an ' +
    'audio selection without touching the display layer',
    async () => {
      // The slice's own initial `structureByBible`/`activeStructureKey`
      // overwrite same-named makeStore overrides, so the "read version
      // already live" fixture is assigned directly — same pattern the
      // loadStructure tests use for a previous structure.
      const { state, slice } = makeStore({
        activeTextFilesetId: 'LAVNLI',
        translations: [
          ...LV_TRANSLATIONS,
          ...LAVLVR_TRANSLATIONS,
        ],
      });
      state.activeStructureKey = 'LAVNLI';
      state.structureByBible = { LAVNLI: LV };
      setActiveStructure(LV);
      vi.mocked(fetchBibleStructure)
        .mockResolvedValue(LAVLVR_STRUCTURE);

      await slice.ensureStructure('LATLVRP1DA-opus16');

      // The owner's bible coverage lands keyed by abbr and
      // feeds the audio-path oracle — Job is KNOWN absent.
      expect(state.structureByBible['LAVLVR'])
        .toEqual(LAVLVR_STRUCTURE);
      expect(
        isChapterCoveredForFileset(
          'LATLVRP1DA-opus16', 'JOB', 14,
          state.translations,
        )
      ).toBe(false);
      // Display layer untouched: the read version stays the
      // active structure — no name/coverage steal.
      expect(state.activeStructureKey).toBe('LAVNLI');
      expect(localizedName('GEN')).toBe('1. Mozus grāmata');
    },
  );

  it('sends the selection\u2019s own base member id on the wire',
    async () => {
      const { slice } = makeStore({
        translations: LAVLVR_TRANSLATIONS,
      });
      vi.mocked(fetchBibleStructure)
        .mockResolvedValue(LAVLVR_STRUCTURE);

      await slice.ensureStructure('LATLVRP1DA-opus16');

      expect(fetchBibleStructure)
        .toHaveBeenCalledWith('LATLVRP1DA');
    },
  );

  it('routes a grouped product id through an owner member',
    async () => {
      const { slice } = makeStore({
        translations: LAVLVR_TRANSLATIONS,
      });
      vi.mocked(fetchBibleStructure)
        .mockResolvedValue(LAVLVR_STRUCTURE);

      await slice.ensureStructure('LAVLVR:audio:1');

      expect(fetchBibleStructure).toHaveBeenCalledWith(
        expect.stringMatching(/^LATLVR[PN]1DA$/),
      );
    },
  );

  it('serves the localStorage tier without a fetch', async () => {
    cacheStructure('LAVLVR', LAVLVR_STRUCTURE);
    const { state, slice } = makeStore({
      translations: LAVLVR_TRANSLATIONS,
    });

    await slice.ensureStructure('LATLVRN1DA');

    expect(fetchBibleStructure).not.toHaveBeenCalled();
    expect(state.structureByBible['LAVLVR'])
      .toEqual(LAVLVR_STRUCTURE);
    expect(
      isChapterCoveredForFileset(
        'LATLVRN1DA', 'JOB', 14, state.translations,
      )
    ).toBe(false);
  });

  it('dedupes concurrent kicks for the same bible', async () => {
    const { slice } = makeStore({
      translations: LAVLVR_TRANSLATIONS,
    });
    let resolveFetch!: (s: BibleStructure) => void;
    vi.mocked(fetchBibleStructure).mockImplementation(
      () => new Promise((r) => { resolveFetch = r; }),
    );

    const p1 = slice.ensureStructure('LATLVRP1DA-opus16');
    const p2 = slice.ensureStructure('LAVLVR:audio:1');
    // The fetch layer invokes fetchBibleStructure on a
    // microtask — wait for the call before resolving.
    await vi.waitFor(() => {
      expect(fetchBibleStructure).toHaveBeenCalled();
    });
    resolveFetch(LAVLVR_STRUCTURE);
    await Promise.all([p1, p2]);

    expect(fetchBibleStructure).toHaveBeenCalledTimes(1);
  });

  it('never stages a bundled catalog for the audio owner',
    async () => {
      // LAVLVR is Latvian — a bundled lv catalog would mark
      // every book covered and poison the oracle while the
      // real structure is still in flight. Hold the fetch
      // pending so the pre-landing state is observable.
      const { slice } = makeStore({
        translations: LAVLVR_TRANSLATIONS,
      });
      vi.mocked(fetchBibleStructure).mockImplementation(
        () => new Promise(() => undefined),
      );

      void slice.ensureStructure('LATLVRP1DA');

      // Coverage still unknown (covered-when-unknown), not
      // bundled-full-canon: the partial audio bible must not
      // be marked covered before its own structure lands.
      expect(
        isChapterCoveredForFileset(
          'LATLVRP1DA', 'JOB', 14, LAVLVR_TRANSLATIONS,
        )
      ).toBe(true);
      await vi.waitFor(() => {
        expect(fetchBibleStructure).toHaveBeenCalled();
      });
    },
  );

  it('skips bundled KJV audio entirely', async () => {
    const { slice } = makeStore({ translations: [] });

    await slice.ensureStructure('ENGKJV');
    await slice.ensureStructure('ENGKJV:audio:1');

    expect(fetchBibleStructure).not.toHaveBeenCalled();
  });

  it('resolves once translations land for a product id',
    async () => {
      const { state, slice } = makeStore({ translations: [] });
      vi.mocked(fetchBibleStructure)
        .mockResolvedValue(LAVLVR_STRUCTURE);

      await slice.ensureStructure('LAVLVR:audio:1');
      expect(fetchBibleStructure).not.toHaveBeenCalled();

      state.translations.push(...LAVLVR_TRANSLATIONS);
      await slice.ensureStructure('LAVLVR:audio:1');
      expect(fetchBibleStructure).toHaveBeenCalledWith(
        expect.stringMatching(/^LATLVR[PN]1DA$/),
      );
    },
  );
});
