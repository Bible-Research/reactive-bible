import { Howl } from 'howler';
import { getAudioTimestamps } from '../api';
import { Translation, VerseSelection } from '../types';
import {
  resolveTimestampsFilesetId,
  adjustTimestampsForENGESV,
} from './bibleUtils';
import { resolveTextFileset } from './filesetGroups';

/**
 * Earliest selected verse in this chapter — chapter playback
 * starts at its timestamp instead of 0. Only the bible-scoped
 * selection counts; note-card selections ('note:<id>') and refs
 * in other chapters are ignored. Returns null when no selected
 * verse applies.
 */
export const selectedStartVerse = (
  selection: VerseSelection | null,
  bookId: string,
  chapter: number,
): number | null =>
  (selection?.scope === 'bible' ? selection.refs : []).reduce<
    number | null
  >(
    (min, r) =>
      r.bookId === bookId &&
      r.chapter === chapter &&
      (min === null || r.verse < min)
        ? r.verse
        : min,
    null,
  );

/**
 * Timestamp (seconds) at which `startVerse` begins in this
 * chapter's audio. Resolves to 0 when no verse was selected, the
 * recording has no verse timestamps (ENGKJV), or the timestamp
 * lookup fails — timestamp failures must not break playback.
 */
export const verseStartTimestamp = (
  bookId: string,
  chapter: number,
  audioFilesetId: string,
  textFilesetId: string | null,
  translations: Translation[],
  startVerse: number | null,
): Promise<number> => {
  const tsFilesetId =
    startVerse === null || audioFilesetId === 'ENGKJV'
      ? null
      : resolveTimestampsFilesetId(
          audioFilesetId,
          resolveTextFileset(textFilesetId, bookId, translations),
          bookId,
        );
  if (!tsFilesetId) return Promise.resolve(0);
  return getAudioTimestamps(bookId, chapter, tsFilesetId)
    .then(
      (ts) =>
        adjustTimestampsForENGESV(ts, audioFilesetId).find(
          (t) => t.verse_start === startVerse,
        )?.timestamp ?? 0,
    )
    .catch(() => 0);
};

/**
 * Seeks `howl` to `seconds`. A still-loading Howl is covered by
 * 'load'; an already-loaded one (e.g. an adopted preload) seeks
 * right away.
 */
export const seekHowlWhenLoaded = (
  howl: Howl,
  seconds: number,
): void => {
  if (howl.state() === 'loaded') {
    howl.seek(seconds);
  } else {
    howl.once('load', () => {
      howl.seek(seconds);
    });
  }
};
