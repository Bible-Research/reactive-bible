// src/utils/audioCandidates.ts
//
// Pure resolution of the ordered candidate list an audio load
// should walk for a (selection, book) pair.

import {
  findTranslationByFilesetId,
  groupFilesets,
  preferTimestampedAudio,
  resolveAudioFileset,
  splitCodec,
  type CodecKey,
} from './filesetGroups';
import type { Translation } from '../store';

/**
 * Ordered candidate fileset ids for playing `bookId` under the
 * stored selection `storedId` (a product id or any member id).
 *
 * Order: the timestamp-backed sibling recording first (e.g.
 * ENGESHO1DA -> ENGESVO1DA — verse timestamps only match the
 * recording they were generated from, so the swap is what lets
 * a verse-ranged item seek to the linked verse and stop after
 * it), then the resolved alternates (codec sibling ->
 * other-testament member -> same-kind option -> any option per
 * `resolveAudioFileset`), with the originally resolved id kept
 * as a load/decode fallback. `rememberedCodec` promotes the
 * codec that last played for this selection to the front, so a
 * codec that failed to decode (e.g. opus16 on an old device) is
 * not re-picked for the next chapter's load or preload. Only
 * candidates owned by the selection's own translation are
 * promotable — unshifting a cross-translation alternate would
 * make a foreign version sticky above the selection's own
 * primary for the rest of the session.
 * `textFilesetId` is the read version's selection — its owning
 * translation's audio leads the cross-translation alternates
 * (see `resolveAudioFileset`).
 *
 * Returns [] when the selection resolves to nothing.
 */
export const orderedAudioCandidates = (
  storedId: string | null,
  bookId: string,
  translations: Translation[],
  rememberedCodec?: CodecKey,
  textFilesetId?: string | null,
): string[] => {
  const resolved = resolveAudioFileset(
    storedId,
    bookId,
    translations,
    textFilesetId,
  );
  if (!resolved) return [];
  const primary = preferTimestampedAudio(
    resolved.filesetId,
    translations,
  );
  const candidates = [
    primary,
    ...resolved.alternates,
    resolved.filesetId,
  ].filter((id, i, arr) => arr.indexOf(id) === i);
  if (rememberedCodec) {
    // Promotion is owner-scoped: the foreign tail can carry the
    // remembered codec too, and unshifting it above the
    // selection's own primary would silently swap the user's
    // version for the session.
    const owner = findTranslationByFilesetId(
      storedId,
      translations,
    );
    const ownerIds = new Set(
      (owner ? groupFilesets(owner).audio : []).flatMap(
        (o) => o.members,
      ),
    );
    const i = candidates.findIndex(
      (id) =>
        ownerIds.has(id) &&
        splitCodec(id).codec === rememberedCodec,
    );
    if (i > 0) candidates.unshift(candidates.splice(i, 1)[0]);
  }
  return candidates;
};
