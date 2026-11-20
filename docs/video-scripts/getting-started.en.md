# Getting Started — Video Tutorial Scripts (English)

Bible Research is a Bible app you can use to read the Bible,
listen to the Bible, and note down specific Bible passages — to
later think about them, ask questions about them and find
explanations for them, or simply never ever forget the precious,
beautiful pearls you find in the Bible.

Short embedded-YouTube tutorials for the app
(`bibleresearch.vercel.app`). Each video is ~1–3 minutes, ordered
so a brand-new user can watch top to bottom: anonymous features
first, then account creation, then everything that needs a login.
Each section doubles as a written guide — **Steps** is followable
without the video; **Recording** is the shot list.

## Production notes

- **Recording account:** the shared UI account `Tester5` /
  `password123`. Before recording the notes videos, pre-seed: one
  tag (e.g. "Sermon prep"), one public note with a comment thread.
- **Demo translations:** ESV (section headings + timestamped
  audio) and KJV (bundled, works offline). Show Latvian GLU8's
  "Generated voice" in the translation video. Some filesets lack
  audio or headings — pick the right translation per script or
  the demo falls flat.
- **Registration on camera creates a real account** — use a
  throwaway username or stage a delete afterward.
- **Mobile vs desktop:** on screens ≥768px the book picker is a
  permanent sidebar; on phones it opens via the passage title in
  the bottom bar. Record narrow-window when showing the mobile
  flow.
- Keep each video self-contained: state the goal in one line,
  demo, recap in one line.

---

## 1. Tour of the app (~90 s)

**Teaches:** what the main screen areas are for and how to open
the menu.

### Steps

1. Open the site — you land on `/bible` at the default passage.
2. The top bar holds: magnifier (search), play button (audio),
   "Change Translation", and the burger menu on the right.
3. The bottom bar has ‹ › chapter arrows around the centered
   passage title ("John 1").
4. Scroll down — the header and footer slide away for
   distraction-free reading; scroll up to bring them back.
5. Tap the burger — the menu drawer lists: Account / Sign In,
   Read Bible, Getting started (the very page these tutorials
   live on), Report a problem, Theme switch. Use the toggle:
   dark → light → dark.
6. Close the menu with ✕ or Esc.

### Recording

- Anonymous session.
- Scroll slowly — a fast scroll makes the auto-hide demo look
  jumpy.
- The theme toggle only lives in the drawer — don't hunt for
  it in the top bar.
- On Android the drawer also shows "Download Android App"
  (§17 covers it).
- Point at each element as you name it so viewers map names to
  pixels.

## 2. Go to any verse (~2 min)

**Teaches:** navigate to any passage by book, chapter, and
verse.

### Steps

1. Tap the passage title ("John 1") in the bottom bar — a panel
   opens with three columns: Books | Chapters | Verses.
2. Tap **Psalms** in Books — the chapter list fills.
3. Tap **23** — you land on Psalm 23 (`/bible/PSA.23`).
4. Reopen the panel and tap **1** in Verses — verse 1 is
   selected and the URL becomes `/bible/PSA.23.1`.
5. Use the bottom › arrow to move to the next chapter (Psalms
   24, 25).
6. On a phone or trackpad, swipe left for the next chapter,
   right for the previous.
7. The URL is shareable — paste `/bible/PSA.23` into a new tab
   and it opens the same passage.

### Recording

- Record in a narrow window — on desktop the panel is a
  permanent sidebar, so the tap-the-title flow is invisible on
  wide screens.
- Picking a book may restore a saved reading position instead
  of chapter 1 — narrate it ("the app remembers where you left
  off in each book").

## 3. Book outline via section headings (~60 s)

**Teaches:** jump anywhere in a book via its section-heading
outline.

### Steps

1. Open a heading-rich book, e.g. Psalm 18 or John 3.
2. Click an inline section heading ("Nicodemus Visits Jesus")
   — the screen switches to "John — Section Outline".
3. The outline lists headings from nearby chapters and loads
   more as it goes.
4. Click a heading several chapters away — you jump straight
   to that section in the text.

### Recording

- ESV only — KJV has no headings data and nothing happens.
- The outline isn't labelled — say "clicking a heading opens
  the outline" so viewers can reproduce it.

## 4. Select verses, share them, open them elsewhere (~2.5 min)

**Teaches:** verse selection, sharing a passage, opening it on
external study sites.

### Steps

1. On `/bible/JHN.3`, tap verse 16 — it highlights and the
   action toolbar appears ("1 verse selected").
2. Tap verses 17–18 to extend the selection ("3 verses
   selected"); tap a selected verse again to deselect it.
   (Desktop: click 16, then Shift+click 18 for the range.)
3. The URL now reads `/bible/JHN.3.16-18` — shareable.
4. Tap the share icon — on a phone it opens the OS share
   sheet; on desktop it copies the passage text + link and a
   toast confirms.
5. The external icons open the passage elsewhere: "View on
   map" opens the in-app Bible Maps modal; YouVersion,
   BibleHub, Blue Letter Bible, and BibleMapper open external
   tabs.
6. Clear the selection with ✕.

### Recording

- Stay anonymous — the "Add note" bookmark icon only appears
  when logged in; skip it and point to the notes video.
- Tap slowly enough for each highlight to register; pause on
  the copy toast.
- Hover each external icon a beat; demo one (Bible Maps is the
  most visual), don't open all of them.

## 5. See the passage on a map (~60 s)

**Teaches:** the verse toolbar's two map buttons — the in-app
Bible Maps modal and BibleMapper's WebViewer.

### Steps

1. On `/bible/JHN.3`, tap verse 16 — the action toolbar
   appears.
2. Tap the teal map icon ("View on map") — a "Bible Maps"
   modal opens inside the app with the chapter already loaded
   in BibleMapper MapFinder.
3. Pan and zoom the map, then close the modal with ✕.
4. Tap the BibleMapper icon (the biblemapper.com logo) — the
   English reference copies to the clipboard (a toast
   confirms) and biblemapper.com's WebViewer opens in a new
   tab.
5. Paste the reference into the WebViewer to load the passage
   there.

### Recording

- Anonymous session — both map buttons work logged out.
- Give the modal iframe a beat to load before pointing out
  the passage marker.
- The clipboard copy is the English reference even under an
  lv/ru UI — say it out loud so nobody pastes a localized
  book name the tool can't parse.

## 6. Switch Bible translation (~2 min)

**Teaches:** the translation picker; text and audio are chosen
independently.

### Steps

1. Header → "Change Translation" — the picker modal opens.
2. Tabs: English / Latvian / Russian / Other.
3. On the English tab open Version — badges mark versions
   "Audio", "Text only", "Audio only".
4. Pick **KJV** — a one-time "Loading KJV Bible…" notification
   appears (it's bundled and works offline afterwards).
5. In the Audio group pick: None / Read aloud / Dramatized /
   Generated voice, each with a coverage label.
6. Switch to the Latvian tab and pick the Latvian version —
   it offers "Generated voice" audio (applied on Save).
7. (Optional) On the "Other" tab, type a language name and
   pick it.
8. Save — the chapter re-renders in the new translation.

### Recording

- Don't click Save while the KJV download is running (Save is
  disabled anyway).
- Some versions cover only one testament — a coverage hint is
  expected, not a bug.

## 7. Listen to a chapter (~2 min)

**Teaches:** play chapter audio and use the player bar.

### Steps

1. On a chapter, tap the ▶ button in the header — the player
   bar appears at the bottom.
2. The bar shows: title, ⏮/⏯/⏭, loop toggle, seek slider,
   time.
3. The currently-read verse gets a blue edge and auto-scrolls
   as the audio progresses.
4. Skip forward 5 s or drag the slider to seek; toggle loop to
   repeat.
5. Let the chapter end — playback auto-advances into the next
   chapter.
6. On Android, playback keeps going with the screen off, with
   lock-screen/media-notification controls.
7. Close the player with ✕.

### Recording

- Needs a timestamped fileset — ESV or a DBT "Read aloud"
  option. KJV audio has no verse highlight, so the blue-edge
  demo falls flat there.
- An orange alert icon means no audio for that
  translation/book — switch first.

## 8. Audio playlists (~90 s)

**Teaches:** continuous listening beyond one chapter — from
search hits or note passages.

### Steps

1. On `/search`, search "faith" — each result verse has a
   small ▶.
2. Tap one — the player starts a queue advancing through the
   hits.
3. On `/notes/tag/<tag>`, tap **Play from here** on a note
   card — it plays all notes' linked passages from that note
   down.
4. "Go to passage" jumps the Bible view to whatever is
   playing.

### Recording

- Log in first — the notes half needs it.
- Needs audio on the note's translation; notes without verses
  can't be played.
- Keep it short — a "did you know" video.

## 9. Search the Bible (~90 s)

**Teaches:** full-text search and the `/` shortcut.

### Steps

1. Press `/` anywhere (or tap the magnifier) — `/search`
   opens.
2. Type "light of the world" → Enter — results appear in an
   accordion grouped by book ("John (2)", "Matthew (1)") with
   3-verse previews.
3. "Show N more verses" expands a book's hits.
4. Click a verse — it opens `/bible/JHN.8.12` with the verse
   selected.

### Recording

- Say it: search runs against the **currently selected text
  translation** — ESV and KJV give different wording hits.
- If no text translation is selected the page says "select a
  Bible translation first" — it's not a global search.

## 10. Create an account and sign in (~2 min)

**Teaches:** registration, login, logout — and what an account
unlocks.

### Steps

1. Burger → Account → Sign In → `/login` → "Create one now" →
   `/register`.
2. Fill Username, Email (optional — "used for password
   recovery"), Password (≥8 characters), Confirm → Create
   Account.
3. A success toast appears and you land on `/notes`.
4. Reopen the menu — the account row shows your avatar +
   username, and new items appeared: View Notes, New Note,
   Tag Management.
5. Log out: username menu → Logout → toast → `/login`. Sign
   back in.

### Recording

- Real registration creates a real account — use a throwaway
  username or cut before submit.
- Password rules are validated client-side.
- Say it: logged-out users can still read, listen, and search;
  the account stores notes, tags, comments, and syncs reading
  positions.

## 11. Take a note on verses (~2.5 min)

**Teaches:** attach a note to selected verses.

### Steps

1. On `/bible`, select John 3:16–17 — the action toolbar
   appears.
2. Tap the bookmark icon ("Add note") — the note modal opens.
3. The modal shows the linked verse texts, plus "N linked
   notes" if existing notes already cover these verses.
4. Pick a tag from the dropdown.
5. Type a sentence — or leave it empty to save a pure verse
   bookmark.
6. Enable **Auto save** — pause and a green ✓ flashes.
7. Toggle **Public note** if anyone with the link should be
   able to view it.
8. Submit — the note lands in the tag's note list.

### Recording

- Record authenticated — the Add-note button is invisible when
  logged out — with at least one tag pre-seeded.
- Mention the empty-note bookmark case explicitly.
- The Add-note modal is fullscreen by design, desktop
  included.

## 12. The note editor (~2.5 min)

**Teaches:** the rich-text note editor — formatting, scripture
refs, images, autosave.

### Steps

1. Apply bold, a list, a blockquote via the toolbar.
2. Type `@` plus a book name (e.g. `@joh`) — a passage picker
   pops up; keep typing or click to insert `@JHN.3.16` as a
   ref token.
3. Single-click the token for a passage preview popover;
   double-click to reopen the picker and edit it.
4. The Images button attaches photos (thumbnails; max 10).
5. "Auto save" saves every 5 s; the "Public note" toggle lives
   in the bottom bar.
6. Submit.

### Recording

- `@` produces *scripture* refs, not user mentions — say it.
- Typing `@` without a resolvable book still shows the picker
  — keep typing the book name.

## 13. Browse and organize your notes (~2 min)

**Teaches:** the notes page — filtering, sorting, reordering,
folding verses.

### Steps

1. Menu → View Notes — redirects to your last-used tag
   (`/notes/tag/:tagId`).
2. Toolbar: **Filter by tag** (incl. "Untagged"), **sort**
   (Custom / Date / Verse), **page size** (5/25/50/100),
   **fold/unfold verses**, refresh, share-tag-link icon.
3. On a note card, tap the verse text to select it — the same
   action toolbar appears (incl. "View in Bible"). The card
   also has a "View in Bible" jump icon, edit pencil, trash.
4. With Custom sort, drag a note card to reorder — the `#k`
   badge shows its position.
5. "Include sub-tags" merges subtree notes grouped per tag
   (only if the tag has children).

### Recording

- Pre-seed tags — `/notes` with zero tags shows "Create your
  first tag" and the demo dies.
- Edit/delete only show on your own tags.

## 14. Tags: organize notes and share them publicly (~2.5 min)

**Teaches:** the tag tree — create, reparent, publish tags.

### Steps

1. Menu → Tag Management (`/tags`) → "New Tag" → name +
   optional parent tag.
2. The tree shows folder icons for parents, note-count
   badges, `+k` subtree badges; expand/collapse; click a leaf
   tag to open its notes.
3. Drag a tag's grip onto another tag to reparent it — a
   sticky "Move to top level" bar appears while dragging.
4. Row actions: the **world icon** → "Make tag public" (the
   confirm explains all notes under it become link-viewable;
   a teal badge appears); Edit to rename/reparent; Delete
   (warns that notes lose the tag).
5. The search box filters the tree.

### Recording

- Say it explicitly: deleting a tag doesn't delete notes —
  they go to Untagged.
- Public is a cascade — read the confirm-modal warning aloud.

## 15. Share a note or a tag (~90 s)

**Teaches:** the public sharing model — links that work
without login.

### Steps

1. On a public note card, tap the share icon — it copies
   `/notes/<id>` (or opens the OS share sheet on a phone).
2. Open the link incognito — the note + comments are visible
   **without login**.
3. A public tag works the same — its share-tag-link gives
   anonymous viewers the tag's public notes.
4. Flip the note back to private — the link stops working
   ("Note not found or is not public").

### Recording

- Only **public** notes have the share icon.
- Anonymous viewers can read but can't comment ("Log in to
  comment") — show that line.

## 16. Comments on notes (~2 min)

**Teaches:** comment threads on notes.

### Steps

1. On a note card, tap the 💬 count button — the thread
   expands inline.
2. Write a comment — rich text (bold, lists, `@` scripture
   refs) — attach images with **Images** (max 5) → Post.
3. Reply to a comment — it nests; you can edit your own
   comments.
4. Deleting your own comment leaves a "[deleted]" placeholder.
5. Threads refresh about every 30 s.

### Recording

- Logged in; a note with a pre-seeded thread.
- The comment button only shows when logged in OR comments
  already exist.
- Image cap is 5 (notes allow 10).

## 17. Your reading position follows you (~60 s)

**Teaches:** per-book resume; position syncs across devices
when logged in.

### Steps

1. Read partway down John 3; jump to Romans 5.
2. Reopen the book panel and tap **John** — you return to
   John 3 where you left off.
3. Reload the page — the saved verse is restored.
4. Logged in, the position syncs to your account — sign in on
   a second device or browser and the same position is
   restored.

### Recording

- Keep the claim honest: server sync is login-only — anonymous
  gets local-only restore in the same browser.

## 18. Extras: dark mode, problem reports, Android app (~90 s)

**Teaches:** the theme switch, problem reports, and the
Android app.

### Steps

1. The theme switch (sun/moon) is in the menu — dark is the
   default.
2. "Report a problem" → describe the issue → "Send report" →
   toast; it attaches the current passage automatically.
3. On an Android phone browser, the menu shows "Download
   Android App" → APK → allow "install unknown apps" when
   prompted.
4. Inside the installed app, the menu instead shows "Check
   for updates".
5. Recap shortcuts: `/` opens search, `Esc` closes modals.

### Recording

- The APK is sideloaded (no Play Store listing) — Play Protect
  may warn; say so.
- The download item only exists on Android user agents;
  "Check for updates" only inside the native shell.

---

## Deliberately not covered

- "Advanced — raw filesets" accordion in the translation modal.
- Media-session seek semantics (verse-jump via headphones).
- The 500-verse copyright cap notice, rate-limit/provider-error
  states.
