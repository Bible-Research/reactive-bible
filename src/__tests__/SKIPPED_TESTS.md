# Skipped Tests

**Last Updated:** 2026-10-14 (JOB-8 reconcile)

This document lists every `it.skip` / `describe.skip` /
`it.todo` remaining in the tree, plus the env-gated perf suites
and FIXME-pinned behavior tests. Verified against
`grep -rn "it\.skip\|describe\.skip\|it\.todo\|test\.skip\|
skipIf" src --include="*.test.*"`.

All previously listed stale entries were resolved in wave 1:
RegisterPage, authStore login/register, UserMenu, MainMenu,
LoginPage, NoteCard, TagNotesRoute (file deleted), notes-workflow
(file deleted), BottomNav / ProtectedRoute / NotesView (files
deleted), Audio.test it.skips, api.test mutation it.skips,
EditNoteModal / AddTagNoteModal / NoteForm modal-submission
skips, and TranslationSelector.

---

## Skipped tests (it.skip) — FIXME-pinned prod bugs

Each of these names a real production bug in a file the
test-quality jobs did not own. Unskip when the prod fix lands;
each in-code FIXME describes the bug.

### 1. `src/store.test.tsx:378`

`it.skip('invalidates the notes cache after a successful
reorder', ...)`

- **Reason:** `store.tsx` `reorderNotes`' success path never
  calls `clearNotesCache` nor refetches — the notes cache has
  no TTL, so the next `fetchNotes` for the tag serves the
  pre-reorder order until eviction. `moveNoteAfter` does
  invalidate via `refreshNotesPage`; `reorderNotes` should too.

### 2. `src/components/AddTagNoteModal.test.tsx:406`

`it.skip('PATCHes the autosaved draft instead of POSTing a
second note when reopened mid-session', ...)`

- **Reason:** reopening the modal orphans the autosaved draft
  on the server — `savedNoteIdRef` resets in the `opened`
  effect (`AddTagNoteModal.tsx`), so the next autosave POSTs a
  second note instead of PATCHing the existing one. The fix
  (delete the draft on close, or persist/resume its id across
  reopen) is a product decision, not a test fix.

### 3. `src/components/AddStandaloneNoteModal.test.tsx:214`

`it.skip('PATCHes the autosaved draft instead of POSTing a
second note when reopened mid-session', ...)`

- **Reason:** same draft-orphan bug as #2, in
  `AddStandaloneNoteModal.tsx`.

---

## Open todos (it.todo)

### `src/utils/filesetGroups.test.ts:607`

`it.todo('decide 0-vs-1-based semantics for drifted
{abbr}:{kind}:{n} ids — see FIXME above')`

- **Reason:** `resolveAudioFileset` treats a drifted id's parsed
  index as 0-based (`candidates[parsed.index] ?? candidates[0]`),
  while backend-minted ids are 1-based — a suspected off-by-one.
  Intent is unproven (legacy 0-based client ids vs 1-based
  backend ids), so current behavior is pinned and the decision
  is parked here.

---

## Env-gated suites (not skips — `PERF=1` to run)

Wall-clock / memory-threshold assertions are wrapped in
`describe.skipIf(!process.env.PERF)` /
`it.skipIf(!process.env.PERF)` so they run only under
`PERF=1 npm test`. They are tautology-prone and flaky under
shared CI machines; behavioral assertions in the same files
always run.

- `src/components/Passage.performance.test.tsx`
  — `describe.skipIf` at :41 ('Render Performance'),
  :93, :165 ('Memory Efficiency')
- `src/components/PassageView.performance.test.tsx`
  — `describe.skipIf` at :64 ('Render Performance'),
  :300, :414 ('Large Data Handling');
  `it.skipIf` at :117, :353

---

## FIXME-pinned PASSING tests

These run green today but assert current behavior that is
suspected wrong; each carries an in-code FIXME. Listed for
visibility — they are not skipped.

- `src/utils/filesetGroups.test.ts:251` — empty backend
  `audio_options: []` suppresses all client-side audio grouping.
- `src/utils/filesetGroups.test.ts:263` — backend-option ids are
  minted 0-based while client grouping mints 1-based.
- `src/utils/filesetGroups.test.ts:586` — drifted-id index is
  interpreted 0-based (see the `it.todo` above).
- `src/utils/appUpdate.test.ts:127` — `isUpdateManifest` accepts
  a non-https `apkUrl`.
- `src/utils/appUpdate.test.ts:137` — manifest without
  `versionName` passes validation.
- `src/utils/appUpdate.test.ts:145` — non-integer `versionCode`
  passes validation.
- `src/utils/appUpdate.test.ts:221` — a failed update check
  still stamps `app_update_last_check`, throttling retries.
- `src/utils/cacheManager.test.ts:137` — duplicate verse inputs
  inflate `metadata.totalVerses`, eroding the 500-verse cap.

---

## Known Issues

### Post-Test Memory Error

- **Error:** `ERR_WORKER_OUT_OF_MEMORY`
- **When:** After all tests complete successfully
- **Impact:** None - all tests pass correctly
- **Description:** A "Worker terminated due to reaching memory
  limit" error can occur after the test suite completes. This
  is a cleanup/teardown issue in the test environment
  (happy-dom/vitest), not in test code. `fileParallelism:
  false` in `vite.config.ts` keeps peak memory in bounds; see
  the comment there for why.
- **Status:** Known issue; does not affect test results.
