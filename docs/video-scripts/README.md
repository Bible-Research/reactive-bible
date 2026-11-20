# Video tutorial scripts

Production scripts for the embedded-YouTube tutorial series shown
on the app's `/getting-started` route (`GettingStartedRoute` +
`src/data/gettingStartedVideos.ts`).

## Index

| File | Language | Status | Last verified | YouTube |
| ---- | -------- | ------ | ------------- | ------- |
| `getting-started.en.md` | English | draft | 2026-11-16 | [bible-maps][yt] |
| `getting-started.lv.md` | Latvian | draft | 2026-11-16 | — |
| `getting-started.ru.md` | Russian | draft | 2026-11-16 | — |

[yt]: https://www.youtube.com/shorts/WPvhvZrexs0

Statuses: `draft` → `recorded` → `published` (per file — a
partly-recorded series stays `draft`). When a video goes
live, paste its URL into the YouTube column.

## Conventions

- One file per series per language: `<series>.<lang>.md`. Keep
  section numbering identical across languages so translations
  stay diffable side by side.
- Each video section has three blocks: `**Teaches:**` (one-line
  learning outcome), `### Steps` (numbered, imperative —
  doubles as the written user guide and the narration spine),
  and `### Recording` (session state, pacing, what to show or
  hide). In Latvian: `**Māca:**` / `### Soļi` /
  `### Ieraksts`. In Russian: `**Учит:**` / `### Шаги` /
  `### Запись`.
- Script sections map 1:1, in order, to `TUTORIAL_VIDEOS` entries
  in `src/data/gettingStartedVideos.ts`. When a video is
  published in a language, set that locale's id in the entry's
  `youtubeIds` map — a card renders only when an id resolves
  for the active UI language (English is the fallback), so an
  empty map hides the card everywhere.
- Any PR that changes UI covered by a script updates ALL
  locale files (en + lv + ru) in the same PR (repo rule 10).
  "Last verified" is the date the script was last checked
  against the live UI.
- Recording logistics (shared account, demo translations,
  per-video pitfalls) live inside each script — the
  "Production notes" header and per-section "Recording" block
  in English, "Ierakstīšanas piezīmes" and "Ieraksts" in
  Latvian — not in this index.
