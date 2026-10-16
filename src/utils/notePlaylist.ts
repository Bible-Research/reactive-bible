import type { Note, PlaylistItem } from '../types';
import { toUsfmCode } from './bibleUtils';

/**
 * Builds audio playlist items from notes in display order.
 * Notes without verses are skipped. Each item covers the
 * contiguous same-chapter block starting at the note's first
 * verse; verses in other chapters are ignored by the audio
 * player, so they are excluded from the item's range too.
 * Labels read `Note i/n – Book C:V[-V]` where i/n is the
 * position within the playable (verse-bearing) subset.
 */
export const buildNotePlaylistItems = (
  notes: Note[]
): PlaylistItem[] =>
  notes
    .filter((n) => (n.verses?.length ?? 0) > 0)
    .map((note, i, arr) => {
      const firstVerse = note.verses[0];
      const sameBlock = note.verses.filter(
        (v) =>
          v.book === firstVerse.book &&
          v.chapter === firstVerse.chapter
      );
      const verseNumbers = sameBlock.map((v) => v.verse);
      const startVerse = Math.min(...verseNumbers);
      const endVerse = Math.max(...verseNumbers);
      const label =
        `Note ${i + 1}/${arr.length} ` +
        `– ${firstVerse.book} ` +
        `${firstVerse.chapter}:${startVerse}` +
        (startVerse !== endVerse ? `-${endVerse}` : '');
      return {
        itemId: note.id,
        bookId: toUsfmCode(firstVerse.book) ?? firstVerse.book,
        chapter: firstVerse.chapter,
        startVerse,
        endVerse,
        label,
        verseNumbers,
      };
    });
