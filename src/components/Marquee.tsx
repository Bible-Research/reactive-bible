import {
  useReducedMotion,
  useResizeObserver,
} from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { useBibleStore } from '../store';

/**
 * Slow, sub-attention crawl for the bottom-bar book name —
 * inside the design's 40-50px/s window.
 */
const SCROLL_PX_PER_SEC = 45;
/** Hold at full reveal before the loop snaps back + repeats. */
const HOLD_MS = 1000;
/** Keyframe name — only BottomNav mounts this, so one suffices. */
const ANIMATION_NAME = 'bible-title-marquee';

/**
 * Reveal-then-restart marquee for the bottom-bar book name.
 * The outer span is a shrinking flex item (`min-width: 0`)
 * with clipped overflow; the inner span keeps the text on
 * one line so `scrollWidth` exceeds `clientWidth` exactly
 * by the hidden distance. When it does — and only then — a
 * CSS keyframes rule (injected via a component-local
 * `<style>` element, the only place scroll % and distance
 * can vary per name) translates the text left by that
 * distance — duration proportional to the overflow so the
 * speed stays ~45px/s — holds ~1s at full reveal, snaps
 * back and repeats. `prefers-reduced-motion` and the
 * persisted `bookTitleMarquee` pref both collapse it to a
 * static, ellipsis-clipped name; the `title` attr keeps
 * the full text on hover either way.
 */
const Marquee = ({ text }: { text: string }) => {
  const [outerRef, rect] = useResizeObserver();
  const reducedMotion = useReducedMotion();
  const prefEnabled = useBibleStore(
    (state) => state.bookTitleMarquee
  );
  const enabled = prefEnabled && !reducedMotion;
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    if (!enabled || !outer) {
      setOverflow(0);
      return;
    }
    const measure = () =>
      setOverflow(
        Math.max(0, outer.scrollWidth - outer.clientWidth)
      );
    measure();
    // A font landing after first paint changes the measured
    // widths — re-measure once fonts are ready.
    void document.fonts?.ready
      .then(measure)
      .catch(() => undefined);
  }, [text, rect.width, enabled, outerRef]);

  const animating = enabled && overflow > 0;
  const scrollMs = (overflow / SCROLL_PX_PER_SEC) * 1000;
  const durationMs = scrollMs + HOLD_MS;
  // [0, scrollPct] scrolls, [scrollPct, 100] holds at full
  // reveal; the loop restart snaps back to 0.
  const scrollPct = (scrollMs / durationMs) * 100;

  return (
    <span
      ref={outerRef}
      title={text}
      data-marquee={animating || undefined}
      style={{
        flex: '0 1 auto',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {animating && (
        <style>{`
          @keyframes ${ANIMATION_NAME} {
            0% { transform: translateX(0); }
            ${scrollPct}%, 100% {
              transform: translateX(-${overflow}px);
            }
          }
        `}</style>
      )}
      <span
        style={{
          display: 'block',
          whiteSpace: 'nowrap',
          ...(animating
            ? {
                willChange: 'transform',
                animation:
                  `${ANIMATION_NAME} ${durationMs}ms ` +
                  'linear infinite',
              }
            : {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }),
        }}
      >
        {text}
      </span>
    </span>
  );
};

export default Marquee;
