/**
 * Static catalogue of "Getting started" tutorial videos shown on
 * the /getting-started route.
 *
 * Entries are the recording checklist from
 * docs/video-scripts/getting-started.<locale>.md, in the
 * order a brand-new user should watch them: anonymous features
 * first, then the account, then everything behind a login.
 * Entries ship with an empty `youtubeIds` map until recorded —
 * GettingStartedRoute only renders a card when the active UI
 * language (falling back to English) has a recorded video, so
 * the page can go live before anything is recorded and grows
 * as real video ids are filled in.
 *
 * Card text lives in the UI catalog under
 * `tutorials.<id>.title` / `tutorials.<id>.description` —
 * English is the source of truth and every shipped locale must
 * carry the same ids.
 */
import type { TutorialYoutubeIds } from '../utils/tutorialVideos';

export interface TutorialVideo {
  /** Stable catalogue id — also the React key and catalog key. */
  id: string;
  /**
   * Per-locale YouTube video ids (`en`/`lv`/`ru`); an absent or
   * null value means "not yet recorded in that language". The
   * route resolves through
   * `resolveTutorialYoutubeId` (active locale → English → hide).
   */
  youtubeIds: TutorialYoutubeIds;
}

export const TUTORIAL_VIDEOS: TutorialVideo[] = [
  { id: 'tour-of-the-app', youtubeIds: {} },
  { id: 'go-to-any-verse', youtubeIds: {} },
  { id: 'book-outline-section-headings', youtubeIds: {} },
  { id: 'select-and-share-verses', youtubeIds: {} },
  { id: 'bible-maps', youtubeIds: { en: 'WPvhvZrexs0' } },
  { id: 'switch-bible-translation', youtubeIds: {} },
  { id: 'listen-to-a-chapter', youtubeIds: {} },
  { id: 'audio-playlists', youtubeIds: {} },
  { id: 'search-the-bible', youtubeIds: {} },
  { id: 'create-an-account', youtubeIds: {} },
  { id: 'take-a-note-on-verses', youtubeIds: {} },
  { id: 'the-note-editor', youtubeIds: {} },
  { id: 'browse-and-organize-notes', youtubeIds: {} },
  { id: 'tags-organize-and-share', youtubeIds: {} },
  { id: 'share-a-note-or-tag', youtubeIds: {} },
  { id: 'comments-on-notes', youtubeIds: {} },
  { id: 'reading-position-follows-you', youtubeIds: {} },
  { id: 'extras', youtubeIds: {} },
];
