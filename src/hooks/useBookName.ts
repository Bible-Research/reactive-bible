import { useBibleStore } from '../store';
import { localizedBookName } from '../utils/bibleUtils';

/**
 * React display-name lookup — resolves a USFM code through
 * the registry's full chain (covered-book name ->
 * same-language bundled fallback for uncovered books ->
 * English `toBookName`), matching every other sync reader.
 * A partial canon therefore names its uncovered books in
 * its own language, not English.
 *
 * The selector reads the registry rather than the store
 * rows: `applyStructure` pushes the registry BEFORE the
 * store write, so when the set() notification re-runs this
 * selector it already sees the fresh names — hook and
 * non-hook readers never disagree.
 *
 * `toBookName` stays the CONTRACT identity (passage= params,
 * stored book fields, external links) — display call-sites
 * only.
 */
export const useBookName = (
  code: string | null | undefined
): string | null =>
  useBibleStore(() =>
    code ? localizedBookName(code) : null
  );

/**
 * The whole resolved structure for the active bible — the
 * picker's coverage view consumes this directly. `null`
 * until any tier of the SWR chain lands.
 */
export const useActiveStructure = () =>
  useBibleStore((state) =>
    state.activeStructureKey
      ? state.structureByBible[state.activeStructureKey] ??
        null
      : null
  );
