# Skipped Tests

**Last Updated:** 2026-02-26 (Job 17 skip triage)

This document lists tests that are intentionally skipped via
`it.skip` / `describe.skip` / `.skip` filenames.

## Current state

**There are no skipped tests.** The 2026-02 audit triage
restored or rewrote every previously skipped suite; rotted
suites were deleted after porting their still-useful cases.

## Triage outcomes (2026-02)

### Restored (fix + unskip)

- `components/__tests__/RegisterPage.test.tsx` — renamed from
  `.test.tsx.skip`, unskipped, fixed Mantine `PasswordInput`
  label queries and the duplicate "Create Account" text.
- `components/__tests__/LoginPage.test.tsx` — rewritten: stale
  copy replaced, the "loading during login" test (broken by
  design) replaced with an `isLoading` store-state test, and a
  stale-error-on-mount case added for the new `clearError`
  effect.
- `components/__tests__/UserMenu.test.tsx` — unskipped; passes
  as written under happy-dom.
- `components/__tests__/ProtectedRoute.test.tsx` — unskipped;
  state now seeded via `renderWithProviders` `authStoreState`,
  and a pre-checkAuth persisted-token case was added.
- `components/MainMenu.test.tsx` — rewritten for the current
  drawer (Read Bible / View Notes / theme + auth-gated New
  Note and Tag Management).
- `components/NoteCard.test.tsx` — rewritten with the current
  `aria-label="*-note"` action selectors; covers ownership
  gating, share/play/comment badges.
- `stores/__tests__/authStore.login.test.tsx` — unskipped;
  the stale `bibleresearchapi.vercel.app` URL now derives
  from `API_BASE_URL`, the duplicated "Initial State"
  describe was dropped, and assertions read
  `store.getState()` instead of `renderHook` results (which
  go stale when `act()` rejects).
- `stores/__tests__/authStore.register.test.tsx` — same
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
  App by `repro-62`/`repro-63`/`routes/__tests__/repro-95`.
- `components/NotesView.test.tsx` — tested a vestigial
  component.
- `routes/__tests__/TagNotesRoute.test.tsx` — rotted (stale
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
- **Status:** Known happy-dom/vitest teardown quirk; does
  not affect results.
