import type { Note, PlaylistItem } from '../types';
import { toUsfmCode } from './bibleUtils';

/** Notes that can actually produce playlist items — the same
 *  filtered set the playlist and play-from index are built
 *  from. */
export const playableNotes = (notes: Note[]): Note[] =>
  notes.filter((n) => (n.verses?.length ?? 0) > 0);

/**
 * Builds audio playlist items from notes in display order —
 * one item per book+chapter block. A note whose verses span
 * several chapters used to be truncated to its first block;
 * the later blocks were silently dropped from playback.
 * `itemId` suffixes the note id with `book:chapter` so Audio's
 * navigation/highlight effects (keyed on itemId) re-run when
 * playback crosses a block boundary, while `scope` keeps DOM
 * and highlight identity at the note level.
 * Labels read `Note i/n – Book C:V[-V]` where i/n is the
 * position within the playable (verse-bearing) subset.
 */
export const buildNotePlaylistItems = (
  notes: Note[]
): PlaylistItem[] => {
  const playable = playableNotes(notes);
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
