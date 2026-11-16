import { describe, it, expect } from 'vitest';
import { TUTORIAL_VIDEOS } from './gettingStartedVideos';

describe('TUTORIAL_VIDEOS catalogue', () => {
  it('has unique ids', () => {
    const ids = TUTORIAL_VIDEOS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry a non-empty id, title and description', () => {
    for (const video of TUTORIAL_VIDEOS) {
      expect(video.id.trim()).not.toBe('');
      expect(video.title.trim()).not.toBe('');
      expect(video.description.trim()).not.toBe('');
    }
  });

  // A malformed id only surfaces as a broken embed/thumbnail on
  // the page — YouTube ids are 11-char [A-Za-z0-9_-] strings, so
  // catch typos here instead of in the UI.
  it('uses null or an 11-char YouTube id shape', () => {
    const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
    for (const video of TUTORIAL_VIDEOS) {
      if (video.youtubeId === null) continue;
      expect(video.youtubeId).toMatch(YOUTUBE_ID);
    }
  });
});
