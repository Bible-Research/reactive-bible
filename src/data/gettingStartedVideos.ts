/**
 * Static catalogue of "Getting started" tutorial videos shown on
 * the /getting-started route.
 *
 * Entries are the recording checklist from
 * video-scripts/getting-started.en.md (workspace root), in the
 * order a brand-new user should watch them: anonymous features
 * first, then the account, then everything behind a login. They
 * ship as `youtubeId: null` until recorded — GettingStartedRoute
 * filters those out, so the page can go live before anything is
 * recorded and grows as real video ids are filled in.
 */
export interface TutorialVideo {
  /** Stable catalogue id — also the React key. */
  id: string;
  /** Card heading; keep it the video's YouTube title. */
  title: string;
  /** One-line summary shown under the title. */
  description: string;
  /** YouTube video id; null = scripted but not yet recorded. */
  youtubeId: string | null;
}

export const TUTORIAL_VIDEOS: TutorialVideo[] = [
  {
    id: 'tour-of-the-app',
    title: 'Tour of the app',
    description:
      'Get oriented: the top bar, the bottom bar, auto-hiding ' +
      'chrome, and the main menu.',
    // Placeholder until the real tutorial is recorded —
    // "Moses Got That Aura" (The Promised Land, ~22 s).
    youtubeId: 'sUbMYzgIfRM',
  },
  {
    id: 'go-to-any-verse',
    title: 'Go to any verse',
    description:
      'Navigate by book, chapter, and verse using the passage ' +
      'picker, the arrow buttons, and swipe.',
    youtubeId: null,
  },
  {
    id: 'book-outline-section-headings',
    title: 'Book outline via section headings',
    description:
      'Jump around a book by tapping a section heading to open ' +
      'the chapter outline.',
    youtubeId: null,
  },
  {
    id: 'select-and-share-verses',
    title: 'Select verses and share them',
    description:
      'Tap verses to select them, then share the passage or ' +
      'open it on external study sites from the action toolbar.',
    youtubeId: null,
  },
  {
    id: 'switch-bible-translation',
    title: 'Switch Bible translation',
    description:
      'Pick a translation and see how text and audio options ' +
      'are chosen independently.',
    youtubeId: null,
  },
  {
    id: 'listen-to-a-chapter',
    title: 'Listen to a chapter',
    description:
      'Play chapter audio and use the player bar to pause, ' +
      'seek, and follow along.',
    youtubeId: null,
  },
  {
    id: 'audio-playlists',
    title: 'Audio playlists',
    description:
      'Keep listening beyond one chapter with continuous ' +
      'playlist playback.',
    youtubeId: null,
  },
  {
    id: 'search-the-bible',
    title: 'Search the Bible',
    description:
      'Full-text search across the active translation, plus ' +
      'the / keyboard shortcut.',
    youtubeId: null,
  },
  {
    id: 'create-an-account',
    title: 'Create an account and sign in',
    description:
      'Register, log in and out, and see which features an ' +
      'account unlocks.',
    youtubeId: null,
  },
  {
    id: 'take-a-note-on-verses',
    title: 'Take a note on verses',
    description:
      'Attach a note to selected verses straight from the ' +
      'action toolbar.',
    youtubeId: null,
  },
  {
    id: 'the-note-editor',
    title: 'The note editor',
    description:
      'Everything inside the rich-text note form: formatting, ' +
      'images, and saving.',
    youtubeId: null,
  },
  {
    id: 'browse-and-organize-notes',
    title: 'Browse and organize your notes',
    description:
      'Find, reorder, and arrange notes on the notes page.',
    youtubeId: null,
  },
  {
    id: 'tags-organize-and-share',
    title: 'Tags: organize notes and share them',
    description:
      'Use Tag Management to group notes and make a tag ' +
      'publicly shareable.',
    youtubeId: null,
  },
  {
    id: 'share-a-note-or-tag',
    title: 'Share a note or a tag',
    description:
      'Send a public link to a single note or a whole tag.',
    youtubeId: null,
  },
  {
    id: 'comments-on-notes',
    title: 'Comments on notes',
    description:
      'Discuss public notes in comment threads.',
    youtubeId: null,
  },
  {
    id: 'reading-position-follows-you',
    title: 'Your reading position follows you',
    description:
      'Each book remembers where you left off and resumes ' +
      'there.',
    youtubeId: null,
  },
  {
    id: 'extras',
    title: 'Extras: dark mode, problem reports, Android app',
    description:
      'The remaining menu items: the theme switch, reporting ' +
      'a problem, and the Android app.',
    youtubeId: null,
  },
];
