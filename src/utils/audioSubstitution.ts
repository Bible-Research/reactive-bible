// src/utils/audioSubstitution.ts
//
// Detects and announces playback that landed on a fileset
// owned by a different translation than the selected audio
// product — the coverage/codec walk substituted another
// version's recording (e.g. the Latvian GLU8 generated audio
// when the selected LAVLVR product has no Jeremiah). Shared by
// the chapter engine (useChapterAudio) and the playlist
// (useAudioPlaylist) so neither mode swaps versions silently.

import { showNotification } from '@mantine/notifications';
import {
  preferTimestampedAudioFileset,
  toBookName,
} from './bibleUtils';
import {
  findTranslationByFilesetId,
  groupFilesets,
} from './filesetGroups';
import type { Translation } from '../store';

/**
 * True when `playingId` is the timestamp-backed recording the
 * candidate walk deliberately swaps in for one of `owner`'s
 * audio members (`TIMESTAMP_BACKED_AUDIO` — e.g. an ENGESH
 * selection's OT member ENGESHO1DA has no DBT verse
 * timestamps, so the ENGESV-owned ENGESVO1DA plays instead by
 * design). DBT files the two recordings under different
 * translations, but the swap is same-version substitution —
 * neither the codec-memory suppression nor the substitution
 * notice may treat it as foreign playback.
 */
const isTimestampedSiblingSwap = (
  owner: Translation,
  playingId: string,
): boolean =>
  groupFilesets(owner)
    .audio.flatMap((o) => o.members)
    .some((id) => preferTimestampedAudioFileset(id) === playingId);

/**
 * True when `playingId` belongs to a different translation
 * than `selection`. Unresolvable owners (unloaded translation
 * list, legacy passthrough ids) count as same-owner so codec
 * memory and the substitution notice stay conservative.
 */
export const isCrossTranslationPlayback = (
  selection: string,
  playingId: string,
  translations: Translation[],
): boolean => {
  const selectedOwner = findTranslationByFilesetId(
    selection,
    translations,
  );
  const playingOwner = findTranslationByFilesetId(
    playingId,
    translations,
  );
  return (
    selectedOwner !== null &&
    playingOwner !== null &&
    selectedOwner.abbr !== playingOwner.abbr &&
    !isTimestampedSiblingSwap(selectedOwner, playingId)
  );
};

/**
 * Shows the "playing another version" notice, deduplicated by
 * `{selectedOwner}->{playingOwner}:{book}` inside `notified` —
 * a pair already announced for one book still re-announces
 * when a different book is substituted. The caller owns the
 * set's lifetime: the chapter engine keeps it for the
 * session, the playlist clears it on every start().
 *
 * The message says "unavailable" rather than "has no audio"
 * because the walk also lands here on non-coverage failures
 * (e.g. every owner candidate failing to decode), where the
 * selected version does carry the book.
 */
export const notifyAudioSubstitution = (
  selection: string | null,
  playingId: string,
  bookId: string,
  translations: Translation[],
  notified: Set<string>,
): void => {
  if (!selection) return;
  const selectedOwner = findTranslationByFilesetId(
    selection,
    translations,
  );
  const playingOwner = findTranslationByFilesetId(
    playingId,
    translations,
  );
  if (
    !selectedOwner ||
    !playingOwner ||
    selectedOwner.abbr === playingOwner.abbr ||
    isTimestampedSiblingSwap(selectedOwner, playingId)
  ) {
    return;
  }
  const key =
    `${selectedOwner.abbr}->${playingOwner.abbr}:${bookId}`;
  if (notified.has(key)) return;
  notified.add(key);
  const bookLabel = toBookName(bookId) ?? bookId;
  showNotification({
    title: 'Audio not in selected version',
    message:
      `${selectedOwner.name} audio for ${bookLabel} is ` +
      `unavailable — playing ${playingOwner.name} instead.`,
    color: 'blue',
    autoClose: 8000,
  });
};
