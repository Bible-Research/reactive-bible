import type { Note, PlaylistItem } from '../types';
import { toUsfmCode } from './bibleUtils';

/**
 * Builds audio playlist items from notes in display order.
 * Notes without verses are skipped. A note whose verses span
 * several books/chapters emits ONE item per contiguous
 * book+chapter block — truncating to the first block used to
 * drop the later blocks from playback. The suffixed
 * `itemId` (`note.id:book:chapter`) stays unique per block so
 * Audio's navigation/highlight effects re-run when playback
 * moves between a note's blocks; `scope` keeps the DOM and
 * highlight identity at the note level. Labels read
 * `Note i/n – Book C:V[-V]` where i/n is the position within
 * the playable (verse-bearing) subset.
 */
export const buildNotePlaylistItems = (
  notes: Note[]
): PlaylistItem[] => {
  const playable = notes.filter(
    (n) => (n.verses?.length ?? 0) > 0
  );
  return playable.flatMap((note, noteIndex) => {
    const blocks = new Map<string, Note['verses']>();
    for (const v of note.verses) {
      const key = `${v.book}|${v.chapter}`;
      const block = blocks.get(key);
      if (block) {
        block.push(v);
      } else {
        blocks.set(key, [v]);
      }
    }
    return [...blocks.values()].map((block) => {
      const firstVerse = block[0];
      const bookId =
        toUsfmCode(firstVerse.book) ?? firstVerse.book;
      const verseNumbers = block.map((v) => v.verse);
      const startVerse = Math.min(...verseNumbers);
      const endVerse = Math.max(...verseNumbers);
      const label =
        `Note ${noteIndex + 1}/${playable.length} ` +
        `– ${firstVerse.book} ` +
        `${firstVerse.chapter}:${startVerse}` +
        (startVerse !== endVerse ? `-${endVerse}` : '');
      return {
        itemId: `${note.id}:${bookId}:${firstVerse.chapter}`,
        scope: note.id,
        bookId,
        chapter: firstVerse.chapter,
        startVerse,
        endVerse,
        label,
        verseNumbers,
      };
    });
  });
};
