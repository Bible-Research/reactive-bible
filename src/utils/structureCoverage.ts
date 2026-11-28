/**
 * Abbr-keyed coverage oracle for structures BEYOND the active
 * one — the audio fileset's own bible when the selected audio
 * version differs from the read version (e.g. LVSGLU8 text +
 * LAVLVR audio). `bookNameRegistry.isChapterCovered` only sees
 * the active (read) structure, so "text covers, audio doesn't"
 * slipped through and fired guaranteed book_not_in_fileset
 * 404s; this registry lets prefetch/fallback paths consult the
 * structure of the bible that actually owns the audio fileset.
 *
 * `structureSlice.applyStructure` registers every structure it
 * installs — active or not — so entries arrive via
 * `loadStructure` (text selection) and `ensureStructure`
 * (audio selection warm-up). The localStorage SWR tier
 * (`getCachedStructure`) is consulted lazily for abbrs never
 * registered this session.
 *
 * Same contract as `isChapterCovered`: covered-when-unknown —
 * a request is skipped only when coverage is KNOWN absent,
 * never merely unproven.
 */
import {
  findTranslationByFilesetId,
  splitCodec,
} from './filesetGroups';
import { getCachedStructure } from './cacheManager';
import type { BibleStructure, Translation } from '../types';

/** abbr -> (USFM code -> covered chapter-number set). */
const chaptersByAbbr = new Map<string, Map<string, Set<number>>>();

const indexStructure = (
  structure: BibleStructure
): Map<string, Set<number>> => {
  const byBook = new Map<string, Set<number>>();
  for (const book of structure.books) {
    byBook.set(
      book.book_id.toUpperCase(),
      new Set(book.chapters)
    );
  }
  return byBook;
};

/**
 * Register the coverage half of a structure under its owning
 * bible abbr. Called from `structureSlice.applyStructure` for
 * every installed structure — the display layer only adopts
 * the active abbr, but coverage is tracked for all of them.
 */
export const registerStructureCoverage = (
  abbr: string,
  structure: BibleStructure
): void => {
  if (!abbr || !Array.isArray(structure?.books)) return;
  chaptersByAbbr.set(abbr, indexStructure(structure));
};

/** Test hook: drop every registered structure between specs. */
export const resetStructureCoverage = (): void => {
  chaptersByAbbr.clear();
};

/**
 * The coverage map known for `abbr`: the registered session
 * structure first, then the durable localStorage tier (an abbr
 * whose structure landed in a previous session is usable even
 * before this session's warm-up fetch resolves).
 */
const coverageForAbbr = (
  abbr: string
): Map<string, Set<number>> | null => {
  const registered = chaptersByAbbr.get(abbr);
  if (registered) return registered;
  const cached = getCachedStructure(abbr);
  if (!cached) return null;
  const byBook = indexStructure(cached);
  chaptersByAbbr.set(abbr, byBook);
  return byBook;
};

/**
 * Whether the structure loaded for `abbr` covers a chapter.
 * An unknown abbr or unloaded structure returns true — the
 * covered-when-unknown default keeps speculative paths working
 * until `ensureStructure` (or the localStorage tier) fills in.
 */
export const isChapterCoveredForAbbr = (
  abbr: string | null | undefined,
  bookId: string,
  chapter: number
): boolean => {
  if (!abbr) return true;
  const coverage = coverageForAbbr(abbr);
  if (!coverage) return true;
  return (
    coverage.get(bookId.toUpperCase())?.has(chapter) ?? false
  );
};

/**
 * Whether the bible OWNING `filesetId` covers a chapter — the
 * audio-path counterpart of `isChapterCovered`. The owner abbr
 * resolves through the translations list (raw member ids,
 * `-opus16` codec variants and grouped product ids alike);
 * bundled KJV wordpocket audio always counts as covered. An
 * unresolvable owner or unloaded structure returns true
 * (covered-when-unknown).
 */
export const isChapterCoveredForFileset = (
  filesetId: string | null,
  bookId: string,
  chapter: number,
  translations: Translation[]
): boolean => {
  if (!filesetId || filesetId === 'ENGKJV') return true;
  const owner =
    findTranslationByFilesetId(filesetId, translations) ??
    findTranslationByFilesetId(
      splitCodec(filesetId).baseId,
      translations
    );
  return isChapterCoveredForAbbr(
    owner?.abbr ?? null,
    bookId,
    chapter
  );
};
