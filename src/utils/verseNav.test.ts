import { describe, it, expect } from 'vitest';
import {
  verseNavTarget,
  NAV_CHAIN_WINDOW_MS,
  type VerseNavState,
} from './verseNav';
import type { VerseTimestamp } from '../types';

const TS: VerseTimestamp[] = [
  { verse_start: 1, timestamp: 0 },
  { verse_start: 2, timestamp: 10 },
  { verse_start: 3, timestamp: 20 },
  { verse_start: 4, timestamp: 30 },
];

const nav = (
  direction: 1 | -1,
  before: number,
  target: number,
  at: number,
): VerseNavState => ({ direction, before, target, at });

describe('verseNavTarget — forward', () => {
  it('seeks to the next verse start', () => {
    expect(verseNavTarget(TS, 12, 1, null, 1000)).toEqual({
      kind: 'seek',
      time: 20,
    });
  });

  it('advances past a press right on a boundary', () => {
    expect(verseNavTarget(TS, 20, 1, null, 1000)).toEqual({
      kind: 'seek',
      time: 30,
    });
  });

  it('crosses to the next chapter in the last verse', () => {
    expect(verseNavTarget(TS, 45, 1, null, 1000)).toEqual({
      kind: 'chapter',
      direction: 1,
    });
  });

  it('chains forward presses off the last target', () => {
    // First press landed on verse 3 (t=20). A repeat press half a
    // second later must step from 20 — even if the audio element
    // reports a stale position.
    const last = nav(1, 12, 20, 1000);
    expect(verseNavTarget(TS, 20.4, 1, last, 1500)).toEqual({
      kind: 'seek',
      time: 30,
    });
  });
});

describe('verseNavTarget — backward', () => {
  it('restarts the verse when >2s in', () => {
    expect(verseNavTarget(TS, 15, -1, null, 1000)).toEqual({
      kind: 'seek',
      time: 10,
    });
  });

  it('goes back a verse near a boundary', () => {
    expect(verseNavTarget(TS, 11, -1, null, 1000)).toEqual({
      kind: 'seek',
      time: 0,
    });
  });

  it('goes to the previous chapter at verse 1', () => {
    expect(verseNavTarget(TS, 1, -1, null, 1000)).toEqual({
      kind: 'chapter',
      direction: -1,
    });
  });

  it('a repeat press steps back a verse instead of restarting', () => {
    // Regression: the user lands on a verse start and taps back
    // again after a pause. Without chaining the >2s restart rule
    // re-seeks the SAME verse start — the "jumps to the same
    // place" headphone bug.
    const last = nav(-1, 15, 10, 1000);
    const res = verseNavTarget(TS, 13.5, -1, last, 4500);
    expect(res).toEqual({ kind: 'seek', time: 0 });
  });

  it('keeps stepping back on each chained press', () => {
    const first = nav(-1, 38, 30, 1000);
    const second = verseNavTarget(TS, 30.4, -1, first, 1400);
    expect(second).toEqual({ kind: 'seek', time: 20 });
    const third = verseNavTarget(
      TS,
      20.9,
      -1,
      nav(-1, 30.4, 20, 1400),
      2100,
    );
    expect(third).toEqual({ kind: 'seek', time: 10 });
  });

  it('chains even while the previous seek is still applying', () => {
    // html5 seeks apply asynchronously — the position can still
    // report the pre-seek value when the next tap arrives.
    const last = nav(-1, 38, 30, 1000);
    expect(verseNavTarget(TS, 38.5, -1, last, 1400)).toEqual({
      kind: 'seek',
      time: 20,
    });
  });

  it('expires the chain window and restarts the verse', () => {
    const last = nav(-1, 38, 30, 1000);
    const now = 1000 + NAV_CHAIN_WINDOW_MS + 1;
    // Position now 8s into the landed verse — a fresh press
    // restarts it instead of stepping further back.
    expect(verseNavTarget(TS, 38, -1, last, now)).toEqual({
      kind: 'seek',
      time: 30,
    });
  });

  it('ignores an opposite-direction last step', () => {
    const last = nav(1, 25, 30, 1000);
    // Back-press 8s into verse 4 restarts it — not chained.
    expect(verseNavTarget(TS, 38, -1, last, 1500)).toEqual({
      kind: 'seek',
      time: 30,
    });
  });

  it('breaks the chain when an outside seek intervened', () => {
    // User dragged the player slider far forward after the
    // last nav step — a press must compute from the live
    // position, not the stale chain target (25s into verse 4
    // here, so the standard restart rule applies).
    const last = nav(-1, 38, 30, 1000);
    expect(verseNavTarget(TS, 55, -1, last, 1400)).toEqual({
      kind: 'seek',
      time: 30,
    });
  });

  it('crosses to the previous chapter past the first verse', () => {
    const last = nav(-1, 1, 0, 1000);
    expect(verseNavTarget(TS, 0.5, -1, last, 1400)).toEqual({
      kind: 'chapter',
      direction: -1,
    });
  });
});

describe('verseNavTarget — no timestamps', () => {
  it('falls back to ±10s seeks', () => {
    expect(verseNavTarget([], 25, 1, null, 0)).toEqual({
      kind: 'seek',
      time: 35,
    });
    expect(verseNavTarget([], 25, -1, null, 0)).toEqual({
      kind: 'seek',
      time: 15,
    });
  });

  it('clamps the backward fallback at 0', () => {
    expect(verseNavTarget([], 4, -1, null, 0)).toEqual({
      kind: 'seek',
      time: 0,
    });
  });

  it('chains the fallback off the last target', () => {
    const last = nav(-1, 25, 15, 500);
    expect(verseNavTarget([], 15.3, -1, last, 800)).toEqual({
      kind: 'seek',
      time: 5,
    });
  });
});
