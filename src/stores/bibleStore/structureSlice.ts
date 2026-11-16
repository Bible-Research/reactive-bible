import type { StateCreator } from 'zustand';
import { fetchBibleStructure } from '../../api';
import { findTranslationByFilesetId } from '../../utils/filesetGroups';
import {
  getCachedStructure,
  cacheStructure,
} from '../../utils/cacheManager';
import { setActiveStructure } from '../../utils/bookNameRegistry';
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
  if (iso === 'lvs') return 'lv';
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
}

export const createStructureSlice: StateCreator<
  BibleState,
  [],
  [],
  Pick<BibleState, 'structureByBible' | 'activeStructureKey' | 'loadStructure'>
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

    const owner: Translation | null =
      findTranslationByFilesetId(
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
    // Promise.resolve first: a synchronous throw from the
    // client layer (module-mocked api barrel, offline guard)
    // must degrade into the warn path, not crash the loader.
    const p = Promise.resolve()
      .then(() => fetchBibleStructure(abbr))
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
        // Re-resolve the owner at landing: the translations
        // list may have arrived mid-flight, upgrading the
        // key from the fileset id to the bible abbr.
        const landOwner = findTranslationByFilesetId(
          activeTextFilesetId,
          get().translations,
        );
        const landAbbr = landOwner?.abbr ?? abbr;
        const landLang = catalogLangFor(
          landOwner?.language_iso,
        );
        // A degraded body (English names after a failed
        // SWORD canonical-name overlay — backend `no-store`)
        // applies in memory but must not pin localStorage
        // for 24h: it recovers as soon as the overlay does.
        if (!structure.degraded) {
          cacheStructure(landAbbr, structure);
        }
        applyStructure(
          landAbbr,
          structure,
          landLang ? BUNDLED_CATALOGS[landLang] : undefined,
          set,
          get,
        );
      })
      .catch((error) => {
        // Failure keeps the staged/previous structure — the
        // greyed-coverage UI self-corrects on the next load.
        console.warn('Bible structure fetch failed:', error);
      })
      .finally(() => {
        inflight.delete(activeTextFilesetId);
      });
    inflight.set(activeTextFilesetId, p);
    return p;
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
  set((state) => ({
    structureByBible: {
      ...state.structureByBible,
      [abbr]: structure,
    },
  }));
};
