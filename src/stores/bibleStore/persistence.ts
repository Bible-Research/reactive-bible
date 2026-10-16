import { toUsfmCode } from '../../utils/bibleUtils';
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
  verseSelection: state.verseSelection,
  bibleVersion: state.bibleVersion,
  translations: state.translations,
  activeTextFilesetId: state.activeTextFilesetId,
  activeAudioFilesetId: state.activeAudioFilesetId,
  lastSelectedTagId: state.lastSelectedTagId,
  audioActiveVerse: state.audioActiveVerse,
  notes: state.notes,
  tags: state.tags,
  notesPage: state.notesPage,
  notesPageSize: state.notesPageSize,
  readingPositions: state.readingPositions,
  // showAudioPlayer is NOT persisted
  // pendingScrollVerse is NOT persisted
  // headerVisible is NOT persisted
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

  return migrated as PersistedBibleState;
};
