import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  ActionIcon,
  Box,
  Group,
  Paper,
  Text,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import ScripturePassage from './ScripturePassage';
import type { ScriptureRefAnchor } from '../hooks/useScriptureRefPreview';
import type { ScriptureRef } from '../utils/scriptureRef';

interface ScripturePassagePopoverProps {
  /** Parsed ref — null while `error` is showing. */
  reference: ScriptureRef | null;
  /** Parse errors render inside the panel, not inline. */
  error?: string | null;
  /** Clicked token/element the panel floats under. */
  anchor: ScriptureRefAnchor;
  onClose: () => void;
}

const PANEL_WIDTH = 400;
// Inset kept between the panel and the viewport edges.
const EDGE_GAP = 8;
const ANCHOR_GAP = 4;
// Matches the `(max-width: 768px)` convention used elsewhere.
const MOBILE_MAX_WIDTH = 768;
// A press released within this distance counts as a dismiss
// tap; anything longer is a scroll/swipe and must not close.
const TAP_SLOP_PX = 10;
// Above Mantine Modal's z-index 200 (same as the suggestion
// popup in scriptureMention).
const Z_INDEX = 10000;

// jsdom (and very old engines) may lack rAF — fall back to a
// macrotask so scroll/resize tracking still reschedules.
const scheduleFrame = (cb: () => void): number =>
  typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(cb)
    : window.setTimeout(cb, 0);
const cancelFrame = (id: number): void => {
  if (typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(id);
  } else {
    window.clearTimeout(id);
  }
};

const refLabel = (ref: ScriptureRef | null): string => {
  if (!ref) return 'Passage';
  const start = ref.verses[0];
  const end = ref.verses[ref.verses.length - 1];
  const range =
    start === end ? `${start}` : `${start}-${end}`;
  return `${ref.book} ${ref.chapter}:${range}`;
};

/**
 * Floating "Bible view" panel for a clicked '@…' scripture
 * ref: portaled to document.body so it sits on top of
 * everything (incl. modals), anchored under the ref line —
 * ~400px on desktop, full viewport width on mobile — and
 * flipping above the ref when there is no room below.
 */
const ScripturePassagePopover = ({
  reference,
  error = null,
  anchor,
  onClose,
}: ScripturePassagePopoverProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Latest close callback for listeners subscribed once.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // A press begun outside the panel; only a short, stationary
  // release (a tap) dismisses — a scroll swipe must not.
  const pressRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
    mobile: boolean;
  } | null>(null);

  const position = useCallback(() => {
    const rect = anchor.getBoundingClientRect();
    // A collapsed rect means the anchor left the layout — the
    // token was deleted while the panel was open.
    if (
      rect.top === 0 &&
      rect.bottom === 0 &&
      rect.left === 0 &&
      rect.right === 0
    ) {
      onCloseRef.current();
      return;
    }
    const vw = window.innerWidth;
    const mobile = vw <= MOBILE_MAX_WIDTH;
    const width = mobile
      ? vw
      : Math.min(PANEL_WIDTH, vw - EDGE_GAP * 2);
    const left = mobile
      ? 0
      : Math.min(
          Math.max(rect.left, EDGE_GAP),
          Math.max(EDGE_GAP, vw - width - EDGE_GAP)
        );
    // Panel height is measured — the passage fills in async.
    const height = panelRef.current?.offsetHeight ?? 0;
    let top = rect.bottom + ANCHOR_GAP;
    // No room below → flip above the anchor, clamped ≥ EDGE_GAP.
    if (top + height > window.innerHeight) {
      top = Math.max(
        EDGE_GAP,
        rect.top - height - ANCHOR_GAP
      );
    }
    setPos((prev) =>
      prev &&
      prev.top === top &&
      prev.left === left &&
      prev.width === width &&
      prev.mobile === mobile
        ? prev
        : { top, left, width, mobile }
    );
  }, [anchor]);

  // Position before paint; rerun every render so a height
  // change (passage loading in) re-evaluates the flip check.
  useLayoutEffect(() => {
    position();
  });

  // Scroll events do not bubble — capture phase is required so
  // the panel tracks anchors inside a scrolling Mantine Modal.
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = scheduleFrame(() => {
        frame = 0;
        position();
      });
    };
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      cancelFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [position]);

  // Tap-outside dismissal that survives touch scrolling: a
  // 'click'/touchstart-based handler would kill the panel the
  // moment a swipe starts, so a press is recorded at
  // pointerdown and only counts when pointerup lands within
  // TAP_SLOP_PX of it, outside the panel.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      // Ref taps are left to the consumer's toggle/switch
      // logic — closing here first would flicker close→open
      // when hopping between refs.
      if (
        target instanceof Element &&
        target.closest('[data-scripture-ref]')
      ) {
        return;
      }
      pressRef.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
      };
    };
    const onPointerUp = (e: PointerEvent) => {
      const press = pressRef.current;
      pressRef.current = null;
      if (!press || press.pointerId !== e.pointerId) return;
      const target = e.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      const moved = Math.hypot(
        e.clientX - press.x,
        e.clientY - press.y
      );
      if (moved < TAP_SLOP_PX) onCloseRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Capture runs before the enclosing Mantine Modal's
      // bubble-phase Escape handler — stop it so closing this
      // panel can't also discard the note being edited.
      e.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener(
        'pointerdown',
        onPointerDown,
        true
      );
      document.removeEventListener(
        'pointerup',
        onPointerUp,
        true
      );
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  const style: CSSProperties = pos
    ? {
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.mobile ? '100vw' : pos.width,
        zIndex: Z_INDEX,
      }
    : // Hidden until the first layout pass positions it.
      { position: 'fixed', visibility: 'hidden' };

  return createPortal(
    <Paper
      ref={panelRef}
      shadow="md"
      withBorder
      p="xs"
      style={style}
      data-testid="scripture-passage-popover"
    >
      <Group position="apart" spacing={4} mb={4}>
        <Text size="sm" weight={600}>
          {error ? 'Scripture reference' : refLabel(reference)}
        </Text>
        <ActionIcon
          size="sm"
          variant="subtle"
          onClick={onClose}
          aria-label="close-passage-preview"
        >
          <IconX size={14} />
        </ActionIcon>
      </Group>
      <Box sx={{ maxHeight: '50vh', overflowY: 'auto' }}>
        {error ? (
          <Text color="red" size="sm">
            {error}
          </Text>
        ) : (
          reference && (
            <ScripturePassage reference={reference} />
          )
        )}
      </Box>
    </Paper>,
    document.body
  );
};

export default ScripturePassagePopover;
