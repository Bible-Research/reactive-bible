// src/__tests__/fixtures/glu8Jhn3Timestamps.ts
//
// Real production verse timestamps for the Latvian Glück 8th
// edition generated audio (fileset `LVSGLU8C1DA`), John 3 —
// captured verbatim from
//   /api/v1/bible/timestamps/?fileset_id=LVSGLU8C1DA
//     &book=John&chapter=3
// GLU8 audio is generated and hosted by us, so this recording
// and its timestamps are stable enough to vendor. Useful
// properties versus synthetic fixtures: fractional seconds,
// irregular verse lengths (~2.4s–12.4s), and no verse_start:0
// chapter-announcement row.

import type { VerseTimestamp } from '../../types';

export const GLU8_JHN3_TIMESTAMPS: VerseTimestamp[] = [
  { verse_start: 1, timestamp: 0.0 },
  { verse_start: 2, timestamp: 5.496 },
  { verse_start: 3, timestamp: 17.88 },
  { verse_start: 4, timestamp: 28.968 },
  { verse_start: 5, timestamp: 36.792 },
  { verse_start: 6, timestamp: 45.0 },
  { verse_start: 7, timestamp: 49.776 },
  { verse_start: 8, timestamp: 54.024 },
  { verse_start: 9, timestamp: 62.928 },
  { verse_start: 10, timestamp: 66.624 },
  { verse_start: 11, timestamp: 72.312 },
  { verse_start: 12, timestamp: 80.76 },
  { verse_start: 13, timestamp: 87.216 },
  { verse_start: 14, timestamp: 93.912 },
  { verse_start: 15, timestamp: 102.408 },
  { verse_start: 16, timestamp: 106.704 },
  { verse_start: 17, timestamp: 116.832 },
  { verse_start: 18, timestamp: 124.176 },
  { verse_start: 19, timestamp: 133.44 },
  { verse_start: 20, timestamp: 141.744 },
  { verse_start: 21, timestamp: 147.48 },
  { verse_start: 22, timestamp: 153.456 },
  { verse_start: 23, timestamp: 159.144 },
  { verse_start: 24, timestamp: 168.048 },
  { verse_start: 25, timestamp: 170.472 },
  { verse_start: 26, timestamp: 175.68 },
  { verse_start: 27, timestamp: 185.424 },
  { verse_start: 28, timestamp: 192.528 },
  { verse_start: 29, timestamp: 200.064 },
  { verse_start: 30, timestamp: 211.44 },
  { verse_start: 31, timestamp: 214.416 },
  { verse_start: 32, timestamp: 222.384 },
  { verse_start: 33, timestamp: 228.888 },
  { verse_start: 34, timestamp: 233.376 },
  { verse_start: 35, timestamp: 238.704 },
  { verse_start: 36, timestamp: 242.592 },
];
