import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { getAdjacentChapters } from "../api/structure";
import { useBibleStore } from "../store";
import { buildBiblePath } from "../utils/bibleUtils";

// Minimum horizontal travel (px) for a drag to count as a
// chapter-turn swipe, and how strongly it must dominate the
// vertical axis (mostly-vertical gestures get pointercancel
// from the scroll takeover anyway).
const SWIPE_MIN_DISTANCE = 75;
const SWIPE_AXIS_RATIO = 1.5;
// How far (px) a press must travel before it counts as a
// drag and the pointer is captured — shorter gestures stay
// plain clicks so desktop verse selection still works.
const SWIPE_CAPTURE_SLOP = 10;
// Trackpad/Magic-Mouse swipes arrive as wheel events — one
// stream per gesture, with a long inertial tail after the
// fingers lift. A gesture turns ONE chapter once it has
// travelled SWIPE_WHEEL_DISTANCE px, then stays disarmed
// until a gesture boundary: the stream going quiet for
// SWIPE_WHEEL_QUIET_MS, a delta settling to SWIPE_WHEEL_SETTLE
// px (noise level = push over), or a delta re-accelerating to
// SWIPE_WHEEL_REACCEL x the recent minimum — inertia only
// decays, so a renewed push means a new swipe. The last two
// are what let rapid back-to-back swipes each count even
// while the previous tail is still streaming.
const SWIPE_WHEEL_DISTANCE = 300;
const SWIPE_WHEEL_SETTLE = 4;
const SWIPE_WHEEL_PUSH_MIN = 15;
const SWIPE_WHEEL_REACCEL = 3;
const SWIPE_WHEEL_QUIET_MS = 300;

/**
 * Chapter-turn swipe on the passage viewport — a leftward
 * (right-to-left) swipe goes to the next chapter, a rightward
 * swipe to the previous, matching a book page turn.
 * Pointer Events cover touch (Android), pen, and desktop
 * mouse drags; wheel events cover trackpad/Magic-Mouse
 * swipes, which never produce pointer contact. A mouse drag
 * that ends with text selected was meant as a text
 * selection, not a swipe. Capture is taken only once a drag
 * passes a small slop, so plain clicks still dispatch on the
 * verse under the cursor. The book/chapter is read from the
 * store at swipe time so a gesture can't act on a chapter
 * that was already navigated away from. The viewport gets
 * `touch-action: pan-y` so touch drags reach pointerup on
 * every render branch — without it the browser claims
 * horizontal drags on non-Verse surfaces (loader, error,
 * outline) as scrolls and the swipe dies at pointercancel.
 * Presses landing on the ScrollArea's Radix scrollbar
 * (data-orientation) are ignored so a thumb drag never has
 * its pointer capture stolen.
 */
export const useChapterSwipe = (
  viewportRef: RefObject<HTMLElement>,
  enabled: boolean,
) => {
  const navigate = useNavigate();
  // The passage ScrollArea remounts its viewport per chapter;
  // re-attaching on these deps keeps the listeners on the live
  // element even when `enabled` never flickers.
  const activeBookId = useBibleStore((state) => state.activeBookId);
  const activeChapter = useBibleStore(
    (state) => state.activeChapter
  );
  // Lives in a ref so the armed state survives the effect
  // re-run/remount that a successful swipe causes — otherwise
  // the inertial tail would fire again right after landing.
  const wheelGesture = useRef({
    x: 0,
    armed: true,
    // Low-water mark of |deltaX| seen while disarmed — the
    // baseline a renewed push has to beat to count as a new
    // swipe rather than inertial noise.
    floor: 0,
    timer: undefined as
      | ReturnType<typeof setTimeout>
      | undefined,
  });

  useEffect(() => {
    if (!enabled) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    // Touch browsers claim a horizontal drag for scrolling —
    // firing pointercancel — unless the element opts out with
    // `touch-action: pan-y`. Loaded verses set it per-Verse,
    // but the loader/error/outline branches don't, so
    // mid-load swipes were silently dropped on touch devices.
    // pan-y keeps vertical scrolling native.
    const prevTouchAction = viewport.style.touchAction;
    viewport.style.touchAction = 'pan-y';

    let start: {
      pointerId: number;
      x: number;
      y: number;
      captured: boolean;
    } | null = null;
    const gesture = wheelGesture.current;

    const goToChapter = (direction: 'previous' | 'next') => {
      const {
        activeBookId: bookId,
        activeChapter: chapter,
      } = useBibleStore.getState();
      const { previous, next } =
        getAdjacentChapters(bookId, chapter);
      const target = direction === 'previous' ? previous : next;
      if (target) {
        void navigate(
          buildBiblePath(target.bookId, target.chapter)
        );
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      // Track a single pointer; primary button only for mice.
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }
      // Radix renders the ScrollArea's scrollbars inside this
      // element, tagged data-orientation. A press there is a
      // scrollbar drag — tracking it would steal the thumb's
      // own pointer capture once it passed the slop.
      if (
        event.target instanceof Element &&
        event.target.closest('[data-orientation]')
      ) {
        return;
      }
      // A second pointer is ignored only while a gesture is
      // captured. An uncaptured start is safe to replace: a
      // repeat of the same id means the previous release
      // never produced an event (a mouse drag can end over
      // the browser chrome before capture), and a different
      // id is another pointer aborting a gesture that never
      // committed to a drag.
      if (
        start !== null &&
        start.pointerId !== event.pointerId &&
        start.captured
      ) {
        return;
      }
      start = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        captured: false,
      };
      // No capture here: it would retarget the trailing
      // mouseup/click to the viewport and a plain click on a
      // verse would never reach it — desktop verse
      // selection lives in that click handler.
    };

    const onPointerMove = (event: PointerEvent) => {
      if (
        start === null ||
        start.pointerId !== event.pointerId ||
        start.captured
      ) {
        return;
      }
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const moved =
        Math.abs(dx) >= SWIPE_CAPTURE_SLOP ||
        Math.abs(dy) >= SWIPE_CAPTURE_SLOP;
      // Touch and pen get implicit capture anyway, and their
      // mostly-vertical drags are claimed for scrolling
      // (pointercancel resets `start`), so they capture only
      // a horizontal swipe. A mouse has no implicit capture,
      // so any drag past the slop captures — the retargeted
      // mouseup/click both lets a release outside the
      // viewport resolve and keeps a drag ending on the
      // verse it started on from toggling its selection.
      if (
        !moved ||
        (event.pointerType !== 'mouse' &&
          Math.abs(dx) <= Math.abs(dy))
      ) {
        return;
      }
      // Browsers without the method (and jsdom) resolve the
      // gesture uncaptured; when it exists it throws for
      // inactive pointers — same resolution.
      if (viewport.setPointerCapture) {
        try {
          viewport.setPointerCapture(event.pointerId);
          start.captured = true;
        } catch {
          /* inactive pointer — resolve without capture */
        }
      }
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (start?.pointerId === event.pointerId) start = null;
    };

    // A press released outside the browser window delivers
    // no pointerup/cancel — the window blur that firing
    // sequence produces is the only signal `start` went
    // stale, so drop it unconditionally.
    const onWindowBlur = () => {
      start = null;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (start === null || start.pointerId !== event.pointerId) {
        return;
      }
      // Chorded mouse buttons share the drag's pointerId — a
      // non-primary release mid-drag must not resolve it.
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      if (
        Math.abs(dx) < SWIPE_MIN_DISTANCE ||
        Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO
      ) {
        return;
      }
      if (
        event.pointerType === 'mouse' &&
        window.getSelection()?.toString()
      ) {
        return;
      }
      goToChapter(dx < 0 ? 'next' : 'previous');
    };

    const onWheel = (event: WheelEvent) => {
      // Pinch-zoom and vertical scrolls pass through — only a
      // horizontally-dominant stream is a chapter swipe.
      if (
        event.ctrlKey ||
        Math.abs(event.deltaX) <= Math.abs(event.deltaY)
      ) {
        return;
      }
      // The passage never scrolls horizontally; without this,
      // Chrome turns the overscroll into history back/forward.
      event.preventDefault();
      clearTimeout(gesture.timer);
      gesture.timer = setTimeout(() => {
        // Stream went quiet — gesture over; re-arm for the
        // next swipe and drop the partial distance.
        gesture.x = 0;
        gesture.armed = true;
      }, SWIPE_WHEEL_QUIET_MS);
      if (!gesture.armed) {
        const absX = Math.abs(event.deltaX);
        if (
          absX <= SWIPE_WHEEL_SETTLE ||
          (absX >= SWIPE_WHEEL_PUSH_MIN &&
            absX >= gesture.floor * SWIPE_WHEEL_REACCEL)
        ) {
          // Gesture boundary: either the stream settled to
          // noise level or the user pushed again — this event
          // belongs to the next swipe, count it below.
          gesture.armed = true;
          gesture.x = 0;
        } else {
          // Inertial tail — absorb it and keep tracking the
          // decaying baseline.
          gesture.floor = Math.min(gesture.floor, absX);
          return;
        }
      }
      gesture.x += event.deltaX;
      if (Math.abs(gesture.x) < SWIPE_WHEEL_DISTANCE) return;
      gesture.armed = false;
      gesture.floor = Math.abs(event.deltaX);
      // Positive deltaX = scroll right = forward through the
      // book (same sign Chrome uses for overscroll forward
      // navigation). The physical swipe direction that
      // produces it depends on the OS natural-scrolling
      // setting, which the web can't read.
      const direction = gesture.x > 0 ? 'next' : 'previous';
      gesture.x = 0;
      goToChapter(direction);
    };

    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    // pointerup lives on window: a release inside a viewport
    // descendant bubbles up to it anyway, and an uncaptured
    // sub-slop release elsewhere in the document still
    // clears `start`. Captured drags retarget the event to
    // the viewport, which bubbles to window the same way.
    // `start` is nulled on first handling, so this can never
    // double-fire.
    window.addEventListener('pointerup', onPointerUp);
    // pointercancel: the browser claimed the gesture for
    // scrolling (or it ended abnormally) — reset either way.
    // Window-level so a cancel retargeted by another
    // element's capture still clears `start`.
    window.addEventListener('pointercancel', onPointerEnd);
    window.addEventListener('blur', onWindowBlur);
    viewport.addEventListener(
      'lostpointercapture', onPointerEnd
    );
    viewport.addEventListener('wheel', onWheel, {
      passive: false,
    });
    return () => {
      viewport.style.touchAction = prevTouchAction;
      // gesture.timer is left running on purpose: it only
      // mutates the ref, and clearing it here could strand
      // `armed` at false if the stream went quiet just before
      // the viewport remounted.
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener(
        'pointercancel', onPointerEnd
      );
      window.removeEventListener('blur', onWindowBlur);
      viewport.removeEventListener(
        'lostpointercapture', onPointerEnd
      );
      viewport.removeEventListener('wheel', onWheel);
    };
  }, [viewportRef, enabled, navigate, activeBookId, activeChapter]);
};
