# Getting Started — Video Tutorial Scripts (English)

Bible Research is a Bible app you can use to read the Bible, listen
to the Bible, and note down specific Bible passages — to later think
about them, ask questions about them and find explanations for them,
or simply never ever forget the precious, beautiful pearls you find
in the Bible.

Short embedded-YouTube tutorials for the app
(`bibleresearch.vercel.app`). Each video is ~1–3 minutes, ordered so a
brand-new user can watch top to bottom: anonymous features first, then
account creation, then everything that needs a login.

## Production notes

- **Recording account:** the shared UI account `Tester5` /
  `password123`. Before recording the notes videos, pre-seed: one tag
  (e.g. "Sermon prep"), one public note with a comment thread.
- **Demo translations:** ESV (section headings + timestamped audio) and
  KJV (bundled, works offline). Show Latvian GLU8's "Generated voice"
  in the translation video. Some filesets lack audio or headings —
  pick the right translation per script or the demo falls flat.
- **Registration on camera creates a real account** — use a throwaway
  username or stage a delete afterward.
- **Mobile vs desktop:** on screens ≥768px the book picker is a
  permanent sidebar; on phones it opens via the passage title in the
  bottom bar. Record narrow-window when showing the mobile flow.
- Keep each video self-contained: state the goal in one line, demo,
  recap in one line.

---

## 1. Tour of the app (~90 s)

**Goal:** orient a first-time visitor to the screen layout.
**Precondition:** anonymous.

- Open the site → lands on `/bible` (default passage).
- Point out the top bar: magnifier (search), play button (audio),
  "Change Translation" button, burger on the right.
- Point out the bottom bar: ‹ › chapter arrows, centered passage
  title ("John 1").
- Scroll down slowly → header and footer slide away for
  distraction-free reading; scroll up → they return.
- Tap the burger → menu drawer: Account / Sign In, Read Bible,
  Getting started (the very page these tutorials live on),
  Report a problem, Theme switch. Toggle dark → light → dark.
- Close the menu with the ✕ or Esc.

**Pitfalls:** don't scroll too fast or the auto-hide demo looks
jumpy; the theme toggle only lives in the drawer; on Android the
drawer also shows "Download Android App" (§17 covers it).

## 2. Go to any verse (~2 min)

**Goal:** navigate by book/chapter/verse, arrows, and swipe.

- Tap the "John 1" title in the bottom bar → three-column panel:
  Books | Chapters | Verses.
- Tap **Psalms** in Books → chapter list fills; tap **23** → lands
  on `/bible/PSA.23`.
- Reopen the panel → show the verse column; tap **1** → verse 1 is
  selected and the URL becomes `/bible/PSA.23.1`.
- Use the bottom › arrow twice → Psalms 24, 25.
- On phone/trackpad: swipe left → next chapter, right → previous.
- Mention: the URL is shareable — copy `/bible/PSA.23` into a new
  tab.

**Pitfalls:** on desktop the panel is a permanent sidebar — record
narrow so viewers see the toggle-via-title flow. Picking a book may
restore a saved reading position, not chapter 1 — narrate it ("the
app remembers where you left off in each book").

## 3. Book outline via section headings (~60 s)

**Goal:** show the headings-TOC jump.
**Precondition:** ESV (KJV has no headings data).

- Open a heading-rich book, e.g. Psalm 18 or John 3; click the
  inline section heading ("Nicodemus Visits Jesus").
- Screen switches to "John — Section Outline": headings from nearby
  chapters with a loader fetching more.
- Click a heading several chapters away → jumps straight to that
  section in the text.

**Pitfalls:** the outline isn't labelled — explain that clicking a
heading opens it. On KJV nothing happens; record on ESV.

## 4. Select verses, share them, open them elsewhere (~2.5 min)

**Goal:** the verse-tap workflow and the bottom action toolbar.

- On `/bible/JHN.3`: tap verse 16 → highlight, toolbar appears:
  "1 verse selected".
- Tap verses 17–18 → "3 verses selected"; tap 17 again to deselect.
  (Desktop: click 16 then Shift+click 18 for the range.)
- Show the URL now reads `/bible/JHN.3.16-18`.
- Share icon → OS share sheet on phone; on desktop it copies the
  passage text + link — show the toast.
- Hover the external icons: **View on map** → Bible Maps modal with
  embedded BibleMapper; YouVersion, BibleHub, Blue Letter Bible,
  BibleMapper open external tabs. Demo one, not all.
- Clear with the ✕.

**Pitfalls:** the bookmark "Add note" icon only appears when logged
in — stay anonymous and skip it, pointing to the notes video.

## 5. Switch Bible translation (~2 min)

**Goal:** the translation picker; text and audio are independent.

- Header → "Change Translation" → modal opens.
- Tabs: English / Latvian / Russian / Other. On English, open
  Version → badges "Audio", "Text only", "Audio only".
- Pick **KJV** → one-time "Loading KJV Bible…" notification
  (bundled; works offline afterwards).
- Show the Audio radio group: None / Read aloud / Dramatized /
  Generated voice, with coverage labels.
- Switch to the Latvian tab → pick the Latvian version → text
  changes; note the "Generated voice" audio option.
- (Optional 15 s) "Other" tab → type a language name, pick it.
- Save → chapter re-renders in the new translation.

**Pitfalls:** don't click Save while the KJV download is running
(Save is disabled anyway). Some versions cover only one testament —
a coverage hint is expected, not a bug.

## 6. Listen to a chapter (~2 min)

**Goal:** chapter audio and the player bar.
**Precondition:** a translation with audio AND verse timestamps —
ESV or a DBT "Read aloud" option (KJV audio has no verse
highlight).

- On a chapter, tap the header ▶ → player bar appears at the
  bottom: title, ⏮/⏯/⏭, loop, seek slider, time.
- Point out the **blue edge on the currently-read verse**
  auto-scrolling as audio progresses.
- Skip forward 5 s, drag the slider, toggle loop.
- Let the chapter end → auto-advances into the next chapter.
- On Android: show lock-screen/media-notification controls; it
  keeps playing with the screen off.
- Close the player with the ✕.

**Pitfalls:** record on a timestamped fileset or the verse-highlight
segment falls flat. An orange alert icon means no audio for that
translation/book — switch first.

## 7. Audio playlists (~90 s)

**Goal:** continuous listening beyond one chapter.
**Precondition:** logged in for the notes half.

- `/search`: search "faith" → each result verse has a small ▶ →
  tap one → player starts a queue advancing through hits.
- On `/notes/tag/<tag>` tap **Play from here** on a note card →
  plays all notes' linked passages from that note down; the "Go to
  passage" button jumps the Bible view to what's playing.

**Pitfalls:** needs audio on the note's translation; notes without
verses can't be played. Keep it short — a "did you know" video.

## 8. Search the Bible (~90 s)

**Goal:** full-text search and the `/` shortcut.

- Press `/` anywhere (or tap the magnifier) → `/search`.
- Type "light of the world" → Enter → results accordion grouped by
  book ("John (2)", "Matthew (1)"), 3-verse previews.
- "Show N more verses" expands a book; click a verse → opens
  `/bible/JHN.8.12` with the verse selected.
- Note: search runs against the **currently selected text
  translation** — ESV and KJV give different wording hits.

**Pitfalls:** if no text translation is selected the page says
"select a Bible translation first"; it's not a global search.

## 9. Create an account and sign in (~2 min)

**Goal:** registration, login, logout, what unlocks.

- Burger → Account → Sign In → `/login` → "Create one now" →
  `/register`.
- Fill Username, Email (optional, "used for password recovery"),
  Password ≥8, Confirm → Create Account → success toast → lands
  on `/notes`.
- Reopen the menu → account row shows avatar + username; **new
  items appeared**: View Notes, New Note, Tag Management.
- Demo logout: username menu → Logout → toast → `/login`. Sign
  back in as Tester5.
- Say: logged-out users can still read, listen, and search; the
  account stores notes, tags, comments, and syncs reading
  positions.

**Pitfalls:** recording real registration creates a real account —
use a throwaway username or cut before submit. Password rules are
validated client-side.

## 10. Take a note on verses (~2.5 min)

**Goal:** the primary verse→note flow.
**Precondition:** logged in; at least one tag exists.

- On `/bible`, select John 3:16–17 → toolbar → bookmark icon "Add
  note" → modal.
- Modal shows the linked verse texts and "N linked notes" if
  existing notes cover these verses.
- Tag dropdown → pick a tag; type a sentence; check **Auto save** →
  pause → green ✓ flash.
- Toggle **Public note** — explain the tooltip ("anyone with the
  link can view").
- Submit → lands in the tag's note list.

**Pitfalls:** the Add-note button is invisible when logged out —
record authenticated. A note can be saved with no text (verse
bookmark) — worth saying. On mobile the modal is fullscreen by
design.

## 11. The note editor (~2.5 min)

**Goal:** everything inside the TipTap form.

- Apply bold, a list, a blockquote via the toolbar.
- Type `@joh` → passage picker popup → type/click to `@JHN.3.16` →
  becomes a ref token.
- Single-click the token → passage preview popover; double-click →
  picker reopens to edit.
- Images button → attach a photo (thumbnails; max 10).
- Point at "Auto save" (every 5 s) and "Public note" in the bottom
  bar; Submit.

**Pitfalls:** `@` produces *scripture* refs, not user mentions.
Typing `@` without a resolvable book still shows the picker — keep
typing the book name.

## 12. Browse and organize your notes (~2 min)

**Goal:** the `/notes/tag/:tagId` page.

- Menu → View Notes → redirects to your last-used tag.
- Toolbar tour: **Filter by tag** select (incl. "Untagged"),
  **sort** (Custom / Date / Verse), **page size** (5/25/50/100),
  **fold/unfold verses**, refresh, share-tag-link icon.
- Note card tour: verse text is tappable (selects → same toolbar,
  incl. "View in Bible"), "View in Bible" icon jumps to the
  passage, edit pencil, trash.
- Custom sort: drag a note card to reorder; the `#k` order badge.
- "Include sub-tags" switch merges subtree notes grouped per tag
  (only if the tag has children).

**Pitfalls:** `/notes` with zero tags shows "Create your first tag"
— pre-seed tags first. Edit/delete only show on your own tags.

## 13. Tags: organize notes and share them publicly (~2.5 min)

**Goal:** the Tag Management page.

- Menu → Tag Management (`/tags`) → "New Tag" → name + optional
  parent tag.
- Tree tour: folder icons for parents, note-count badges, `+k`
  subtree badges; expand/collapse; click a leaf tag → its notes.
- Drag a tag's grip onto another → reparents; sticky "Move to top
  level" bar appears while dragging.
- Row actions: **world icon** → "Make tag public" → confirm
  explains all notes under it become link-viewable; teal badge.
  Edit (rename/reparent), Delete (confirm warns notes lose the
  tag).
- Search box filters the tree.

**Pitfalls:** deleting a tag doesn't delete notes (they go to
Untagged) — say it explicitly. Public is a cascade — the confirm
modal warns.

## 14. Share a note or a tag (~90 s)

**Goal:** the public sharing model.

- On a public note card → share icon → copies `/notes/<id>` (or OS
  share sheet) → open it incognito: the note + comments are
  visible **without login**.
- Same for a public tag: share-tag-link icon → anonymous viewer
  sees the tag's public notes.
- Flip back to private → link stops working ("Note not found or is
  not public").

**Pitfalls:** only **public** notes have the share icon. Anonymous
viewers see notes but can't comment ("Log in to comment").

## 15. Comments on notes (~2 min)

**Goal:** comment threads.
**Precondition:** logged in; a note with a thread (pre-seeded).

- On a note card, tap the 💬 count button → thread expands inline.
- Post a comment: rich text (bold, lists, `@` scripture refs),
  **Images** (max 5) → attach, Post.
- Reply to a comment → nested indent; edit own comment; delete own
  → "[deleted]" placeholder.
- Mention: threads refresh about every 30 s.

**Pitfalls:** the comment button only shows when logged in OR
comments already exist. Image cap is 5 (notes allow 10).

## 16. Your reading position follows you (~60 s)

**Goal:** per-book resume.

- Read partway down John 3; jump to Romans 5; reopen the book
  panel and tap **John** → returns to John 3 where you left off.
- Reload the page → restores the saved verse.
- Logged in: position syncs to the account → sign in on a second
  device/browser and the same position is restored.

**Pitfalls:** server sync is login-only — anonymous gets local-only
restore in the same browser. Keep the claim honest.

## 17. Extras: dark mode, problem reports, Android app (~90 s)

**Goal:** remaining menu items.

- Theme switch (sun/moon) in the menu — default is dark.
- "Report a problem" → describe an issue → "Send report" → toast;
  it attaches the current passage automatically.
- On an Android phone browser: menu shows **"Download Android
  App"** → APK → "install unknown apps" prompt; inside the app the
  menu instead shows **"Check for updates"**.
- Recap: `/` search shortcut, `Esc` closes modals.

**Pitfalls:** the APK is sideloaded (no Play Store listing) — Play
Protect may warn. The download item only exists on Android user
agents; "Check for updates" only inside the native shell.

---

## Deliberately not covered

- "Advanced — raw filesets" accordion in the translation modal.
- Media-session seek semantics (verse-jump via headphones).
- The 500-verse copyright cap notice, rate-limit/provider-error
  states.
