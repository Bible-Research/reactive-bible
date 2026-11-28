import type { StateCreator } from 'zustand';
import { fetchBibleStructure } from '../../api';
import {
  findTranslationByFilesetId,
  groupFilesets,
  splitCodec,
} from '../../utils/filesetGroups';
import {
  getCachedStructure,
  cacheStructure,
} from '../../utils/cacheManager';
import { setActiveStructure } from '../../utils/bookNameRegistry';
import {
  registerStructureCoverage,
} from '../../utils/structureCoverage';
import { captureHandledError } from '../../utils/errorReporter';
import type { BibleStructure, Translation } from '../../types';
import type { BibleState } from '../../store';
import catalogEn from '../../assets/bookNames.en.json';
import catalogLv from '../../assets/bookNames.lv.json';
import catalogRu from '../../assets/bookNames.ru.json';

/**
 * structureByBible slice — the stale-while-revalidate loader
 * for the `/bible/structure/` endpoint. Transient store state;
 * persistence lives exclusively in the cacheManager tier.
 *
 * Resolution order per `loadStructure()`:
 *   localStorage (per bible abbr) -> bundled locale catalog
 *   (shipped locales only) -> previous rendered structure
 *   -> fetch.
 * Names + coverage swap atomically when a fresher structure
 * lands: the store write and the `bookNameRegistry` sync-view
 * push happen in the same apply, so React and non-React
 * readers never see a mixed state.
 */
const BUNDLED_CATALOGS: Record<string, BibleStructure> = {
  en: catalogEn as unknown as BibleStructure,
  lv: catalogLv as unknown as BibleStructure,
  ru: catalogRu as unknown as BibleStructure,
};

/**
 * ISO-639-3 -> bundled catalog language. Only the shipped
 * locales have catalogs — for any other language (or an
 * unresolved owner) this returns undefined so the previous
 * structure stays rendered until the fetch lands; English
 * is not a universal floor.
 */
const catalogLangFor = (iso?: string): string | undefined => {
  // DBT reports some languages under their 639-2 spelling —
  // the backend's _ISO_ALIASES normalises 'lat'/'lav' to
  // 'lvs', so the bundled-catalog tier mirrors the alias or
  // those listings would skip the lv catalog on cold load.
  if (iso === 'lvs' || iso === 'lat' || iso === 'lav') {
    return 'lv';
  }
  if (iso === 'rus') return 'ru';
  if (iso === 'eng') return 'en';
  return undefined;
};

/**
 * In-flight fetches keyed by the stored selection id —
 * dedupes SWR kicks, including a re-kick that resolves the
 * owner abbr once the translations list lands (the abbr
 * changes between kicks; the selection id does not).
 */
const inflight = new Map<string, Promise<void>>();

/**
 * Test hook: a held-open fetch leaves its entry forever —
 * module state must not leak into the next test's dedupe.
 */
export const resetStructureInflightForTests = (): void => {
  inflight.clear();
};

/**
 * Mirrors the backend's `FILESET_ID_RE`
 * (`bible/utils/request_params.py`) — a ':'-bearing product id
 * or otherwise malformed id is a guaranteed
 * 400 `invalid_parameter`, so it must never reach the wire.
 */
const FILESET_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Owner lookup with one extra tolerance over
 * `findTranslationByFilesetId`: legacy two-part '{abbr}:{n}'
 * selections predate the '{abbr}:{kind}:{n}' product grammar,
 * so a stored id whose prefix is a listing abbr still
 * resolves its translation — the owner's member fileset id
 * can then drive the fetch even though the ':'-bearing
 * stored form is a guaranteed 400 on the wire.
 */
const resolveTextOwner = (
  storedId: string,
  translations: Translation[],
): Translation | null =>
  findTranslationByFilesetId(storedId, translations) ??
  (storedId.includes(':')
    ? translations.find(
        (t) => t.abbr === storedId.split(':')[0],
      ) ?? null
    : null);

export interface StructureSlice {
  /**
   * Resolved structures keyed by bible abbr. Testament-split
   * filesets of one bible share a single entry.
   */
  structureByBible: Record<string, BibleStructure>;
  /**
   * The abbr whose names/coverage currently drive the display
   * layer. A missing entry means "no structure resolved yet —
   * keep showing the previous names".
   */
  activeStructureKey: string | null;
  /**
   * Resolve the structure for `activeTextFilesetId` through
   * the SWR chain. Idempotent + in-flight-deduped — safe to
   * call from subscriptions and component mounts. Resolves
   * when the fetch tier settles (or immediately when nothing
   * was fetchable) — UI callers fire-and-forget it.
   */
  loadStructure: () => Promise<void>;
  /**
   * SWR-fill `structureByBible` for the bible OWNING an
   * arbitrary selection id (used to warm the abbr-keyed
   * coverage oracle for the selected AUDIO version, whose
   * bible may differ from the read version's). Never touches
   * `activeStructureKey` or the display layer — coverage only.
   * The bundled catalogs are deliberately not staged here: a
   * full-canon catalog would wrongly mark a partial-coverage
   * audio bible covered.
   */
  ensureStructure: (
    selectionId: string | null
  ) => Promise<void>;
}

export const createStructureSlice: StateCreator<
  BibleState,
  [],
  [],
  Pick<
    BibleState,
    | 'structureByBible'
    | 'activeStructureKey'
    | 'loadStructure'
    | 'ensureStructure'
  >
> = (set, get) => ({
  structureByBible: {},
  activeStructureKey: null,

  loadStructure: () => {
    const {
      activeTextFilesetId,
      translations,
      structureByBible,
    } = get();
    if (!activeTextFilesetId) {
      return Promise.resolve();
    }

    const owner = resolveTextOwner(
      activeTextFilesetId,
      translations,
    );
    // The structure endpoint takes a fileset id or the
    // bible's listing abbr — never a grouped product id:
    // '{abbr}:{kind}:{n}' carries a ':' that the backend's
    // FILESET_ID_RE rejects with 400. The abbr is
    // recoverable from the product id's prefix even before
    // the translations list resolves the owner, and raw
    // fileset ids contain no ':' so the split is loss-free.
    const abbr =
      owner?.abbr ?? activeTextFilesetId.split(':')[0];
    const lang = catalogLangFor(owner?.language_iso);

    // Point the display layer at the new bible first; the
    // staged/fetched structures fill in below. When nothing
    // is staged, the registry keeps the previous structure —
    // old names stay rendered until the fetch lands.
    set({ activeStructureKey: abbr });

    // A first load can race the translations list: until the
    // owner resolves, the fileset id stands in for the abbr.
    // Checking the id-keyed tiers too means the early load's
    // staged/fetched/cached work is reused, not duplicated.
    const staged =
      structureByBible[abbr] ??
      structureByBible[activeTextFilesetId] ??
      getCachedStructure(abbr) ??
      getCachedStructure(activeTextFilesetId) ??
      (lang ? BUNDLED_CATALOGS[lang] : undefined);
    if (staged) {
      applyStructure(
        abbr,
        staged,
        lang ? BUNDLED_CATALOGS[lang] : undefined,
        set,
        get,
      );
    }

    const existing = inflight.get(activeTextFilesetId);
    if (existing) return existing;

    // A ':'-shaped selection that resolves no owner is a
    // guaranteed wire failure — the backend's FILESET_ID_RE
    // rejects the ':' outright, and the bare prefix abbr is
    // not a routable id either (the 'ESV' listing abbr
    // 404s). Skip the fetch: the staged/previous structure
    // keeps rendering and the subscription re-kicks the
    // moment the translations list lands. Not registered
    // in `inflight`, so that re-kick always fires fresh.
    if (!owner && activeTextFilesetId.includes(':')) {
      console.warn(
        'Bible structure fetch skipped: ' +
          'unresolvable selection ' +
          JSON.stringify(activeTextFilesetId),
      );
      return Promise.resolve();
    }

    // The wire id prefers a concrete text member of the
    // owner's option over the bare listing abbr: a member
    // fileset id routes on every backend (the ESV listing
    // abbr 'ESV' 404s where the registered fileset id
    // 'ENGESV_API' answers), while a listing abbr only
    // resolves where the provider registry knows the alias.
    // The abbr-shaped member wins when present — the bundled
    // KJV structure branch is keyed on the exact 'ENGKJV'
    // id, whose _ET siblings would return DBT's all-caps
    // names — else a byTestament slot winner (always a
    // whole-bible member) or the first member.
    const textOption = owner ? groupFilesets(owner).text : null;
    const slotMap =
      textOption?.byTestament.NT ?? textOption?.byTestament.OT;
    const memberId =
      (textOption?.members.includes(abbr) ? abbr : undefined) ??
      (slotMap ? Object.values(slotMap)[0] : undefined) ??
      textOption?.members[0];
    const fetchId = memberId ?? abbr;
    if (!FILESET_ID_RE.test(fetchId)) {
      // The stored selection can't resolve to a routable id —
      // the staged/previous structure keeps rendering and the
      // re-kick on the next fileset/translations change
      // retries. Warn only: this is local data drift, not an
      // API failure worth a Sentry event.
      console.warn(
        'Bible structure fetch skipped: ' +
          'unresolvable fileset id ' +
          JSON.stringify(fetchId),
      );
      return Promise.resolve();
    }

    return runStructureFetch({
      inflightKey: activeTextFilesetId,
      fetchId,
      reportAbbr: abbr,
      // Re-resolve the owner at landing: the translations
      // list may have arrived mid-flight, upgrading the
      // key from the fileset id to the bible abbr.
      resolveLanding: () => {
        const landOwner = resolveTextOwner(
          activeTextFilesetId,
          get().translations,
        );
        const landLang = catalogLangFor(
          landOwner?.language_iso,
        );
        return {
          abbr: landOwner?.abbr ?? abbr,
          fallback:
            landLang ? BUNDLED_CATALOGS[landLang] : undefined,
        };
      },
      set,
      get,
    });
  },

  ensureStructure: (selectionId) => {
    // Bundled-KJV audio (wordpocket) is always covered — the
    // oracle never needs its structure, so skip the fetch.
    if (
      !selectionId ||
      selectionId === 'ENGKJV' ||
      selectionId.startsWith('ENGKJV:')
    ) {
      return Promise.resolve();
    }
    const { translations, structureByBible } = get();
    const owner = resolveTextOwner(selectionId, translations);
    const abbr = owner?.abbr ?? selectionId.split(':')[0];

    // Staged tiers only — never a bundled catalog: a full-canon
    // catalog would wrongly mark a partial-coverage audio bible
    // covered and poison the prefetch oracle.
    const staged =
      structureByBible[abbr] ??
      structureByBible[selectionId] ??
      getCachedStructure(abbr) ??
      getCachedStructure(selectionId);
    if (staged) {
      // applyStructure's activeStructureKey guard keeps the
      // display layer pointed at the read version — this fills
      // coverage data only. When the audio owner IS the active
      // bible the apply still touches the display layer, so
      // pass the bundled fallback too or the uncovered-book
      // names loadStructure installed would be wiped. The
      // oracle indexes only `structure` — a bundled fallback
      // can never poison coverage.
      const stagedLang = catalogLangFor(owner?.language_iso);
      applyStructure(
        abbr,
        staged,
        stagedLang ? BUNDLED_CATALOGS[stagedLang] : undefined,
        set,
        get,
      );
      return Promise.resolve();
    }

    const inflightKey = `ensure:${abbr}`;
    const existing = inflight.get(inflightKey);
    if (existing) return existing;

    // Routable fetch id: the endpoint resolves coverage at
    // bible level, so ANY member of the owning translation
    // answers — prefer the selection's own base id, then the
    // owner's listed filesets, so ':'-shaped product ids and
    // bare abbrs never reach the wire.
    const candidates = [
      splitCodec(selectionId).baseId,
      ...(owner?.filesets ?? []).map((f) => f.id),
    ];
    const fetchId = candidates.find((id) =>
      FILESET_ID_RE.test(id)
    );
    if (!fetchId) {
      console.warn(
        'Bible structure fetch skipped: ' +
          'unresolvable selection ' +
          JSON.stringify(selectionId),
      );
      return Promise.resolve();
    }

    return runStructureFetch({
      inflightKey,
      fetchId,
      reportAbbr: abbr,
      resolveLanding: () => {
        const landOwner = resolveTextOwner(
          selectionId,
          get().translations,
        );
        const landLang = catalogLangFor(
          landOwner?.language_iso,
        );
        return {
          abbr: landOwner?.abbr ?? abbr,
          fallback:
            landLang ? BUNDLED_CATALOGS[landLang] : undefined,
        };
      },
      set,
      get,
    });
  },
});

/**
 * Atomically install a structure for `abbr`: store write +
 * registry re-pointing (only when `abbr` is still the active
 * bible — a fetch landing for a previous translation updates
 * the cache/store but must not steal the display layer).
 * `fallback` is the same-language bundled catalog used to
 * name uncovered books — see bookNameRegistry.
 */
const applyStructure = (
  abbr: string,
  structure: BibleStructure,
  fallback: BibleStructure | undefined,
  set: (fn: (s: BibleState) => Partial<BibleState>) => void,
  get: () => BibleState,
): void => {
  // Registry FIRST: Zustand re-runs selectors synchronously
  // during the set() notification, so `selectActiveBookName`
  // must already see the fresh names to produce a changed
  // result — pushing after set() would leave display
  // selectors one update behind.
  if (get().activeStructureKey === abbr) {
    setActiveStructure(structure, fallback);
  }
  // Coverage registry for EVERY applied abbr, not just the
  // active one — the audio-path oracle
  // (utils/structureCoverage) consults the owning bible's
  // coverage even when it isn't the read version.
  registerStructureCoverage(abbr, structure);
  set((state) => ({
    structureByBible: {
      ...state.structureByBible,
      [abbr]: structure,
    },
  }));
};

/**
 * Shared fetch tier for `loadStructure`/`ensureStructure`:
 * fetch -> validate -> localStorage pin (non-degraded) ->
 * apply, with warn-only failure and in-flight dedupe owned by
 * the caller via `inflightKey`. `resolveLanding` runs when the
 * response lands so a mid-flight translations update can still
 * upgrade the key from a fileset id to the bible abbr;
 * `reportAbbr` labels the Sentry extras with the request-time
 * abbr.
 */
const runStructureFetch = (opts: {
  inflightKey: string;
  fetchId: string;
  reportAbbr: string;
  resolveLanding: () => {
    abbr: string;
    fallback?: BibleStructure;
  };
  set: (fn: (s: BibleState) => Partial<BibleState>) => void;
  get: () => BibleState;
}): Promise<void> => {
  const { inflightKey, fetchId, set, get } = opts;
  // Promise.resolve first: a synchronous throw from the
  // client layer (module-mocked api barrel, offline guard)
  // must degrade into the warn path, not crash the loader.
  const p = Promise.resolve()
    .then(() => fetchBibleStructure(fetchId))
    .then((structure) => {
      // A malformed resolution (or a test mock returning
      // undefined) must take the warn path — applying it
      // would crash the registry on `structure.books`.
      if (!Array.isArray(structure?.books)) {
        throw new Error('Malformed bible structure response');
      }
      // An empty coverage body is an upstream anomaly the
      // backend refuses to cache — applying it would grey
      // out every book, so it takes the same warn path as
      // a failed fetch: the staged/previous structure
      // keeps rendering.
      if (structure.books.length === 0) {
        throw new Error('Empty bible structure response');
      }
      const landing = opts.resolveLanding();
      // A degraded body (English names after a failed
      // SWORD canonical-name overlay — backend `no-store`)
      // applies in memory but must not pin localStorage
      // for 24h: it recovers as soon as the overlay does.
      if (!structure.degraded) {
        cacheStructure(landing.abbr, structure);
      }
      applyStructure(
        landing.abbr,
        structure,
        landing.fallback,
        set,
        get,
      );
    })
    .catch((error) => {
      // Failure keeps the staged/previous structure — the
      // greyed-coverage UI self-corrects on the next load.
      console.warn('Bible structure fetch failed:', error);
      captureHandledError(
        error,
        'Bible structure fetch',
        { abbr: opts.reportAbbr, filesetId: fetchId }
      );
    })
    .finally(() => {
      inflight.delete(inflightKey);
    });
  inflight.set(inflightKey, p);
  return p;
};
