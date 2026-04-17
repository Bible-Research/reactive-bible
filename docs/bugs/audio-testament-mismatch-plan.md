# Audio testament mismatch — analysis & plan

## Problem

When a user has selected, for example, the ESV **New Testament** audio fileset
(`ENGESVN1DA-opus16`) and then navigates to an **Old Testament** book (e.g.
Genesis), audio playback fails. The app stores a single
`activeAudioFilesetId` and uses it verbatim regardless of the current book's
testament. Because each translation's OT and NT audio are distinct filesets
(only a few letters apart), the selected NT fileset cannot serve OT passages
and the API returns empty / 404.

The out-of-the-box default makes this worse: the initial store state is
`activeAudioFilesetId: "ENGESHN1DA-opus16"` (NT-only), so fresh users cannot
play OT audio at all.

## Findings — how the API structures translations

`GET /api/v1/bible/translations/?language_iso=…` returns translations where
each has a `filesets[]` array. The critical fields are `id`, `type`
(`text_plain` / `audio` / `audio_drama` / …), and **`size`** which is the
coverage:

- `OT` — Old Testament
- `NT` — New Testament
- `C`  — Complete
- `OTP` / `NTPOTP` — portion variants

### Fileset ID naming convention

IDs follow a consistent pattern: `[LANG][VERSION][TESTAMENT][STREAM][-CODEC]`

| Segment | Example values | Meaning |
|---|---|---|
| `LANG` (3) | `ENG`, `LAT` | Language |
| `VERSION` (3) | `ESV`, `KJV`, `NKJ`, `NLT`, `CSB`, `BSL` | Bible version |
| `TESTAMENT` (1) | `N` / `O` / `P` | NT / OT / Portion |
| `STREAM` (3) | `1DA` / `2DA` | Narration / Drama |
| `CODEC` | (blank) / `-opus16` | mp3 / opus |

### Observed coverage (live API)

| Translation | OT audio | NT audio | Drama OT | Drama NT |
|---|---|---|---|---|
| `ENGESV` (ESV) | `ENGESVO1DA(-opus16)` | `ENGESVN1DA(-opus16)` | `ENGESVO2DA(-opus16)` | `ENGESVN2DA(-opus16)` |
| `ENGKJV` (KJV) | `ENGKJVO1DA(-opus16)` | `ENGKJVN1DA(-opus16)` | `ENGKJVO2DA(-opus16)` | `ENGKJVN2DA(-opus16)` |
| `ENGCSB` (CSB) | `ENGCSBO1DA(-opus16)` | `ENGCSBN1DA(-opus16)` | — | — |
| `EN1ESV` (ESV "Hear the Word") | **missing** | `ENGESHN1DA(-opus16)` | — | — |
| `ENGNKJV` (NKJV) | **missing** | `ENGNKJN1DA(-opus16)` | — | — |
| `ENGNLV` (NLV) | **missing** | `ENGNLVN1DA` | — | `ENGNLVN2DA` |
| `ENGNLT` (NLT) | — | — | `ENGNLTO2DA(-opus16)` | `ENGNLTN2DA(-opus16)` |
| `LAVLVR` / `LAVNLI` (Latvian) | `…P1DA(-opus16)` | `…N1DA(-opus16)` | (drama variants) | (drama variants) |

### Root cause in code

`src/components/Audio.tsx` uses the stored ID verbatim:

```ts
audioUrl = await getBibleAudioUrl(
  activeBook,
  activeChapter,
  activeAudioFilesetId,
);
```

Verified with a live request:

```
GET /api/v1/bible?passage=Genesis 1&fileset_id=ENGESVN1DA-opus16
→ { "book": "GEN", "chapter": 1, "verses": [], "message": "No verses found for the specified passage" }
```

The same class of failure occurs silently inside `prefetchAudioUrl` /
`prefetchAdjacentChapters` when adjacent chapters cross the Malachi → Matthew
boundary.

### UX foot-gun in the selector

`src/components/TranslationSelector.tsx` exposes OT and NT audio filesets as
separate, equally-valid radio options. Users conceptually pick "ESV opus
narration", not "ESV NT opus narration", so the current UI forces them into a
broken state by design.

## Plan

Core idea: **treat audio selection as a "profile" (version + stream + codec),
then resolve the actual fileset per-chapter at playback/prefetch time based on
the book's testament.**

### 1. New utility: `src/utils/filesetResolver.ts`

Parse + resolve filesets.

```ts
export type Testament = 'OT' | 'NT';
export interface ParsedFileset {
  lang: string;                 // "ENG"
  version: string;              // "ESV"
  testament: 'O' | 'N' | 'P' | null; // null for C (complete) filesets like ENGESH
  stream: string;               // "1DA" | "2DA" | ""
  codec: 'opus16' | 'mp3';
  size: 'OT' | 'NT' | 'C' | 'OTP' | 'NTPOTP';
  type: 'audio' | 'audio_drama' | 'text_plain' | /* … */;
}
```

Key functions:

- `parseFilesetId(id, type, size): ParsedFileset`
- `coversBook(parsed, testament): boolean` — `size === 'C'` covers both;
  `OT` / `OTP` covers OT; `NT` / `NTPOTP` covers NT.
- `resolveAudioFilesetForBook(activeId, translations, testament): { id: string; fallback: boolean } | null`
  1. If the active fileset already covers this testament → return as-is.
  2. Otherwise, within the **same translation** (found by matching
     `activeId`), find an audio/audio_drama fileset that:
     - covers the requested testament, and
     - best matches the user's intent: same `stream` and same codec first,
       then same stream different codec, then same type any codec, then any
       audio.
  3. If nothing found → return `null`.

The resolver replaces raw `activeAudioFilesetId` usage in `Audio.tsx` and in
all prefetch paths.

### 2. Wire the resolver into playback

In `Audio.tsx` (and `prefetchAudioUrl`, `prefetchAdjacentChapters`):

```ts
const testament = getTestament(
  BOOK_NAME_TO_CODE[activeBook.toLowerCase()],
);
const resolved = resolveAudioFilesetForBook(
  activeAudioFilesetId,
  translations,
  testament,
);
```

- If `resolved.id` exists and differs from `activeAudioFilesetId` → silently
  swap at play time; optionally emit a subtle toast once per session:
  *"Using ESV OT narration for Genesis"*.
- If `resolved === null` → show the "audio unavailable" modal (see §4). Do
  **not** attempt to fetch.
- For KJV special-case (`ENGKJV`), keep the existing `getKjvAudioUrl`
  short-circuit (it's complete anyway).

### 3. Smarter default state + migration

In `src/store.tsx`:

- Change the default `activeAudioFilesetId` from `ENGESHN1DA-opus16`
  (NT-only) to either:
  - `ENGKJV` — local, complete, offline; **recommended**, or
  - `null`  — forces the user to pick on first click; safer.
- Add a one-time migration in the Zustand `persist` config: if a persisted
  `activeAudioFilesetId` is testament-specific **and** the same translation
  has the twin, leave it alone (resolver handles it); otherwise nothing to
  do. No destructive migration needed because the resolver tolerates any
  valid past value.

### 4. "Audio unavailable" modal (when no mapping exists)

New component `src/components/AudioUnavailableModal.tsx` shown only when
`resolved === null` **and** the user clicks the play button (not on
auto-prefetch).

- **Title**: "Audio not available for the Old Testament"
- **Body**: "The *{Translation name}* ({stream description}) audio only
  covers the **New Testament**. Choose how to continue:"
- **Actions** (only show what's applicable):
  1. *Listen with KJV instead* — switches `activeAudioFilesetId` to
     `ENGKJV` for this session and immediately plays. Primary /
     recommended.
  2. *Pick another translation* — opens the existing `TranslationSelector`
     modal.
  3. *Cancel* — closes.

Implementation notes:

- Use Mantine `Modal`. Hook into `Audio.tsx` via local state
  (`showUnavailableModal`) triggered inside the play `useEffect` when
  `resolved === null`.
- Suppress the modal during prefetch — prefetch should simply skip
  unresolved chapters silently (log a warning).

### 5. UX polish — preemptive signals

Avoid surprising the user at click time:

- **Play button state**: in `Audio.tsx`, compute `resolved` reactively. If
  `null`, render the `ActionIcon` with `disabled` and a tooltip:
  *"No {translation name} audio available for {book}. Click to pick another
  option."* Clicking while disabled still opens the unavailable modal (so
  it's discoverable).
- **TranslationSelector redesign (small scope)** in
  `src/components/TranslationSelector.tsx`: group audio filesets by
  stream/codec instead of listing each testament separately. Show coverage
  chips next to each option:
  - `Narration (opus)`  `OT ✓`  `NT ✓`
  - `Narration (mp3)`   `OT ✓`  `NT ✓`
  - `Drama (opus)`      `OT —`  `NT ✓`

  Internally store only one of the IDs (NT-preferred, since most
  translations have that); the resolver handles the rest. This removes the
  foot-gun that produced the bug in the first place.

### 6. Cache-key correctness

`cacheAudioUrl` keys on `(book, chapter, filesetId)` — that stays correct
because we cache under the *resolved* fileset, not the user-selected one. No
changes needed to `cacheManager.ts`.

### 7. Tests (Vitest)

- `filesetResolver.test.ts`:
  - Parses `ENGESVN1DA-opus16` / `ENGKJVO2DA` / `ENGESH` correctly.
  - Resolves OT book on `ENGESVN1DA-opus16` → `ENGESVO1DA-opus16`.
  - Resolves OT book on `ENGESHN1DA-opus16` → `null` (no OT exists for
    EN1ESV).
  - Resolves NT book on `ENGCSBO1DA-opus16` → `ENGCSBN1DA-opus16`.
  - Prefers same codec, then same stream, then degrades.
  - `size: 'C'` filesets always cover both testaments.
- `Audio.test.tsx`:
  - With NT-only fileset + OT book, clicking play opens the unavailable
    modal and does **not** hit `getBibleAudioUrl`.
  - With NT-only fileset + OT book **when a twin exists**, plays with the
    resolved OT fileset transparently.

### 8. Rollout order (safe, small PRs)

1. Add `filesetResolver.ts` + unit tests (no behavior change yet).
2. Wire resolver into `Audio.tsx` + prefetch paths; add unavailable modal;
   change default `activeAudioFilesetId`.
3. Refactor `TranslationSelector` to group by stream/codec with coverage
   chips.

Steps 1–2 fix the bug. Step 3 is the polish that prevents users from ever
getting into the broken state in the first place.
