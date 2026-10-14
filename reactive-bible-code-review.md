# reactive-bible — Multi-Agent Code Review

- **Date:** 2026-10-13
- **Repo:** `reactive-bible` (React 18 + TS + Vite + Zustand +
  Mantine v6 + TipTap + Howler, Capacitor Android)
- **Method:** one structure-mapping agent produced a review plan;
  six read-only review agents then examined disjoint file scopes in
  parallel. Findings are deduplicated where agents overlapped.
- **Caveat:** findings are static-analysis results; a few items are
  marked "needs device/backend verification".

## Severity summary

| Severity | Count |
|---|---|
| High     | 7 |
| Medium   | 17 |
| Low      | ~30 |

## High-severity findings (quick list)

1. Plaintext password logged to console on every login —
   `src/stores/authStore.tsx:54-58` (safety)
2. `/` global hotkey hijacks typing in TipTap editors, destroys
   drafts — `src/App.tsx:80-90` (bug/ux)
3. `publicFetch` sends stale token; DRF 401s poison all public
   reads — `src/utils/apiClient.ts:8-55` (bug)
4. Untrusted TipTap doc-JSON can crash render / stack-overflow —
   stored DoS on public note pages — `RichTextView.tsx` (safety)
5. Concurrent playlist `playIndex` calls leak Howls → overlapping,
   self-advancing audio — `useAudioPlaylist.ts` (bug)
6. "Play from note" index mismatch plays wrong note or kills the
   playlist — `TagNotesRoute.tsx:694-745` (bug)
7. New users (zero tags) get an infinite spinner on `/notes` —
   `NotesRoute.tsx:42-74` (ux)

---

## 1. Reader & routing

Scope: routes, App shell, Passage/Verse/BibleSelector, ref utils.

### H. `/` hotkey hijacks TipTap typing — bug/ux — HIGH
`src/App.tsx:80-90` (also flagged by platform agent)

The keydown guard excludes only `INPUT`/`TEXTAREA`. TipTap's
`.ProseMirror` surface is a `contenteditable` DIV, so pressing `/`
while composing a note/comment calls `preventDefault()` (keystroke
swallowed) and navigates to `/search`, unmounting route-scoped
modals and losing drafts. Also fires on focused `<select>`, and
every `/` press on `/search` pushes a duplicate history entry.

**Fix:** also bail on `isContentEditable` /
`closest('[contenteditable]')`, `SELECT`, `event.isComposing`; skip
navigation when already on `/search`.

### M. Audio-version change refires the text-fetch effect — bug
`PassageView.tsx:425-430`

`resolvedAudioFilesetId` is a dep of the chapter-fetch effect but
only feeds `prefetchAudioUrl`. Switching only the audio version
causes `setLoading(true)` → scroll reset →
`syncReadingPosition(..., 1)` overwriting the saved position, and
aborts headings-only TOC mode.

**Fix:** split audio prefetch into its own effect.

### M. Out-of-range chapters render a blank page — bug
`PassageView.tsx:473-476`, `bibleUtils.ts:244-246`,
`api.tsx:112-128`

`parseBibleRef` has no upper bound on chapter. `/bible/MAL.5`,
`/bible/JHN.999`, or a failed `loadKjvData()` → `{verses: []}` with
`showEmptyHint` gated on `isNonKjv` → empty page, BottomNav title
"JHN 999", both arrows disabled. `LegacyBibleRedirect` has the
same hole.

**Fix:** validate `chapter <= getChapters(bookId).length` in
`parseBibleRef`/`LegacyBibleRedirect`; drop the `isNonKjv` gate on
the empty hint or add a KJV "chapter not found" alert.

### M. Every selected verse scrolls into view on load — ux
`Verse.tsx:208-216`

`/bible/JHN.3.16-18` mounts three `isActive` verses; each fires
`scrollIntoView` so the view settles on the *last* verse (18), not
the first (16).

**Fix:** scroll once — to the min selected verse — from
PassageView, or gate on being the first ref in the selection.

### L. `pendingScrollVerse` cleared on book mismatch — bug
`PassageView.tsx:320-330` — pending MRK position is discarded if a
PSA load resolves first. Clear only on match.

### L. BottomNav shows raw USFM code — ux
`BottomNav.tsx:112` renders "JHN 3"/"1CO 13"; use
`selectActiveBookName`/`toBookName`.

### L. Audio prefetch ignores book boundaries — bug
`PassageView.tsx:384-386` prefetches `REV.23` audio (bogus
`wordpocket .../66/23.mp3` for KJV) instead of `MAT.1`; use
`getAdjacentChapters` like the verse prefetch.

### L. Audio fileset fallback hands raw product id to API — bug
`PassageView.tsx:263-271` — `?? activeAudioFilesetId` can pass an
unroutable grouped id; pass `null` (already guarded at
`api.tsx:884`).

### L. Picker verse column re-scrolls on every render — ux
`PassagePicker.tsx:125-129` + `BibleSelector.tsx:27-32` —
`pickerVerses` is a fresh array each render and is a dep of the
scroll effect. `useMemo` it.

### L. `decodeVerses` doesn't dedupe / clamp — bug
`bibleUtils.ts:30-47` — `JHN.3.16,16` survives as duplicates;
`JHN.3.999` creates phantom refs counted by the toolbar but never
rendered. Dedupe + clamp against `getVerses(bookId, chapter)`.

### L. BibleSelector chapter select doesn't close drawer — ux
`BibleSelector.tsx:61-71` — `onSelectChapter` doesn't
`setOpened(false)`; `onSelectVerse` drops the `extendRange` flag.
`console.log` leftovers at 62-64 and `BottomNav.tsx:51-54,66-69`.

### L. Right-click context menu disabled on all verses — ux
`Verse.tsx:252` — `onContextMenu preventDefault` blocks the
standard Copy menu, contradicting the "allow users to copy text"
comment. (Also flagged by notes agent.) Scope to touch devices or
remove.

### L. A11y — non-interactive clickables
Verses (`Verse.tsx:228`), section headings (`SectionHeading.tsx:28`),
BottomNav title (`BottomNav.tsx:100`), picker rows
(`PassagePicker.tsx:145` uses `<a href="/">` + preventDefault).
No `role`/`tabIndex`/keyboard handlers.

### L. `BibleRoute` subscribes to the whole store — perf
`BibleRoute.tsx:18-26` — `useBibleStore()` without selector
re-renders on every debounced position write/audio tick. Use
narrow selectors.

### Verified correct (reader)
- `BookNotInFilesetError` → testament-mismatch hint routing.
- `tocAbortRef` TOC-abort logic; `kjvDataLoader` shared in-flight
  promise; capture-phase scroll listener in MyHeader;
  `firstVisibleVerse` stale-write guards.

---

## 2. Audio subsystem

Scope: Audio.tsx, AudioPlayer, playlist/media-session/keep-alive/
verse-highlighter hooks, audioUtils/nativeAudio.

### H. Concurrent `playIndex` leaks Howls → overlapping audio — bug
`useAudioPlaylist.ts:90-112, 203, 230, 259-271, 413-414`

`loadFromIndex` checks only the boolean `stoppedRef` after each
await — no generation counter. Rapid next/prev, stop→start, or
start-during-fetch lets a superseded coroutine create a Howl that
overwrites `audioRef.current` (last writer wins). Each leaked
Howl's `onload` plays on top of the current item, and its `onend`
keeps advancing through the *old* items array — an autonomous
parallel playlist.

**Fix:** add a `playSeqRef` generation counter (like `loadSeqRef`
in Audio.tsx); check it before materializing the Howl; unload
stale Howls.

### M. Fallback swap during the 2s inter-chapter gap never plays — bug
`Audio.tsx:324-339, 686-708, 1060-1071`

If the next chapter's Howl `loaderror`s during the gap,
`tryNextFallback` swaps `audioRef` but `advanceTimerRef` is still
set → load effect skips `safePlay`, and the pending timer bails on
`audioRef !== howl`. Result: `isPlaying` true, media session says
"playing", silence forever.

**Fix:** `clearAdvanceTimer()` in `tryNextFallback`, or re-target
the scheduled play at the current `audioRef`.

### M. Chapter audio and playlist not mutually exclusive — bug
`Audio.tsx:729-734` + `useAudioPlaylist.ts:478-484`

Reset effect early-returns in playlist mode without tearing down
the chapter Howl → two streams play at once; two
`useVerseHighlighter` instances fight over `audioActiveVerse`;
`onChapterEnd` can navigate mid-playlist.

**Fix:** on entering playlist mode, run the dispose/teardown path
for the chapter Howl.

### M. `onChapterEnd`/`advanceChapter` read a lagging store — bug
`Audio.tsx:343-363, 511-515`

Next/prev computed from `useBibleStore.getState()` — during the
URL→store sync window rapid multi-skip collapses to one target;
`tryNextFallback` re-arm check (`bookId !== activeBookId`) can
misfire and surface "Failed to load audio" instead of walking
alternates.

**Fix:** derive adjacency from `audioChapterKeyRef` like
`preloadNextChapter` does; store as fallback.

### M. Auto-advance navigates away from /search and /notes — ux
`Audio.tsx:343-363` vs 158-176 — playlist mode skips navigation
off-route, but chapter `advanceChapter` unconditionally calls
`navigate`. Chapter ending while the user is in search yanks them
back to `/bible`.

**Fix:** off `/bible`, update store fields without navigating (or
suppress chapter-mode advance).

### L-M. Pause mid-fetch still materializes a Howl; stuck spinner — ux
`Audio.tsx:1081-1210` — no `isPlaying` re-check after
`resolveAudioUrl`; hidden loaded Howl lingers, `loading` stays
true forever. Re-check intent before `setAudio`; clear `loading`.

### L-M. `handleClose` doesn't invalidate in-flight load — bug
`Audio.tsx:1252-1265` — bump `loadSeqRef` in `handleClose` so a
late Howl can't resurrect the media session for a closed player.

### L-M. Playlist teardown uses bare `unload()` — safety
`useAudioPlaylist.ts:80-88` vs `disposeHowl` (Audio.tsx:278-304) —
the app's own comment says `unload()` alone can leave the pooled
`<audio>` node playing briefly; stale `attachNode` listeners
survive. Extract `disposeHowl` to a shared util.

### L. KJV playlist items ignore verse bounds — ux
`useAudioPlaylist.ts:205-257, 336-411` — no timestamps for ENGKJV →
a note covering JHN 3:16 plays all of John 3. Notify or skip
timestamp-less items.

### L. Battery-prompt flag burned before plugin call — bug
`nativeAudio.ts:36-47` — set `BATTERY_PROMPT_KEY` only after a
successful `checkBatteryOptimizations()`.

### L. Native MediaSession metadata never cleared — ux
`useMediaSession.ts:262-272` — mirror a metadata clear on
deactivate, not just `playbackState: 'none'`.

### L. Web + native action handlers both registered — safety
`useMediaSession.ts:221-244` — potential double dispatch of
`seekBy`/`nexttrack` on Capacitor; needs on-device verification;
if both fire, prefer native when `isNative()`.

### L. Loading spinner disables play button — no cancel — ux
`Audio.tsx:1295` — a hung `fetch` (no timeout in
`getBibleAudioUrl`) shows a Loader forever. Re-enable as cancel or
add abort/timeout.

### L. Header icon doesn't reflect chapter playback — ux
`Audio.tsx:1288-1312` — `chapterPlaying` computed but unused; icon
shows ▶ during chapter playback.

### L. Loop toggle partial no-op in playlist mode — ux
`useAudioPlaylist.ts:336-411` + `AudioPlayer.tsx:88-91` — bounds
checker advances at `endTs` regardless; loop only affects
unbounded items.

### L. Doc drift — `MEDIA_SESSION_BEST_PRACTICES.md`
Doc prescribes awaiting play promises / never setState in
handlers; code deliberately does the opposite (correct for ANR).
Update the doc.

### L. Dead state `audioPlaylistEnded` — hygiene
`store.tsx:77` — set, never read.

### Verified correct (audio)
- Dispose order, blob revocation, `loadSeqRef`/`preloadTokenRef`
  supersede guards, adopted-Howl fallback re-arm.
- ENGKJV→wordpocket `index + 1` numbering; ENGESV timestamp
  announcement adjustment; `verseNumbers` bounds checker cleanup.
- Media-session single ownership, sync/never-throw handlers,
  validated position state; keep-alive grace period.

---

## 3. API layer, state & cache

Scope: api.tsx, store.tsx, authStore, apiClient, cacheManager,
filesetGroups, config, types.

### H. Plaintext password logged on every login — safety
`authStore.tsx:54-58` — `console.log('🔐 Login attempt:', { body:
requestBody })` includes `password`. Register path is correctly
masked; this is an oversight, fires in production + logcat.
**Fix:** delete the log or mask like register.

### H. `publicFetch` sends stale token → 401s poison public reads — bug
`apiClient.ts:8-55` — DRF authenticates before permission checks,
so an expired token makes even `AllowAny` endpoints return 401:
`getNotes`, `getNote`, `getTag`, `getCopyrightInfo`,
`getAudioTimestamps`, comment fetches all break for dead-token
holders — worse than anonymous, with no recovery hint.

**Fix:** on 401 in `publicFetch`, retry once without
`Authorization`; optionally clear the dead token.

### M. Notes-cache invalidation gaps (reorder, conflict, create) — bug
`store.tsx:544-605`, `cacheManager.ts:322-324`

- `reorderNotes` success never calls `clearNotesCache(tagId)` —
  cached pages keep old order permanently (no TTL).
- The 409 path calls `fetchNotes(tagId)` which *hits the stale
  cache* — the conflict "refresh" can be a no-op (contrast
  `moveNoteAfter.refreshCurrentPage`, which clears first).
- `addTagNote` (both add modals) does no invalidation — a new
  note is invisible on cached tag pages until another mutation.

**Fix:** clear tag cache after reorder + before the 409 refetch;
invalidate on create; centralize invalidation in the api
wrappers.

### M. `fetchHeadingsOnly` permanently caches `[]` on errors — bug
`api.tsx:142-160`, `cacheManager.ts:650-701` — no `response.ok`
check; a 429/500 JSON body yields `headings = []` written to a
no-TTL cache → headings permanently gone for that chapter (and via
the verse-cache merge at `api.tsx:172-175`).

**Fix:** check `response.ok`; cache only 2xx; short negative TTL.

### M. `getAvailableTranslations` persists empty results on failure — bug
`api.tsx:663-681` — error JSON → `results ?? []` →
`cacheTranslations(iso, [])` with no TTL; `catch → []` violates
the "don't swallow provider failures" rule. `findOwnerIso` uses
the poisoned cache.

**Fix:** throw on `!response.ok`; cache only real arrays.

### M. Notes cache key omits `filesetId` — stale translation text — bug
`cacheManager.ts:302-309`, `store.tsx:407-435` — backend fills
`note.verses[].text` from the requested fileset; switching text
translation then revisiting a cached tag serves old-translation
notes indefinitely. Add `filesetId` (and `pageSize`) to the key.

### M. Logout leaves private data behind — safety
`authStore.tsx:221-228`, `store.tsx:201-205` — `logout()` clears
only token/user; persisted `notes`/`tags`/`readingPositions` and
`bible_notes_cache` survive → next visitor on a shared device sees
them. (Compounds the notes-cache finding: cache is keyed by
tagId only, no auth discriminator — anon viewers get the owner's
cached private notes with no network request, per notes-agent
verification.)

**Fix:** `clearNotesCache()` + drop `notes`/`tags`/
`readingPositions` on logout (both manual and 401 paths), or stop
persisting them.

### M. Search 200-swallows provider failures — bug
`api.tsx:1377-1422` — `searchBible`/`searchBibleGrouped` read
`json.data?.verses ?? []`; a 200-wrapped `{error, error_code}` →
silent empty results; 429 loses `RateLimitError` semantics; only
`statusText` reaches the user. Check `json.error`/`error_code` and
throw the typed errors.

### L. `cacheAudioUrl` NaN expiry never expires — bug
`cacheManager.ts:453-459` — non-numeric `Expires` → `NaN`, treated
as fresh forever. Guard with `Number.isFinite`.

### L. `fetchNotes` resolves one fileset for all notes — bug
`store.tsx:407-413` — resolves against the *viewed* book's
testament; testament-split products send an unservable fileset for
cross-testament notes. Omit `fileset_id` for split products or
resolve server-side.

### L. `getAllNotes` unbounded loop + dead code — bug/hygiene
`api.tsx:1129-1144` — `response.next !== null` is true for
`undefined`; no callers found. Delete or cap.

### L. Raw `fetch` skips the TypeError retry — ux
`api.tsx:148, 184, 667, 725, 1377, 1412` — flaky mobile drops
surface instant errors where one retry would succeed. Route via
`publicFetch`.

### L. Retry on TypeError can duplicate writes — safety
`apiClient.ts:108-110, 159-165` — retrying lost-response POSTs can
double-create notes/tags/comments/images. Retry only idempotent
methods or add idempotency keys.

### L. `isAuthenticated` not persisted → first-pass double fetches — ux
`authStore.tsx:246-257`, `App.tsx:48-53` — token rehydrates
synchronously but `isAuthenticated` flips only after `checkAuth`,
re-running TagNotesRoute's load. Initialize from `!!token` or
persist it.

### L. 409 body parse can throw wrong error type — bug
`api.tsx:421-424, 490-493` — non-JSON 409 → `SyntaxError` escapes
`instanceof ConflictError` checks. `.catch(() => ({}))`.

### L. Drifted product-id fallback off-by-one — bug
`filesetGroups.ts:495-514` — 1-based backend ids hitting the
index fallback pick the wrong option. Try `index` then `index-1`.

### L. Duplicate `Note`/`Tag` interfaces — hygiene
`api.tsx:1053-1072` vs `types.ts:1-32` — local `Note` lacks
`error`/`error_code`/`headings`; import from `./types`.

### L. Minor observations
- `migratePersistedState` v5 correct; residual: persisted
  `verseSelection` can carry non-'bible' scopes — drop in
  `partializeState`.
- `getCachedVerses` rewrites the whole blob per read for unused
  per-verse bookkeeping — dead cost.
- `cacheVerses` double-counts on repeated verse numbers.
- `config.ts`: whitespace-only `VITE_API_BASE_URL` is truthy →
  broken URLs; `.trim()` it.
- `prefetchReadingPositions` lets a stale remote position
  overwrite a fresher local one — narrow race.

### Verified correct (api/state)
- `injectBundledKjv`, `groupFilesets` WeakMap memoization,
  `checkAuth` race-freedom, `getAdjacentChapters` boundary logic,
  reading-position throw/null/`{}` contract.

---

## 4. Notes & tags pages

Scope: Notes/TagNotes/NoteDetail/TagManagement routes + card,
tree, modals, order menu, pagination, VerseActionToolbar.

### H. "Play from note" index mismatch — bug
`TagNotesRoute.tsx:694-711` vs `719-745`, `useAudioPlaylist.ts:93-99`

`noteIndex` is computed in `sortedNotes`, but the playlist is
built from `sortedNotes.filter(n => n.verses?.length > 0)`. Any
earlier verse-less note shifts the index; worst case
`index >= items.length` ends the playlist while the UI toasts
"Playlist Started".

**Fix:** find the index inside the same filtered array passed to
the playlist.

### M. Notes cache not auth-scoped — private notes leak — safety
`cacheManager.ts:302-348`, `store.tsx:416-460` — cache key is
`tagId:page:ordering`, no TTL, never cleared on logout. An
anonymous visitor on a shared browser gets the previous owner's
cached private notes with no request. (Merged with §3 logout
finding — fix both places.)

### M. `EditNoteModal` refetches the *edited* tag, resets page — bug
`EditNoteModal.tsx:147-175` — `fetchNotes(tagId)` uses the modal's
select value (may differ from route tag → wrong tag's notes render
under current heading) and defaults to page 1 no-ordering (URL
`?sort=` then client-sorts the wrong page's data).

**Fix:** refetch with current `{ordering, page}`; only when the
tag is unchanged; handle the moved-to-other-tag case.

### M. "Move to top" moves to visual bottom in `custom_desc` — bug
`TagNotesRoute.tsx:332-351`, `NoteOrderMenu.tsx:102-107` — always
moves before canonical-first; desc display order is reversed, so
the note lands at the bottom. The disabled-state check is also
inverted for desc. Translate like `onMoveAfter` does.

### M. Sort change fires duplicate fetches; client-sort branch dead — bug
`TagNotesRoute.tsx:513-545` vs `:270` — `setSearchParams({sort})`
re-triggers the load effect (sortOrder dep), so the server branch
double-fetches and the client-side optimization never takes
effect; the full-page loader also blanks the screen.

**Fix:** let the effect own the fetch; use `pageLoading` on sort.

### M. Public tag page performs authenticated calls — bug/ux
`TagNotesRoute.tsx:293-299, 431-465, 927-931`

- Anonymous refresh → `getTags()` → 401 → logout + three error
  notifications for a successful refresh.
- `isDraggable`/order menu gated on `isAuthenticated` only → a
  logged-in non-owner sees drag handles/`#k` badges/menus whose
  calls then 403. Gate on ownership (`is_owner`) instead.

### M. `is_owner !== false` fails open; delete failure silent — safety/ux
`NoteCard.tsx:124-125`, `TagNotesRoute.tsx:377-404` — missing
`is_owner` (undefined) renders edit/delete for non-owners; prefer
`=== true` (verify backend always sends it). `handleDeleteNote`
calls `api.deleteNote` directly: no try/catch, no success toast —
a failed delete is an unhandled rejection and silent no-op.

### M. `/tags` unprotected → "Session Expired" spam — ux/safety
`routes/index.tsx:38`, `TagManagementRoute.tsx:36-66`,
`MainMenu.tsx:119-142` — anonymous visitors get 401 →
logout-notification + "Failed to load tags" + (via
`AddStandaloneNoteModal`'s un-awaited `getTags`) an
errorReporter "Unexpected error" — triple notification.
`ProtectedRoute` exists but is dead code.

**Fix:** gate `/tags` + the menu rows on `isAuthenticated` (or
wire `ProtectedRoute`); only fire "Session Expired" when a token
was attached; await/catch the modal's `getTags()`.

### M. NoteCard heading renders " 1:1" for verse-less notes — bug/ux
`NoteCard.tsx:113-122` — empty `verses` → `book=""`, `1:1`.
Multi-chapter notes produce nonsense ranges ("Genesis 1:31-1");
`before_verse` heading lookup matches verse number in *every*
chapter of a multi-chapter note.

### M. "Song Of Solomon" title-casing breaks external links — bug
`bibleUtils.ts:142-158`, `VerseActionToolbar.tsx:274-297` —
`titleCase` produces "Song Of Solomon" ≠ the `BOOK_TO_BLB_ABBR`/
BibleHub keys → BLB button silently disappears for SNG;
biblehub `song_of_solomon/N-V.htm` 404s (BibleHub uses `songs`).
Key the maps by USFM code.

### M. Autosave races & silent data loss in modals — bug/ux
`AddTagNoteModal.tsx:78-159`, `AddStandaloneNoteModal.tsx:32-60`,
`EditNoteModal.tsx:140-153`, `NoteForm.tsx:92-116`

- Modal unmount on close: in-flight POST's `savedNoteIdRef` dies
  with the component → reopening POSTs a second note; and a
  close-after-typing leaves an orphan persisted note.
- `EditNoteModal` autosave omits `verse_references` — picker
  changes are silently discarded on X/backdrop close.
- `handleSubmit` errors are `console.error`-only → silent save
  failures.
- `savedNoteIdRef` (parent) vs `inFlightRef`/`lastSavedRef`
  (NoteForm child) — the dedup contract spans two lifecycles and
  breaks on unmount.

### L. `NotesRoute` can spin forever — ux
`NotesRoute.tsx:42-74` — `getTags()` failure → catch-and-log →
permanent Loader. And zero tags → comment says "empty state" but
renders only the Loader (merged with the HIGH new-user finding —
fresh signup lands on this spinner).

### L. `reorderNotes` integer positions vs float positions — bug-risk
`store.tsx:544-605` — dense integer writes can collide with
server-rebalanced floats; 409 refresh resets to page 1 while
`?sort=` still shows the old value.

### L. Drag-reorder rejection unhandled — bug
`TagSection.tsx:111-119` — `reorderNotes` rethrows; caller doesn't
await → unhandled rejection.

### L. No clipboard/share fallback on http — ux
`TagNotesRoute.tsx:494-509`, `NoteDetailRoute.tsx:96-105`,
`NoteCard.tsx:147-156`, `VerseActionToolbar.tsx:217-258` — on
non-secure contexts every share path ends in an error toast (and
biblemapper still opens after a failed copy).

### L. Share text DOM-scrape drops verses — bug
`VerseActionToolbar.tsx:184-193` — only rendered verses are found;
folded cards share a partial passage silently; brittle coupling to
`title="passage-verse-…"` test attrs.

### L. Third-party iframe without `sandbox` — safety
`VerseActionToolbar.tsx:510-520` — biblemapper iframe lacks
`sandbox`/`referrerPolicy`/`loading`; no fallback if framed-ancestors
is ever set.

### L. Misc
- Share text uses `notes.length` (page) not `notesCount`
  (`TagNotesRoute.tsx:470-472`).
- `bottomOffset = 56` assumes BottomNav, which renders only on
  `/bible` → toolbar floats mid-screen on `/notes`
  (`App.tsx:74`, `VerseActionToolbar.tsx:311`).
- `Pagination.tsx:80-90` — no `aria-label`/`aria-current`.
- Tag delete `window.confirm` doesn't warn about associated
  notes/child tags (`TagManagementRoute.tsx:68-92`).
- `TagTree` search filters before `buildTree` → matches render as
  roots, losing hierarchy (`TagTree.tsx:47-79`).
- `fetchNotes` sets `lastSelectedTagId` when browsing foreign
  public tags (`store.tsx:471`).
- Tag `Select` maps by name — duplicate names select the first
  match (`NoteForm.tsx:151-161`).
- Playlist items cover only a note's first book+chapter block —
  later-chapter verses silently dropped (`TagNotesRoute.tsx:719-745`).
- `useBibleStore.getState()` read during render for
  `initialPageRef` (`TagNotesRoute.tsx:86-87, 137`).

### Verified correct (notes/tags)
- publicFetch/authenticatedFetch split at call sites; `custom_asc`
  ordering parity with server; desc drag-reversal; StrictMode
  page-restore guards; delete-last-note-on-page fallback;
  note-scope `note.id` consistency; share AbortError handling;
  note error/500-cap display.

### Needs backend verification
- Whether `/notes/?tag_id=` returns `is_owner` for all callers and
  private notes for owners (severity of the cache-leak and
  fail-open findings).
- Integer vs float `tag_position` coexistence after rebalances.

---

## 5. Rich text & comments

Scope: RichTextEditor/View, ScripturePassage, CommentThread/Node/
Form/Actions, NoteForm, scriptureMention ext, linkify/ref/tiptap/
commentTree utils.

### H. Untrusted doc-JSON crashes render — stored DoS — safety
`RichTextView.tsx:42,123`, `tiptapContent.ts:38`

`(node.content ?? []).map` / `(node.marks ?? []).forEach` assume
arrays; truthy non-arrays throw `TypeError` mid-render, and
unbounded recursion in `renderNode`/`collectText` stack-overflows
on deep docs. Comments are public-fetched and rendered on the
public `/notes/:noteId` page — any authenticated user can POST
crafted `content` JSON on someone's public note and take down the
whole page for every visitor (only the app-level ErrorBoundary
catches it).

**Fix:** `Array.isArray` guards everywhere; depth/node-count caps;
fallback render path scoped to the comment.

### M. Double-click never reopens the scripture picker — bug
`scriptureMention.tsx:272, 276, 376-394, 416-422` — `allow()`'s
terminated-mention and suppression checks fire before the
reopen intent; the path is unreachable. Add an explicit
force-open flag checked first in `allow()`.

### M. `ScripturePassage` error state never clears — bug
`ScripturePassage.tsx:43-53` — one transient failure bricks the
preview for the component's life; stale verses also flash on ref
change. Reset `error`/`passages`/`headings` at effect start.

### L-M. `loading` can latch true on poll/load race — bug
`CommentThread.tsx:67-96` — a `silentLoad` poll landing during a
Retry `load()` makes its version stale → `setLoading(false)`
never runs → permanent spinner.

### L-M. Author check uses the as-typed login username — bug
`CommentNode.tsx:70-72` vs `authStore.tsx:95` — login stores the
*typed* string (register stores the server's canonical one);
casing/spacing differences hide edit/delete on your own comments.
Compare canonical username or `author.id`.

### L-M. Autosave POSTs `tag: ''` every 5s when no tag selected — ux
`NoteForm.tsx:94-104` — guard skips empty text but not empty
tagId → repeated 400s, only `console.error` feedback.

### L-M. `@`-token false positives render red — ux
`scriptureLinkify.tsx:5` — `bob@example.com` → `@example.com`
flagged invalid (red span + invalid decoration). Require a
plausible ref shape before marking invalid.

### L. Image-refresh retry budget burns permanently — bug
`CommentThread.tsx:98-132` — `imageRefreshCount` never resets;
three early failures permanently disable signed-URL refresh for
that comment; refresh-fetch errors also consume the budget. Reset
on new `images` data / key by URL.

### L. `formatTime` renders "Invalid Date" — bug
`CommentNode.tsx:77-91` — guard `Number.isNaN(d.getTime())`, fall
back to the raw string.

### L. Editor schema drops foreign node types on save — consistency
RichTextView renders `scriptureRef`/`mention` nodes, but the
editor schema strips unknown nodes → editing a note containing
one silently deletes it. Add a light node spec or normalize.

### L. Perf — unmemoized parse/render
`RichTextView` does `JSON.parse` ×2 + full render per parent
render (incl. each 30s poll) — `useMemo`/`React.memo`.
`invalidRefDecorations` recomputes over the whole doc on every
state update — gate on `docChanged`.

### L. Misc
- `linkifyScripture.tsx:26-46` — raw strings in keyed arrays
  (React key warnings).
- Scripture anchors have no `href` → not keyboard-focusable
  (`RichTextView.tsx:237`, `linkify.tsx:42`).
- Comment-variant editor grows unbounded (no max-height) —
  `RichTextEditor.tsx:117-118`.
- `NoteForm` submit lacks the empty-text guard; `onSubmit` typed
  `void` but awaited — type it `void | Promise<unknown>`.
- `silentLoad()` after `handleCreate` can wipe the optimistic
  insert (`CommentThread.tsx:191-195`).
- `insertReply` silently drops when the parent vanished between
  fetch and submit (`commentTree.ts:28-42`).
- `commentImageName` shows URL-encoded names (`%20`) —
  `commentTree.ts:8-11`.
- Image validation is client-side only; `authenticatedUpload`'s
  TypeError retry can double-upload (see §3).

### Verified correct (rich text)
- No `dangerouslySetInnerHTML`/`innerHTML`/`eval` in `src/`.
- `SAFE_LINK` is anchored — `javascript:`/`data:`/control-char
  variants dropped; `rel="noopener noreferrer"` set.
- Mention popup lifecycle clean (destroy + DOM removal on exit);
  Escape correctly stops propagation before Mantine.
- `lastEmitted` echo-prevention correct for actual callers.
- Legacy plain text can't inject markup; unknown nodes render
  children only; heading level clamped; no catastrophic regex
  backtracking; staged objectURLs revoked; poll/visibility
  cleanup correct; commentTree tombstone ops correct.

---

## 6. Auth UI, search, platform & infra

Scope: Login/Register/UserMenu/MainMenu/ProtectedRoute, SearchRoute,
errorReporter, appUpdate, Capacitor/Vite config, test infra, android.

### H. New users get an infinite spinner on `/notes` — ux
`NotesRoute.tsx:42-74`, `LoginPage.tsx:41-42`, `RegisterPage.tsx:64`
— merged with §4. Both login and register default to `/notes`;
zero-tag users hit the early return that "shows empty state" but
renders only a `Loader` — perpetual spinner as the first-run
experience.

### M. `/tags` + menu rows reachable anonymously → error spam — ux
Merged with §4. Additional detail: `MainMenu.tsx:119-142` shows
"New Note"/"Tag Management" to anon; `AddStandaloneNoteModal`'s
un-awaited `getTags()` rejection reaches `errorReporter` → third,
non-dismissible notification.

### M. `apkUrl` opened unvalidated; `_system` is a Cordova-ism — safety
`appUpdate.ts:51-82`, `useAppUpdate.tsx:40` — `isUpdateManifest`
checks only types; a compromised manifest yields arbitrary
`javascript:`/`intent:`/phishing URLs in the WebView.
`window.open(url, '_system')` relies on Capacitor patching —
`@capacitor/browser` isn't installed; verify on-device or switch
to `Browser.open`.

**Fix:** require `https:` + `github.com`/`*.githubusercontent.com`
host before offering the update.

### M. Tests can hit the real production API — test-infra/safety
`setupTests.ts:29` (`onUnhandledRequest: 'warn'` performs the
request!), `handlers.ts` — missing handlers for `/api/token/`,
register, tag writes, note detail, reorder/move/order-index,
reading-positions, timestamps; plus `GET /notes` vs `/notes/?`
trailing-slash mismatch likely dead-routes the notes handler.

**Fix:** `onUnhandledRequest: 'error'` in CI; add the missing
handlers.

### L. `location.state.from` redirect is dead code — bug/ux
`LoginPage.tsx:41` — only `ProtectedRoute` (dead) writes it →
login always lands on `/notes`. No open-redirect risk (`.pathname`
only). Wire ProtectedRoute or pass `state.from` from the
session-expired logout.

### L. Failed update check burns the hourly throttle — bug
`appUpdate.ts:105-117` — `markUpdateChecked()` before the fetch;
a transient blip suppresses checks for an hour. Mark only on
success.

### L. Resource-load errors → permanent "Unexpected error" — ux
`errorReporter.tsx:11,64-79` — expired image `signed_url`s and
stale chunks produce sticky alarm notifications; auto-close or
downgrade them.

### L. Auth `error` persists across login↔register — ux
Error lives in the persisted store; stale errors render on the
sibling page and on return visits. `clearError()` on mount.

### L. SearchRoute edge cases — ux
- `inputValue` seeded from `q` once — Back/Forward desyncs it.
- `resolveTextFileset → null` silently resets — no hint shown.
- Good otherwise: AbortController cleanup, reset paths, playlist
  teardown, per-result state resets.

### L. Dead files — hygiene
`ProtectedRoute.tsx` (only its own skipped test imports it),
`Button.tsx`, `MyLoader.tsx`, `SubHeader.tsx` (stale mock in
`Passage.performance.test.tsx:9` + console.logs),
`RegisterPage.test.tsx.skip` (`.skip` extension *and*
`describe.skip`).

### L. localStorage mock lacks `Storage` fidelity — test-infra
`setupTests.ts:6-14` — no `length`/`key(n)`; enumeration patterns
silently no-op vs production.

### L. Dependency notes — package.json
- `@types/react-router-dom@^5` alongside `react-router-dom@^7` —
  stale dead-weight types.
- Mixed TipTap pins: `^2.0.3` core vs `^2.27.2` extensions —
  align on one version (known subtle-PM-issue source).

### L. Platform notes
- `android:allowBackup="true"` (`AndroidManifest.xml:5`) — Auto
  Backup can carry WebView localStorage incl. the auth token to
  other devices; consider `allowBackup="false"` or exclusions.
- `minifyEnabled false` on release (`build.gradle:26`) — note only.
- `update.json`'s `apkSha256`/`minShellBuild` are generated by CI
  but never consumed — dead fields; if `apkSha256` is a trust
  anchor it must be verified client-side.
- `errorReporter` fixed `NOTIFICATION_ID` replaces prior errors;
  errors before `<Notifications/>` mounts are dropped.
- `vite.config.ts` `server.host: true` exposes dev server on LAN.

### Verified non-issues (platform)
- `location.state.from` not exploitable; capacitor.config clean;
  manifest has no cleartext/exported-provider issues; login/
  register DRF error parsing correct; dependabot workflow safe.

---

## Cross-cutting themes

1. **Cache invalidation is the biggest systemic gap** — notes
   cache has no TTL, no auth discriminator, no fileset key, and
   create/reorder don't invalidate; headings/translations caches
   persist error results forever. A short TTL + central
   invalidation in api wrappers fixes a whole class.
2. **401 semantics are muddled** — expired tokens poison public
   reads (publicFetch), while authenticated calls fire "Session
   Expired" at anonymous users on public pages. Both directions
   need: retry-without-token for public reads; only notify when a
   token existed.
3. **Generation-counter pattern missing in playlist** — Audio.tsx
   has `loadSeqRef`; `useAudioPlaylist` needs the same to stop
   leaked parallel playback.
4. **Silent failures** — several paths `console.error`-only
   (modal submits, delete, autosave); users get no signal.
5. **Dead code accumulates** — ProtectedRoute (with skipped
   tests), SubHeader, MyLoader, Button, getAllNotes,
   audioPlaylistEnded, `.skip` test files.
6. **Auth-gating is per-feature and leaky** — `/tags` and menu
   rows reachable anonymously; ownership gating uses
   `isAuthenticated` instead of `is_owner`.

## Suggested fix order

1. Password console.log (one line, immediate).
2. `/` hotkey contenteditable guard.
3. publicFetch stale-token retry.
4. NotesRoute zero-tags empty state + `/tags` gating.
5. Playlist generation counter + chapter/playlist exclusivity.
6. Notes cache: auth scope + fileset key + create/reorder
   invalidation + clear on logout.
7. RichTextView Array.isArray guards + depth cap.
8. Play-from-note index fix; EditNoteModal refetch fix;
   `custom_desc` move-to-top.
