import type { Verse } from '../types';

/**
 * Bible providers cap passage text at 500 verses for
 * copyright reasons; verses beyond that arrive with empty
 * text and must not render as blank rows.
 */
export const NOTE_VERSE_DISPLAY_LIMIT = 500;

/**
 * Slices a note's verses to the display limit and reports
 * whether the passage was truncated so callers can show a
 * copyright notice instead of the empty tail.
 */
export const visibleNoteVerses = (
  verses: Verse[] | undefined
): { verses: Verse[]; truncated: boolean } => {
  const list = verses ?? [];
  return {
    verses: list.slice(0, NOTE_VERSE_DISPLAY_LIMIT),
    truncated: list.length > NOTE_VERSE_DISPLAY_LIMIT,
  };
};
