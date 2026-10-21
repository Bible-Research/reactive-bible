# Skipped Tests

**Last Updated:** 2026-10-21 (JOB-8 reconcile + Job 17 triage,
re-verified after the refac/19 merge)

This document lists every `it.skip` / `describe.skip` /
`it.todo` remaining in the tree, plus the env-gated perf suites
and FIXME-pinned behavior tests. Verified against
`grep -rn "it\.skip\|describe\.skip\|it\.todo\|test\.skip\|
skipIf" src --include="*.test.*"`.

All previously listed stale entries were resolved across both
audits: RegisterPage, authStore login/register, UserMenu,
MainMenu, LoginPage, NoteCard, TagNotesRoute (file deleted),
notes-workflow (file deleted), BottomNav / ProtectedRoute /
NotesView (files deleted), Audio.test it.skips, api.test
mutation it.skips, EditNoteModal / AddTagNoteModal / NoteForm
modal-submission skips, and TranslationSelector. Since the
JOB-8 reconcile these pinned skips were also resolved:

- `store.test.tsx` reorder-invalidation `it.skip` —
  `reorderNotes` now invalidates the notes cache and refetches
  the page (`refreshNotesPage` in `stores/bibleStore/
  notesSlice.ts`).
- `AddStandaloneNoteModal.test.tsx` /
  `AddTagNoteModal.test.tsx` "reopened mid-session" `it.skip`s —
  `useNoteEditor` keeps the draft (note id + text) in module
  state across the modal's unmount, so the next autosave
  PATCHes instead of POSTing a duplicate.

## Current state

**There are no `it.skip` / `describe.skip` tests.**

## Open todos (it.todo)

### `src/utils/filesetGroups.test.ts:661`

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
  — `describe.skipIf` at :38 ('Render Performance'),
  :82, :146 ('Memory Efficiency')
- `src/components/PassageView.performance.test.tsx`
  — `describe.skipIf` at :68 ('Render Performance'),
  :304, :418 ('Large Data Handling');
  `it.skipIf` at :121, :357

---

## FIXME-pinned PASSING tests

These run green today but assert current behavior that is
suspected wrong; each carries an in-code FIXME. Listed for
visibility — they are not skipped.

- `src/utils/filesetGroups.test.ts:252` — empty backend
  `audio_options: []` suppresses all client-side audio grouping.
- `src/utils/filesetGroups.test.ts:264` — backend-option ids are
  minted 0-based while client grouping mints 1-based.
- `src/utils/filesetGroups.test.ts:640` — drifted-id index is
  interpreted 0-based (see the `it.todo` above).
- `src/utils/appUpdate.test.ts:204` — `isUpdateManifest` checks
  `typeof versionCode === 'number'` but not `Number.isInteger`.

---

## Triage outcomes (2026-02)

### Restored (fix + unskip)

- `components/RegisterPage.test.tsx` — renamed from
  `.test.tsx.skip`, unskipped, fixed Mantine `PasswordInput`
  label queries and the duplicate "Create Account" text.
- `components/LoginPage.test.tsx` — rewritten: stale
  copy replaced, the "loading during login" test (broken by
  design) replaced with an `isLoading` store-state test, and a
  stale-error-on-mount case added for the new `clearError`
  effect.
- `components/UserMenu.test.tsx` — unskipped; passes
  as written under happy-dom.
- `components/ProtectedRoute.test.tsx` — unskipped;
  state now seeded via `renderWithProviders` `authStoreState`,
  and a pre-checkAuth persisted-token case was added.
- `components/MainMenu.test.tsx` — rewritten for the current
  drawer (Read Bible / View Notes / theme + auth-gated New
  Note and Tag Management).
- `components/NoteCard.test.tsx` — rewritten with the current
  `aria-label="*-note"` action selectors; covers ownership
  gating, share/play/comment badges.
- `stores/authStore.login.test.tsx` — unskipped;
  the stale `bibleresearchapi.vercel.app` URL now derives
  from `API_BASE_URL`, the duplicated "Initial State"
  describe was dropped, and assertions read
  `store.getState()` instead of `renderHook` results (which
  go stale when `act()` rejects).
- `stores/authStore.register.test.tsx` — same
  `getState()` treatment.
- `api.test.ts` — the `addTagNote` POST and `deleteNote`
  DELETE tests; MSW mutation handlers were added in the
  same change.
- `components/AddTagNoteModal.test.tsx` — real submit test
  (POST + close) and the verse-selection-clear case ported
  from `notes-workflow`.
- `components/NoteForm.test.tsx` — real `onSubmit(tagId,
  text)` and `onTagDropdownOpen` tests; the "portal prevents
  submission" rationale was disproved in-file.
- `components/Audio.test.tsx` — the Media Session metadata
  test implemented (`navigator.mediaSession` +
  `MediaMetadata` stubbed).

### Deleted (rotted or superseded)

- `components/BottomNav.test.tsx` — covered through the real
  App by `audio-stop-on-chapter-switch-62`,
  `chapter-scroll-reset-63`, and
  `__tests__/bottomnav-title-sync-95`.
- `components/NotesView.test.tsx` — the deleted suite was the
  pre-refactor one (it tested a vestigial component); a live
  file of the same path exists at
  `src/components/NotesView.test.tsx`.
- `routes/TagNotesRoute.test.tsx` — rotted (stale
  strings, old `fetchNotes` signature); error/empty/share
  cases ported to `TagNotesRoute.states.test.tsx`.
- `components/EditNoteModal.test.tsx` empty `it.skip` — the
  post-submit refetch-args case already exists as a live
  test in the same file.
- `components/TranslationSelector.test.tsx` `it.skip` —
  stale portal rationale; live tests already drive the
  Select dropdown.
- `Audio.test.tsx` `it.skip` ×2 (load-and-play,
  auto-advance) — superseded by `useChapterAudio` and the
  `Audio.autoAdvance`/`Audio.mediaControls` suites.
- `__tests__/integration/notes-workflow.test.tsx` — the
  modal-close and selection-clear assertions were ported
  into `AddTagNoteModal.test.tsx`.
- `__tests__/integration/parallel-async.test.tsx` — tested
  no production code.

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
