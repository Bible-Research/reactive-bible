import { toUsfmCode } from '../../utils/bibleUtils';
import { DEFAULT_NOTES_PAGE_SIZE } from '../../utils/pagination';
import { isUiLanguage } from '../../i18n';
import type {
  ReadingPositionValue,
  VerseRef,
} from '../../types';
import type { BibleState } from '../../store';

/**
 * The persisted subset of BibleState. Exported so tests can
 * pin the exact persisted shape — a change here changes what
 * `bible-storage` holds, which gates whether a `version` bump
 * is required.
 */
export const partializeState = (state: BibleState) => ({
  activeBookId: state.activeBookId,
  activeChapter: state.activeChapter,
  // Only 'bible'-scoped selections make sense after reload — a
  // persisted 'note:<id>' scope would resurrect the verse
  // toolbar against a note that isn't mounted.
  verseSelection:
    state.verseSelection?.scope === 'bible'
      ? state.verseSelection
      : null,
  bibleVersion: state.bibleVersion,
  uiLanguage: state.uiLanguage,
  translations: state.translations,
  activeTextFilesetId: state.activeTextFilesetId,
  activeAudioFilesetId: state.activeAudioFilesetId,
  lastSelectedTagId: state.lastSelectedTagId,
  audioActiveVerse: state.audioActiveVerse,
  notes: state.notes,
  tags: state.tags,
  notesPage: state.notesPage,
  notesPageSize: state.notesPageSize,
  tagPagination: state.tagPagination,
  readingPositions: state.readingPositions,
  // Bottom-bar name marquee opt-out — the deferred settings
  // toggle will only need to write this one field.
  bookTitleMarquee: state.bookTitleMarquee,
  // showAudioPlayer is NOT persisted
  // detailNote is NOT persisted (transient share context)
  // pendingScrollVerse is NOT persisted
  // headerVisible is NOT persisted
  // structureByBible/activeStructureKey are NOT persisted —
  // structures re-resolve via SWR; durable copies live in the
  // cacheManager 'bible-structure' localStorage tier.
});

export type PersistedBibleState = ReturnType<typeof partializeState>;

/** Resolves a persisted book name or code to a USFM code. */
const migrateBookId = (book: unknown): string =>
  typeof book === 'string'
    ? toUsfmCode(book) ?? 'JHN'
    : 'JHN';

/** Converts a persisted ref ({book} or {bookId}) to bookId form. */
const migrateRef = (ref: Record<string, unknown>): VerseRef => ({
  bookId:
    typeof ref.bookId === 'string'
      ? ref.bookId
      : migrateBookId(ref.book),
  chapter:
    typeof ref.chapter === 'number' ? ref.chapter : 1,
  verse:
    typeof ref.verse === 'number' ? ref.verse : 1,
});

/**
 * Migrates persisted state across versions:
 * - pre-v2: the old bare `activeVerses: number[]` becomes a
 *   'bible'-scoped VerseSelection built from the persisted
 *   book/chapter; `selectedVerses` is dropped entirely.
 * - pre-v3: `activeBook`/`activeBookShort` (display names) become
 *   `activeBookId` (USFM code); VerseRef/audio refs gain bookId.
 * - pre-v4: `notesPage`/`notesPageSize` are newly persisted;
 *   absent values fall back to defaults, no migration needed.
 * - pre-v5: `readingPositions` is introduced; any pre-existing
 *   value is sanitized and name-keyed entries are re-keyed to
 *   USFM codes.
 * - pre-v6: persisted `verseSelection` is dropped unless its
 *   scope is 'bible' — note scopes are transient UI state.
 * - pre-v7: `tagPagination` (per-tag page/pageSize map) is
 *   introduced; the last-viewed tag's single-slot
 *   `notesPage`/`notesPageSize` seed its entry so that tag's
 *   restore keeps working.
 * - pre-v8: `bookTitleMarquee` is introduced; pinned to the
 *   default (on) when absent so the migrated record carries
 *   the new field.
 * - pre-v9: `uiLanguage` is introduced. An absent field keeps
 *   the detected locale from initial state (detection is
 *   first-run only by construction); an unrecognized value is
 *   dropped rather than persisted forward.
 */
export const migratePersistedState = (
  persistedState: unknown,
  version: number,
): PersistedBibleState => {
  let migrated = (persistedState ?? {}) as Record<string, unknown>;

  if (version < 2) {
    const oldVerses = Array.isArray(migrated.activeVerses)
      ? (migrated.activeVerses as unknown[]).filter(
          (v): v is number => typeof v === 'number'
        )
      : [];
    const refs: VerseRef[] = oldVerses.map((v) => ({
      bookId: migrateBookId(migrated.activeBook),
      chapter:
        typeof migrated.activeChapter === 'number'
          ? migrated.activeChapter
          : 1,
      verse: v,
    }));
    migrated = {
      ...migrated,
      verseSelection:
        refs.length > 0 ? { scope: 'bible', refs } : null,
    };
    delete migrated.activeVerses;
    delete migrated.selectedVerses;
  }

  if (version < 3) {
    const selection = migrated.verseSelection as
      | { scope: string; refs: Record<string, unknown>[] }
      | null;
    const aav = migrated.audioActiveVerse as
      | Record<string, unknown>
      | null;
    migrated = {
      ...migrated,
      activeBookId:
        typeof migrated.activeBookId === 'string'
          ? migrated.activeBookId
          : migrateBookId(migrated.activeBook),
      verseSelection: selection
        ? {
            scope: selection.scope,
            refs: selection.refs.map(migrateRef),
          }
        : null,
      audioActiveVerse: aav
        ? { ...migrateRef(aav), scope: aav.scope }
        : null,
    };
    delete migrated.activeBook;
    delete migrated.activeBookShort;
  }

  if (version < 5) {
    const raw = migrated.readingPositions;
    const positions: Record<
      string,
      ReadingPositionValue | null
    > = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw)) {
        // Keys may be USFM codes or legacy book names.
        const bookId = toUsfmCode(key);
        if (!bookId) continue;
        const entry = value as {
          chapter?: unknown;
          verse?: unknown;
        } | null;
        positions[bookId] =
          entry !== null &&
          typeof entry === 'object' &&
          typeof entry.chapter === 'number' &&
          typeof entry.verse === 'number'
            ? { chapter: entry.chapter, verse: entry.verse }
            : null;
      }
    }
    migrated = { ...migrated, readingPositions: positions };
  }

  if (version < 6) {
    // A note-scoped selection persisted by an older build must
    // not be resurrected on reload — its note is unmounted.
    const sel = migrated.verseSelection as
      | { scope?: unknown }
      | null;
    if (sel && sel.scope !== 'bible') {
      migrated = { ...migrated, verseSelection: null };
    }
  }

  if (version < 7) {
    // v6 only remembered the last-viewed tag's page — fold it
    // into the per-tag map so that tag's restore keeps
    // working under the new keyed lookup. `notesPage` and
    // `notesPageSize` were only persisted from v4 — absent
    // values fall back to the defaults so pre-v4 blobs with
    // just a lastSelectedTagId still fold.
    const lastTagId = migrated.lastSelectedTagId;
    const size = migrated.notesPageSize;
    const page = migrated.notesPage;
    const tagPagination: Record<
      string,
      { page: number; pageSize: number }
    > = {};
    if (typeof lastTagId === 'string' && lastTagId.length > 0) {
      tagPagination[lastTagId] = {
        page:
          typeof page === 'number' && page >= 1
            ? Math.floor(page)
            : 1,
        pageSize:
          typeof size === 'number' && size >= 1
            ? Math.floor(size)
            : DEFAULT_NOTES_PAGE_SIZE,
      };
    }
    migrated = { ...migrated, tagPagination };
  }

  if (version < 8) {
    migrated = {
      ...migrated,
      bookTitleMarquee:
        typeof migrated.bookTitleMarquee === 'boolean'
          ? migrated.bookTitleMarquee
          : true,
    };
  }

  if (version < 9) {
    // Sanitize the new field: only shipped BCP-47 codes
    // persist; anything else drops back to detection.
    const lang = migrated.uiLanguage;
    if (lang !== undefined && !isUiLanguage(lang)) {
      migrated = { ...migrated };
      delete migrated.uiLanguage;
    }
  }

  return migrated as PersistedBibleState;
};
