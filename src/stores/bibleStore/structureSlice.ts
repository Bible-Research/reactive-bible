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
 *   -> previous rendered structure -> fetch.
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

/** ISO-639-3 -> bundled catalog language; English is the floor. */
const catalogLangFor = (iso?: string): string => {
  if (iso === 'lvs') return 'lv';
  if (iso === 'rus') return 'ru';
  return 'en';
};

/** In-flight fetches keyed by bible abbr — dedupes SWR kicks. */
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
    const abbr = owner?.abbr ?? activeTextFilesetId;
    const lang = catalogLangFor(owner?.language_iso);

    // Point the display layer at the new bible first; the
    // staged/fetched structures fill in below. When nothing
    // is staged, the registry keeps the previous structure —
    // old names stay rendered until the fetch lands.
    set({ activeStructureKey: abbr });

    const staged =
      structureByBible[abbr] ??
      getCachedStructure(abbr) ??
      BUNDLED_CATALOGS[lang];
    if (staged) {
      applyStructure(abbr, staged, set, get);
    }

    const existing = inflight.get(abbr);
    if (existing) return existing;
    // Promise.resolve first: a synchronous throw from the
    // client layer (module-mocked api barrel, offline guard)
    // must degrade into the warn path, not crash the loader.
    const p = Promise.resolve()
      .then(() => fetchBibleStructure(activeTextFilesetId))
      .then((structure) => {
        // A malformed resolution (or a test mock returning
        // undefined) must take the warn path — applying it
        // would crash the registry on `structure.books`.
        if (!Array.isArray(structure?.books)) {
          throw new Error('Malformed bible structure response');
        }
        cacheStructure(abbr, structure);
        applyStructure(abbr, structure, set, get);
      })
      .catch((error) => {
        // Failure keeps the staged/previous structure — the
        // greyed-coverage UI self-corrects on the next load.
        console.warn('Bible structure fetch failed:', error);
      })
      .finally(() => {
        inflight.delete(abbr);
      });
    inflight.set(abbr, p);
    return p;
  },
});

/**
 * Atomically install a structure for `abbr`: store write +
 * registry re-pointing (only when `abbr` is still the active
 * bible — a fetch landing for a previous translation updates
 * the cache/store but must not steal the display layer).
 */
const applyStructure = (
  abbr: string,
  structure: BibleStructure,
  set: (fn: (s: BibleState) => Partial<BibleState>) => void,
  get: () => BibleState,
): void => {
  // Registry FIRST: Zustand re-runs selectors synchronously
  // during the set() notification, so `selectActiveBookName`
  // must already see the fresh names to produce a changed
  // result — pushing after set() would leave display
  // selectors one update behind.
  if (get().activeStructureKey === abbr) {
    setActiveStructure(structure);
  }
  set((state) => ({
    structureByBible: {
      ...state.structureByBible,
      [abbr]: structure,
    },
  }));
};
