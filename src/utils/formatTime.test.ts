import { describe, it, expect, vi, afterEach } from 'vitest';
import formatTime from './formatTime';

const iso = (msAgo: number): string =>
  new Date(Date.now() - msAgo).toISOString();

describe('formatTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for under a minute', () => {
    expect(formatTime(iso(30_000))).toBe('just now');
  });

  it('returns minutes under an hour', () => {
    expect(formatTime(iso(5 * 60_000))).toBe('5m ago');
  });

  it('returns hours under a day', () => {
    expect(formatTime(iso(3 * 3_600_000))).toBe('3h ago');
  });

  it('returns days under a month', () => {
    expect(formatTime(iso(12 * 86_400_000))).toBe('12d ago');
  });

  it('returns a locale date past 30 days', () => {
    const ts = iso(45 * 86_400_000);
    expect(formatTime(ts)).toBe(
      new Date(ts).toLocaleDateString()
    );
  });

  it('falls back to the raw string for unparseable input', () => {
    // Used to render "Invalid Date".
    expect(formatTime('not a date')).toBe('not a date');
    expect(formatTime('')).toBe('');
  });
});
