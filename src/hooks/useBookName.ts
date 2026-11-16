import { useBibleStore } from '../store';
import { toBookName } from '../utils/bibleUtils';

/**
 * React display-name lookup — the localized name for a USFM
 * code in the active bible structure, falling back to the
 * English `toBookName` before a structure lands or when the
 * book isn't covered.
 *
 * Re-renders atomically when a fresher structure swaps in —
 * the store write that replaces `structureByBible[key]` is
 * the same one the sync registry consumes, so hook and
 * non-hook readers never disagree.
 *
 * `toBookName` stays the CONTRACT identity (passage= params,
 * stored book fields, external links) — display call-sites
 * only.
 */
export const useBookName = (
  code: string | null | undefined
): string | null =>
  useBibleStore((state) => {
    if (!code) return null;
    const key = state.activeStructureKey;
    const structure = key
      ? state.structureByBible[key]
      : null;
    const row = structure?.books.find(
      (b) => b.book_id === code.toUpperCase()
    );
    return row?.name ?? toBookName(code);
  });

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
