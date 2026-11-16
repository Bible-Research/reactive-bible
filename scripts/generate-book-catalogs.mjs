#!/usr/bin/env node
/**
 * Regenerates the bundled per-language book-name catalogs
 * (`src/assets/bookNames.{en,lv,ru}.json`) used as the
 * stale-while-revalidate fallback for the bible structure
 * feature.
 *
 * Source of truth: the backend's own
 * `GET /api/v1/bible/structure/?fileset_id=` endpoint queried
 * with the canonical bible per language
 * (eng -> ENGESV, lvs -> LAVNLI, rus -> RUSSYN). Going through
 * the backend (instead of raw DBT) means the output already has
 * the USFM filter + bundled-name overrides applied, and no DBT
 * key is needed locally.
 *
 * Usage:
 *   node scripts/generate-book-catalogs.mjs [API_BASE_URL]
 * API_BASE_URL defaults to the production App Engine host; pass
 * http://localhost:8000 to regenerate from a dev backend.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE =
  process.argv[2] ?? 'https://bible-research-489314.ey.r.appspot.com';

const CANON = {
  en: 'ENGESV',
  lv: 'LAVNLI',
  ru: 'RUSSYN',
};

const USFM_ORDER =
  'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR ' +
  'NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO ' +
  'OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM ' +
  '1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE ' +
  '2PE 1JN 2JN 3JN JUD REV'.split(' ');
const ORDER = new Map(USFM_ORDER.map((c, i) => [c, i]));

const assetsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/assets',
);

for (const [lang, filesetId] of Object.entries(CANON)) {
  const url =
    `${BASE}/api/v1/bible/structure/` +
    `?fileset_id=${encodeURIComponent(filesetId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${lang}: HTTP ${res.status} from ${url}`);
  }
  const body = await res.json();
  if (body.error || !Array.isArray(body.books)) {
    throw new Error(`${lang}: bad response: ${JSON.stringify(body)}`);
  }
  // Same filter/order the backend applies — the endpoint output
  // should already satisfy this, kept as a belt-and-suspenders
  // check so a degraded upstream can't commit a bad catalog.
  const books = body.books
    .filter((b) => ORDER.has(b.book_id))
    .sort((a, b) => ORDER.get(a.book_id) - ORDER.get(b.book_id));
  if (books.length !== 66) {
    throw new Error(
      `${lang}: expected 66 books, got ${books.length} ` +
      `(check ${filesetId} upstream coverage)`,
    );
  }
  const out = join(assetsDir, `bookNames.${lang}.json`);
  await writeFile(
    out,
    JSON.stringify({ books }, null, 1) + '\n',
    'utf-8',
  );
  console.log(`${lang}: ${books.length} books -> ${out}`);
  console.log(`  GEN = ${books[0].name}`);
}
