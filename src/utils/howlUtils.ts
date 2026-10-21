import { Howl } from 'howler';

/**
 * Fully tears down a Howl so nothing keeps playing and no
 * listeners survive on the pooled <audio> node. Shared by the
 * chapter player (Audio.tsx) and the playlist hook.
 *
 * Order matters:
 * - stop() first halts playback immediately — unload() alone can
 *   let the pooled html5 <audio> element keep playing buffered
 *   audio for a few seconds. It also emits 'stop', giving
 *   listeners like the playlist bounds checker a chance to
 *   detach their DOM listeners and clear their polls.
 * - off() detaches the remaining listeners BEFORE unload():
 *   clearing the node's src rejects a still-pending play()
 *   request, and the resulting playerror/'end' emissions are
 *   teardown noise that must not surface as user-facing errors
 *   or phantom advances.
 * - volume(0) silences the node even if the pooled element
 *   drains buffered audio after release — mute(true) would set
 *   node.muted, which the pool never resets and would silence
 *   the NEXT Howl.
 */
export const disposeHowl = (
  howl: Howl | null,
  blobUrl: string | null = null,
): void => {
  if (howl) {
    try {
      howl.stop();
      howl.off();
      howl.volume(0);
      howl.unload();
    } catch (err) {
      console.warn('Failed to dispose audio:', err);
    }
  }
  if (blobUrl) URL.revokeObjectURL(blobUrl);
};
