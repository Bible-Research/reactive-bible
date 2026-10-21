import { useCallback, useEffect, useMemo } from 'react';
import { showNotification } from '@mantine/notifications';
import { useBibleStore } from '../store';
import type { Note } from '../types';
import { buildNotePlaylistItems } from '../utils/notePlaylist';

/**
 * Audio-playlist assembly for TagNotesRoute: keeps
 * `audioPlaylistItems` in sync with the displayed (sorted)
 * notes and exposes `playFromNote`, which starts playback at
 * the given note.
 *
 * The playlist is the FILTERED subset of `sortedNotes` — notes
 * without verses are skipped by `buildNotePlaylistItems` — so
 * the play-from index must address `playlistItems`, not
 * `sortedNotes`. (The pre-extraction code indexed `sortedNotes`
 * while the store received the filtered items, so playing from
 * a note after a verse-less one started at the wrong item.)
 */
export const useNotePlaylist = (
  sortedNotes: Note[],
  loading: boolean,
  tagId: string | undefined
): { playFromNote: (noteId: string) => void } => {
  const setAudioPlaylistItems = useBibleStore(
    (state) => state.setAudioPlaylistItems
  );
  const setAudioPlaylistStartIndex = useBibleStore(
    (state) => state.setAudioPlaylistStartIndex
  );

  // Notes that can actually produce playlist items — the same
  // filtered list the playlist is built from.
  const playableNotes = useMemo(
    () =>
      sortedNotes.filter((n) => (n.verses?.length ?? 0) > 0),
    [sortedNotes]
  );

  const playlistItems = useMemo(
    () => buildNotePlaylistItems(sortedNotes),
    [sortedNotes]
  );

  useEffect(() => {
    setAudioPlaylistItems(
      !loading && playlistItems.length > 0 ? playlistItems : null
    );
  }, [playlistItems, loading, setAudioPlaylistItems]);

  // Leaving the tag (or the route) drops the playlist — mirrors
  // the old mount-effect cleanup keyed on tagId.
  useEffect(
    () => () => setAudioPlaylistItems(null),
    [tagId, setAudioPlaylistItems]
  );

  const playFromNote = useCallback(
    (noteId: string) => {
      // The start index must come from the same filtered item
      // list handed to the playlist — a verse-less note earlier
      // in sortedNotes would otherwise shift it off by one.
      // Match on `scope` (the note id), not itemId — multi-block
      // notes carry suffixed itemIds and several entries share
      // one scope; the first block is the right start index.
      const itemIndex = playlistItems.findIndex(
        (item) => (item.scope ?? item.itemId) === noteId
      );

      if (itemIndex >= 0) {
        setAudioPlaylistStartIndex(itemIndex);

        const noteIndex = playableNotes.findIndex(
          (n) => n.id === noteId
        );
        showNotification({
          title: 'Playlist Started',
          message:
            `Playing from note ${noteIndex + 1} ` +
            `of ${playableNotes.length}`,
          color: 'blue',
          autoClose: 3000,
        });
      }
    },
    [
      playlistItems,
      playableNotes,
      setAudioPlaylistStartIndex,
    ]
  );

  return { playFromNote };
};
