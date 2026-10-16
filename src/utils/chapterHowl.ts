import { Howl } from 'howler';
import type { HowlCallback, HowlErrorCallback } from 'howler';

/**
 * Per-Howl options accepted by {@link createChapterHowl} on top
 * of the shared chapter-mode base. Only the five chapter-audio
 * lifecycle events are wired through constructor options —
 * 'load'/'stop'/'seek' listeners are attached imperatively
 * where needed (adopted-preload wiring, verse seeks, bounds
 * checking).
 */
export interface ChapterHowlOptions {
  /**
   * Extension hints for sources with no file extension (the
   * preloaded chapter's blob: URL — Howler's codec sniffing
   * would leave the Howl 'unloaded' forever without it).
   */
  format?: string[];
  loop?: boolean;
  preload?: boolean;
  onplay?: HowlCallback;
  onpause?: HowlCallback;
  onend?: HowlCallback;
  onloaderror?: HowlErrorCallback;
  onplayerror?: HowlErrorCallback;
}

/**
 * Builds a chapter-mode Howl. Every `new Howl` in
 * useChapterAudio shares the `html5: true, pool: 1` base: each
 * chapter owns its own <audio> element, and a dedicated element
 * is what survives chapter transitions on a frozen lock screen.
 *
 * The playlist's Howl is intentionally NOT built here — it
 * wires different handlers (onload seek+play, onplay shows the
 * player) with different semantics.
 */
export const createChapterHowl = (
  src: string,
  opts: ChapterHowlOptions = {},
): Howl =>
  new Howl({
    src: [src],
    html5: true,
    pool: 1,
    ...opts,
  });
