/**
 * Module-level snapshot of the ACTIVE bible structure — the
 * `structureByBible` store slice pushes updates here via
 * `setActiveStructure` whenever the resolved structure for the
 * active bible changes (cached -> bundled -> fetch landing).
 *
 * Pure sync reads, no store/api dependencies: bibleUtils
 * (`toUsfmCode` additive matching), the mention parser and the
 * picker can all consult this without pulling the api barrel
 * or the Zustand store into their import graph.
 */
import type { BibleStructure } from '../types';

interface ActiveStructure {
  /** USFM code -> localized display name (covered books). */
  nameByCode: Map<string, string>;
  /** USFM code -> localized short name (covered books). */
  shortByCode: Map<string, string>;
  /**
   * USFM code -> same-language bundled name for books the
   * structure does NOT cover — a partial canon still names
   * its missing books in its own language, not English.
   */
  fallbackNameByCode: Map<string, string>;
  fallbackShortByCode: Map<string, string>;
  /** compacted lowercase localized name -> USFM code. */
  codeByName: Map<string, string>;
  /** USFM code -> covered chapter-number list. */
  chaptersByCode: Map<string, number[]>;
  /** Bumped on every setActiveStructure — cheap staleness key. */
  version: number;
}

const empty = (): ActiveStructure => ({
  nameByCode: new Map(),
  shortByCode: new Map(),
  fallbackNameByCode: new Map(),
  fallbackShortByCode: new Map(),
  codeByName: new Map(),
  chaptersByCode: new Map(),
  version: 0,
});

let active: ActiveStructure = empty();

/**
 * Name-matching compaction shared by toUsfmCode and the
 * mention parser: lowercase, strip whitespace/'+' escapes and
 * fold diacritics ("jana" matches "jāņa", "mozus" matches
 * "mozus" — NFD + combining-mark strip).
 */
export const compactBookName = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s+.]+/g, '');

export const structureVersion = (): number => active.version;

/**
 * Point every sync reader at a freshly resolved structure.
 * Called by the store slice only when the structure belongs
 * to the active bible — a stale fetch landing for a previous
 * translation must not re-point the display layer.
 *
 * `fallback` is the bundled catalog for the structure's own
 * language: it names the books the structure does not cover
 * (a partial Latvian canon still shows Latvian names for its
 * missing books). Coverage reads stay on the covered maps —
 * fallback entries never make a book count as covered.
 */
export const setActiveStructure = (
  structure: BibleStructure,
  fallback?: BibleStructure
): void => {
  const next = empty();
  next.version = active.version + 1;
  for (const book of structure.books) {
    const code = book.book_id.toUpperCase();
    next.nameByCode.set(code, book.name);
    if (book.name_short) {
      next.shortByCode.set(code, book.name_short);
    }
    next.chaptersByCode.set(code, book.chapters);
    for (const n of [book.name, book.name_short]) {
      if (n) next.codeByName.set(compactBookName(n), code);
    }
  }
  for (const book of fallback?.books ?? []) {
    const code = book.book_id.toUpperCase();
    if (next.nameByCode.has(code)) continue;
    next.fallbackNameByCode.set(code, book.name);
    if (book.name_short) {
      next.fallbackShortByCode.set(code, book.name_short);
    }
    for (const n of [book.name, book.name_short]) {
      if (!n) continue;
      const q = compactBookName(n);
      // Covered names claim their compacted form first, and
      // a duplicated fallback name keeps its first owner.
      if (!next.codeByName.has(q)) {
        next.codeByName.set(q, code);
      }
    }
  }
  active = next;
};

/** Test hook: drop the active snapshot between specs. */
export const resetActiveStructure = (): void => {
  active = empty();
};

/**
 * Localized display name for a USFM code: the covered-book
 * name from the active structure, then the same-language
 * bundled name for an uncovered entry (undefined when no
 * structure/catalog resolved).
 */
export const localizedName = (
  code: string
): string | undefined =>
  active.nameByCode.get(code.toUpperCase()) ??
  active.fallbackNameByCode.get(code.toUpperCase());

/** Localized short name — same chain as localizedName. */
export const localizedShortName = (
  code: string
): string | undefined =>
  active.shortByCode.get(code.toUpperCase()) ??
  active.fallbackShortByCode.get(code.toUpperCase());

/**
 * Additive localized name resolution: localized name ->
 * USFM code. Checked AFTER the English table in
 * `toUsfmCode`, so English names and USFM codes always win
 * ties — a localized name that happens to equal an English
 * book name resolves to the English book.
 */
export const localizedCodeFor = (
  name: string
): string | null => {
  const q = compactBookName(name);
  const exact = active.codeByName.get(q);
  if (exact) return exact;
  // Unique-prefix matching — "jāņa" resolves "Jāņa
  // evaņģēlijs" only when no other localized name starts
  // with it. Ambiguous prefixes return null rather than
  // guessing a book.
  let match: string | null = null;
  let count = 0;
  for (const key of active.codeByName.keys()) {
    if (key.startsWith(q)) {
      const code = active.codeByName.get(key) ?? null;
      if (code !== match) {
        match = code;
        count += 1;
      }
    }
  }
  return count === 1 ? match : null;
};

/**
 * Whether the active structure actually covers a book.
 * When no structure has been loaded yet (tests, bundled
 * fallback), every book counts as covered — the 66-book
 * canon is the safe superset.
 */
export const isBookCovered = (code: string): boolean =>
  active.version === 0 ||
  active.nameByCode.has(code.toUpperCase());

/**
 * Whether the active structure covers a specific chapter of
 * a book. Same "unknown means covered" default as
 * `isBookCovered` — callers gating speculative requests
 * (adjacent-chapter prefetch) keep working before the first
 * structure fetch lands.
 */
export const isChapterCovered = (
  code: string,
  chapter: number
): boolean =>
  active.version === 0 ||
  (active.chaptersByCode.get(code.toUpperCase())?.includes(
    chapter
  ) ?? false);

/**
 * Covered chapter-number list for a book in the active
 * structure; null when uncovered or no structure loaded.
 */
export const chaptersFor = (
  code: string
): number[] | null =>
  active.chaptersByCode.get(code.toUpperCase()) ?? null;
