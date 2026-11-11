# Investigate

(Open items go here.)

## Resolved

1. ~~Is `activeBookShort` state redundant and should be replaced
   with mapping from `activeBook`?~~ — Resolved: both were
   replaced by `activeBookId` (USFM code) in persisted-schema
   v3; the display name is derived on read via `toBookName()`
   (`src/store.ts`), and the migration in
   `src/stores/bibleStore/persistence.ts` deletes the old fields.
2. ~~Can one of `activeVerses` and `selectedVerses` be
   removed?~~ — Resolved: both were removed; verse selection is
   now the single `verseSelection: { scope, refs }` state
   (schema v2). See "Data model contracts" in `AGENTS.md`.
