# Video tutorial scripts

Production scripts for the embedded-YouTube tutorial series shown
on the app's `/getting-started` route (`GettingStartedRoute` +
`src/data/gettingStartedVideos.ts`).

## Index

| File | Language | Status | Last verified | YouTube |
| ---- | -------- | ------ | ------------- | ------- |
| `getting-started.en.md` | English | draft | 2026-11-16 | — |
| `getting-started.lv.md` | Latvian | draft | 2026-11-16 | — |

Statuses: `draft` → `recorded` → `published`. When a video goes
live, paste its URL into the YouTube column.

## Conventions

- One file per series per language: `<series>.<lang>.md`. Keep
  section numbering identical across languages so translations
  stay diffable side by side.
- Script sections map 1:1, in order, to `TUTORIAL_VIDEOS` entries
  in `src/data/gettingStartedVideos.ts`. When a video is
  published, set that entry's `youtubeId` — `null` entries are
  filtered out and never render.
- Any PR that changes UI covered by a script updates BOTH
  language files in the same PR (repo rule 10). "Last verified"
  is the date the script was last checked against the live UI.
- Recording logistics (shared account, demo translations,
  per-video pitfalls) live inside each script's "Production
  notes" / "Pitfalls" sections — not in this index.
