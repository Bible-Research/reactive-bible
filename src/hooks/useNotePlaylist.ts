import { useCallback, useEffect } from 'react';
import { showNotification } from '@mantine/notifications';
import { useBibleStore } from '../store';
import type { Note } from '../types';
import { buildNotePlaylistItems } from '../utils/notePlaylist';

/**
 * Audio-playlist assembly for TagNotesRoute: keeps
 * `audioPlaylistItems` in sync with the displayed (sorted)
 * notes and exposes `playFromNote`, which starts playback at
 * the given note.
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

  useEffect(() => {
    if (loading || sortedNotes.length === 0) {
      setAudioPlaylistItems(null);
      return;
    }
    const items = buildNotePlaylistItems(sortedNotes);
    setAudioPlaylistItems(items.length > 0 ? items : null);
  }, [sortedNotes, loading, setAudioPlaylistItems]);

  // Leaving the tag (or the route) drops the playlist — mirrors
  // the old mount-effect cleanup keyed on tagId.
  useEffect(
    () => () => setAudioPlaylistItems(null),
    [tagId, setAudioPlaylistItems]
  );

  const playFromNote = useCallback(
    (noteId: string) => {
      const noteIndex = sortedNotes.findIndex(
        (n) => n.id === noteId
      );

      if (noteIndex >= 0) {
        setAudioPlaylistStartIndex(noteIndex);

        showNotification({
          title: 'Playlist Started',
          message:
            `Playing from note ${noteIndex + 1} ` +
            `of ${sortedNotes.length}`,
          color: 'blue',
          autoClose: 3000,
        });
      }
    },
    [sortedNotes, setAudioPlaylistStartIndex]
  );

  return { playFromNote };
};
