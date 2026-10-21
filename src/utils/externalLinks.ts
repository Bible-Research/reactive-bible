/**
 * External Bible-study site integrations (YouVersion, BibleHub,
 * Blue Letter Bible, BibleMapper).
 *
 * All book lookup maps are keyed by USFM code — never by display
 * name. The previous display-name-keyed BLB map silently broke
 * for SNG: `toBookName('SNG')` yields "Song Of Solomon"
 * (title-cased "of") while the map expected "Song of Solomon",
 * so the BLB button disappeared and the BibleHub path fell back
 * to `song_of_solomon` (404; BibleHub uses `songs`).
 */
import { toBookName } from "./bibleUtils";
import type { VerseRef } from "../types";

/** USFM -> Blue Letter Bible URL abbreviation. */
const BOOK_TO_BLB_ABBR: Record<string, string> = {
  GEN: "gen",
  EXO: "exo",
  LEV: "lev",
  NUM: "num",
  DEU: "deu",
  JOS: "jos",
  JDG: "jdg",
  RUT: "rth",
  "1SA": "1sa",
  "2SA": "2sa",
  "1KI": "1ki",
  "2KI": "2ki",
  "1CH": "1ch",
  "2CH": "2ch",
  EZR: "ezr",
  NEH: "neh",
  EST: "est",
  JOB: "job",
  PSA: "psa",
  PRO: "pro",
  ECC: "ecc",
  SNG: "sng",
  ISA: "isa",
  JER: "jer",
  LAM: "lam",
  EZK: "eze",
  DAN: "dan",
  HOS: "hos",
  JOL: "joe",
  AMO: "amo",
  OBA: "oba",
  JON: "jon",
  MIC: "mic",
  NAM: "nah",
  HAB: "hab",
  ZEP: "zep",
  HAG: "hag",
  ZEC: "zec",
  MAL: "mal",
  MAT: "mat",
  MRK: "mar",
  LUK: "luk",
  JHN: "jhn",
  ACT: "act",
  ROM: "rom",
  "1CO": "1co",
  "2CO": "2co",
  GAL: "gal",
  EPH: "eph",
  PHP: "php",
  COL: "col",
  "1TH": "1th",
  "2TH": "2th",
  "1TI": "1ti",
  "2TI": "2ti",
  TIT: "tit",
  PHM: "phm",
  HEB: "heb",
  JAS: "jam",
  "1PE": "1pe",
  "2PE": "2pe",
  "1JN": "1jo",
  "2JN": "2jo",
  "3JN": "3jo",
  JUD: "jde",
  REV: "rev",
};

/**
 * BibleHub book-path overrides for cases where the path is not
 * the lowercased, underscored display name. Verified live:
 * biblehub.com/songs/1-1.htm resolves to Song of Solomon.
 */
const BIBLEHUB_PATH_OVERRIDES: Record<string, string> = {
  SNG: "songs",
};

export const BIBLE_MAPPER_WEB_URL = "https://biblemapper.com/web/";
export const BIBLE_MAPPER_MAPFINDER_URL =
  "https://biblemapper.com/blog/mapfinder/";

export const faviconUrl = (domain: string): string =>
  `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;

/**
 * YouVersion compare URL, e.g.
 * https://www.bible.com/bible/compare/JHN.3.16-18
 * Returns null when no verse is selected.
 */
export const buildYouVersionUrl = (
  bookId: string,
  chapter: number,
  verses: number[]
): string | null => {
  if (verses.length === 0) return null;
  const verseStr =
    verses.length === 1
      ? `${verses[0]}`
      : `${verses[0]}-${verses[verses.length - 1]}`;
  return (
    "https://www.bible.com/bible/compare/" +
    `${bookId}.${chapter}.${verseStr}`
  );
};

/**
 * BibleHub commentary URL, e.g.
 * https://biblehub.com/john/3-16.htm#commentary
 * Returns null for unknown books or missing verse.
 */
export const buildBibleHubUrl = (
  bookId: string,
  chapter: number,
  verse: number | undefined
): string | null => {
  if (verse == null) return null;
  const bookPath =
    BIBLEHUB_PATH_OVERRIDES[bookId] ??
    toBookName(bookId)?.toLowerCase().replace(/ /g, "_");
  if (!bookPath) return null;
  return `https://biblehub.com/${bookPath}/${chapter}-${verse}.htm#commentary`;
};

/**
 * Blue Letter Bible KJV URL, e.g.
 * https://www.blueletterbible.org/kjv/jhn/3/16/
 * Returns null for unmapped books or missing verse.
 */
export const buildBlbUrl = (
  bookId: string,
  chapter: number,
  verse: number | undefined
): string | null => {
  const abbr = BOOK_TO_BLB_ABBR[bookId];
  if (!abbr || verse == null) return null;
  return `https://www.blueletterbible.org/kjv/${abbr}/${chapter}/${verse}/`;
};

/**
 * BibleMapper MapFinder URL pre-filled with the passage, e.g.
 * https://biblemapper.com/blog/mapfinder/?ref=John%203
 * Falls back to the bare MapFinder page when the book is unknown.
 */
export const buildBibleMapperUrl = (
  bookId: string | null,
  chapter: number | null
): string => {
  const bookName = bookId ? toBookName(bookId) : null;
  if (!bookName || chapter == null) {
    return BIBLE_MAPPER_MAPFINDER_URL;
  }
  const ref = `${bookName} ${chapter}`;
  return (
    BIBLE_MAPPER_MAPFINDER_URL +
    `?ref=${encodeURIComponent(ref)}`
  );
};

/**
 * Scrapes the rendered verse elements for the selected refs.
 * This is intentionally the only DOM-touching piece of the
 * external-links surface — verse text lives in the passage DOM,
 * keyed by `data-verse-scope` + `title="passage-verse-c-v"`.
 */
export const collectSelectedVerseText = (
  refs: VerseRef[],
  scope: string | undefined
): string =>
  refs
    .map((r) => {
      const el = document.querySelector(
        `[data-verse-scope="${scope}"] ` +
          `[title="passage-verse-${r.chapter}-${r.verse}"]`
      );
      return el?.textContent?.trim() ?? "";
    })
    .filter(Boolean)
    .join(" ");

/** Share/clipboard body: scraped verse text (if any), then the
 *  reference, then the link. */
export const buildShareText = (
  verseText: string,
  passageRef: string,
  url: string
): string =>
  verseText
    ? `${verseText}\n\n${passageRef}\n\n${url}`
    : `${passageRef}\n\n${url}`;
