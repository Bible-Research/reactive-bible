import { describe, it, expect } from 'vitest';
import { TUTORIAL_VIDEOS } from './gettingStartedVideos';
import enCommon from '../i18n/locales/en/common.json';

describe('TUTORIAL_VIDEOS catalogue', () => {
  it('has unique ids', () => {
    const ids = TUTORIAL_VIDEOS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry a non-empty id and youtubeIds map', () => {
    for (const video of TUTORIAL_VIDEOS) {
      expect(video.id.trim()).not.toBe('');
      expect(video.youtubeIds).toBeTypeOf('object');
      expect(video.youtubeIds).not.toBeNull();
    }
  });

  it('has title/description catalog keys for every entry', () => {
    const tutorials = enCommon.tutorials as Record<
      string,
      { title?: string; description?: string }
    >;
    for (const video of TUTORIAL_VIDEOS) {
      const entry = tutorials[video.id];
      expect(entry, `catalog entry for ${video.id}`).toBeDefined();
      expect(entry.title?.trim()).not.toBe('');
      expect(entry.description?.trim()).not.toBe('');
    }
  });

  // A malformed id only surfaces as a broken embed/thumbnail on
  // the page — YouTube ids are 11-char [A-Za-z0-9_-] strings, so
  // catch typos here instead of in the UI.
  it('uses null or an 11-char YouTube id shape per locale', () => {
    const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
    for (const video of TUTORIAL_VIDEOS) {
      for (const [locale, id] of Object.entries(
        video.youtubeIds,
      )) {
        if (id === null || id === undefined) continue;
        expect(
          id,
          `${video.id} (${locale})`,
        ).toMatch(YOUTUBE_ID);
      }
    }
  });
});
