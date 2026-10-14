import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import {
  cacheVerses,
  getCachedVerses,
  clearVerseCache,
  getVerseCacheMetadata,
  cacheTranslations,
  getCachedTranslations,
  cacheAudioUrl,
  getCachedAudioUrl,
  clearExpiredAudioUrls,
  cacheNotes,
  getCachedNotes,
  clearNotesCache,
  cacheTimestamps,
  getCachedTimestamps,
  clearTimestampCache,
  cacheHeadings,
  getCachedHeadings,
  clearHeadingsCache,
} from './cacheManager';
import { Translation } from '../store';
import {
  Note,
  Tag,
  VerseTimestamp,
  SectionHeading,
} from '../types';

// Mock localStorage
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('Verse Cache Manager', () => {
  // localStorage and cacheManager's storageCache are reset by the
  // global setupTests beforeEach — no hand-rolled flush needed.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should cache and retrieve verses', () => {
    const verses = [{ verse: 1, text: 'Test verse' }];
    cacheVerses('GEN', 1, 'KJV', verses);

    const cached = getCachedVerses('GEN', 1, 'KJV');
    expect(cached).toEqual(verses);
  });

  it('should return null for non-cached verses', () => {
    const cached = getCachedVerses('EXO', 2, 'ESV');
    expect(cached).toBeNull();
  });

  it('should enforce LRU eviction policy', () => {
    // Cache 501 verses to trigger eviction
    for (let i = 1; i <= 501; i++) {
      cacheVerses('BOOK', i, 'KJV', [{ verse: 1, text: `Verse ${i}` }]);
    }

    const metadata = getVerseCacheMetadata();
    expect(metadata.totalVerses).toBe(500);

    // The first verse should be evicted
    const oldestCached = getCachedVerses('BOOK', 1, 'KJV');
    expect(oldestCached).toBeNull();

    // The newest verse should still be in the cache
    const newestCached = getCachedVerses('BOOK', 501, 'KJV');
    expect(newestCached).toEqual([{ verse: 1, text: 'Verse 501' }]);
  });

  it('should update access count and timestamp on cache hit', () => {
    const verses = [{ verse: 1, text: 'Test verse' }];
    cacheVerses('GEN', 1, 'KJV', verses);

    const storedVerse = () =>
      JSON.parse(
        localStorageMock.getItem('bible_verse_cache') ?? '{}'
      )['KJV:GEN:1:1'];

    expect(storedVerse().accessCount).toBe(1);
    const firstTimestamp = storedVerse().timestamp;

    // Initial access bumps accessCount
    getCachedVerses('GEN', 1, 'KJV');
    expect(storedVerse().accessCount).toBe(2);
    expect(storedVerse().timestamp).toBe(firstTimestamp);

    // Second access records a fresh timestamp too
    vi.advanceTimersByTime(1000);
    getCachedVerses('GEN', 1, 'KJV');
    const metadata = getVerseCacheMetadata();
    expect(
      metadata.lruQueue[metadata.lruQueue.length - 1]
    ).toBe('KJV:GEN:1');
    expect(storedVerse().accessCount).toBe(3);
    expect(storedVerse().timestamp).toBe(firstTimestamp + 1000);
  });

  it('should clear the verse cache', () => {
    const verses = [{ verse: 1, text: 'Test verse' }];
    cacheVerses('GEN', 1, 'KJV', verses);
    clearVerseCache();
    const cached = getCachedVerses('GEN', 1, 'KJV');
    expect(cached).toBeNull();
  });

  it('counts duplicate verse inputs toward totalVerses', () => {
    // FIXME: `cache[verseKey]` dedupes the stored verse but
    // `metadata.totalVerses += verses.length` counts both
    // inputs — a duplicate-inflated count erodes the 500 cap.
    cacheVerses('GEN', 1, 'KJV', [
      { verse: 1, text: 'a' },
      { verse: 1, text: 'b' },
    ]);
    expect(getVerseCacheMetadata().totalVerses).toBe(2);
    expect(getCachedVerses('GEN', 1, 'KJV')).toEqual([
      { verse: 1, text: 'b' },
    ]);
  });
});

describe('Translation Cache Manager', () => {
  it('should cache and retrieve translations', () => {
    const translations: Translation[] = [
      {
        abbr: 'KJV',
        name: 'King James Version',
        language: 'English',
        language_iso: 'eng',
        filesets: [],
      },
    ];
    cacheTranslations('eng', translations);

    const cached = getCachedTranslations('eng');
    expect(cached).toEqual(translations);
  });

  it('should return null for non-cached translations', () => {
    const cached = getCachedTranslations('spa');
    expect(cached).toBeNull();
  });
});

const makeTag = (id: string, name = `Tag ${id}`): Tag => ({
  id,
  name,
  parent_tag: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
});

const makeNote = (
  id: string,
  tag: Tag,
  text: string,
  opts: Partial<Note> = {}
): Note => ({
  id,
  note_text: text,
  public: false,
  is_owner: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  tag,
  verses: [],
  tag_position: null,
  ...opts,
});

describe('Notes Cache Manager', () => {
  it('should cache and retrieve notes for a tag', () => {
    const tag = makeTag('TAG123', 'Test Tag');
    const notes: Note[] = [
      makeNote('note1', tag, 'Test note 1'),
      makeNote('note2', tag, 'Test note 2', { public: true }),
    ];

    cacheNotes('TAG123', notes);
    const cached = getCachedNotes('TAG123');

    expect(cached?.notes).toEqual(notes);
  });

  it('should return null for non-cached notes', () => {
    const cached = getCachedNotes('TAG456');
    expect(cached).toBeNull();
  });

  it('should cache notes for multiple tags independently', () => {
    const tag1 = makeTag('TAG1');
    const tag2 = makeTag('TAG2');
    const notes1 = [makeNote('note1', tag1, 'Tag 1 note')];
    const notes2 = [makeNote('note2', tag2, 'Tag 2 note')];

    cacheNotes('TAG1', notes1);
    cacheNotes('TAG2', notes2);

    expect(getCachedNotes('TAG1')?.notes).toEqual(notes1);
    expect(getCachedNotes('TAG2')?.notes).toEqual(notes2);
  });

  it('should clear notes cache for a specific tag', () => {
    const tag1 = makeTag('TAG1');
    const tag2 = makeTag('TAG2');
    const notes1 = [makeNote('note1', tag1, 'Note 1')];
    const notes2 = [makeNote('note2', tag2, 'Note 2')];

    cacheNotes('TAG1', notes1);
    cacheNotes('TAG2', notes2);

    clearNotesCache('TAG1');

    expect(getCachedNotes('TAG1')).toBeNull();
    expect(getCachedNotes('TAG2')?.notes).toEqual(notes2);
  });

  it('should clear all notes cache', () => {
    const tag1 = makeTag('TAG1');
    const tag2 = makeTag('TAG2');
    const notes1 = [makeNote('note1', tag1, 'Note 1')];
    const notes2 = [makeNote('note2', tag2, 'Note 2')];

    cacheNotes('TAG1', notes1);
    cacheNotes('TAG2', notes2);

    clearNotesCache();

    expect(getCachedNotes('TAG1')).toBeNull();
    expect(getCachedNotes('TAG2')).toBeNull();
  });

  it('should update cached notes when caching again for same tag', () => {
    const tag = makeTag('TAG1');
    const initialNotes = [makeNote('note1', tag, 'Initial note')];
    const updatedNotes = [
      makeNote('note1', tag, 'Updated note'),
      makeNote('note2', tag, 'New note'),
    ];

    cacheNotes('TAG1', initialNotes);
    cacheNotes('TAG1', updatedNotes);

    const cached = getCachedNotes('TAG1');
    expect(cached?.notes).toEqual(updatedNotes);
    expect(cached?.notes.length).toBe(2);
  });

  it('should store timestamp with cached notes', () => {
    const tag = makeTag('TAG1');
    const notes = [
      makeNote('note1', tag, 'Test note', { is_owner: false }),
    ];

    const beforeCache = Date.now();
    cacheNotes('TAG1', notes);
    const afterCache = Date.now();

    // Verify timestamp is stored (check localStorage directly).
    // Keys carry the request scope: auth discriminator, fileset,
    // and page size.
    const cacheStr =
      localStorageMock.getItem('bible_notes_cache_v2');
    expect(cacheStr).toBeTruthy();

    const cache = JSON.parse(cacheStr!);
    const key =
      'TAG1:anon:fs:default:ps:default:page1:default';
    expect(cache[key].timestamp).toBeGreaterThanOrEqual(
      beforeCache
    );
    expect(cache[key].timestamp).toBeLessThanOrEqual(afterCache);
  });

  it('separates cached pages by auth state, fileset, and ' +
    'page size', () => {
    const tag = makeTag('TAG1');

    const base = { count: 1, hasMore: false, page: 1 };
    cacheNotes('TAG1', [makeNote('anon', tag, 'anon')], {
      ...base, filesetId: 'FS_A', pageSize: 25, authed: false,
    });
    cacheNotes('TAG1', [makeNote('authed', tag, 'authed')], {
      ...base, filesetId: 'FS_A', pageSize: 25, authed: true,
    });
    cacheNotes('TAG1', [makeNote('other-fs', tag, 'other-fs')], {
      ...base, filesetId: 'FS_B', pageSize: 25, authed: false,
    });
    cacheNotes('TAG1', [makeNote('other-ps', tag, 'other-ps')], {
      ...base, filesetId: 'FS_A', pageSize: 50, authed: false,
    });

    const scope = (
      authed: boolean,
      filesetId = 'FS_A',
      pageSize = 25
    ) => ({ filesetId, pageSize, authed });

    // A private-note page cached under an authed scope must not
    // be served to anonymous readers (and vice versa).
    expect(
      getCachedNotes('TAG1', 1, null, scope(false))?.notes[0].id
    ).toBe('anon');
    expect(
      getCachedNotes('TAG1', 1, null, scope(true))?.notes[0].id
    ).toBe('authed');
    expect(
      getCachedNotes('TAG1', 1, null, scope(false, 'FS_B'))
        ?.notes[0].id
    ).toBe('other-fs');
    expect(
      getCachedNotes('TAG1', 1, null, scope(false, 'FS_A', 50))
        ?.notes[0].id
    ).toBe('other-ps');
  });

  it('clearNotesCache(tagId) clears every scoped page of the ' +
    'tag', () => {
    const tag = makeTag('TAG1');
    const note = makeNote('n1', tag, 'n');
    const base = { count: 1, hasMore: false, page: 1 };
    cacheNotes('TAG1', [note], {
      ...base, filesetId: 'FS_A', authed: false,
    });
    cacheNotes('TAG1', [note], {
      ...base, filesetId: 'FS_B', authed: true,
    });

    clearNotesCache('TAG1');

    expect(getCachedNotes('TAG1', 1, null, {
      filesetId: 'FS_A', authed: false,
    })).toBeNull();
    expect(getCachedNotes('TAG1', 1, null, {
      filesetId: 'FS_B', authed: true,
    })).toBeNull();
  });

  it('should cache different pages independently', () => {
    const tag = makeTag('TAG1');
    const page1Notes = [makeNote('note1', tag, 'Page 1 note')];
    const page2Notes = [makeNote('note2', tag, 'Page 2 note')];

    cacheNotes('TAG1', page1Notes, {
      count: 50,
      hasMore: true,
      page: 1,
    });
    cacheNotes('TAG1', page2Notes, {
      count: 50,
      hasMore: true,
      page: 2,
    });

    expect(getCachedNotes('TAG1', 1)?.notes).toEqual(page1Notes);
    expect(getCachedNotes('TAG1', 2)?.notes).toEqual(page2Notes);
  });

  it('should cache different orderings independently', () => {
    const tag = makeTag('TAG1');
    const defaultNotes = [makeNote('note1', tag, 'Default order')];
    const customNotes = [makeNote('note2', tag, 'Custom order')];

    cacheNotes('TAG1', defaultNotes, {
      count: 2,
      hasMore: false,
      page: 1,
      ordering: null,
    });
    cacheNotes('TAG1', customNotes, {
      count: 2,
      hasMore: false,
      page: 1,
      ordering: 'custom',
    });

    expect(getCachedNotes('TAG1', 1, null)?.notes).toEqual(
      defaultNotes
    );
    expect(getCachedNotes('TAG1', 1, 'custom')?.notes).toEqual(
      customNotes
    );
  });

  it('should clear all pages when clearing tag cache', () => {
    const tag = makeTag('TAG1');
    const notes = [makeNote('note1', tag, 'Test note')];

    cacheNotes('TAG1', notes, { count: 50, hasMore: true, page: 1 });
    cacheNotes('TAG1', notes, { count: 50, hasMore: true, page: 2 });
    cacheNotes('TAG1', notes, {
      count: 50,
      hasMore: true,
      page: 1,
      ordering: 'custom',
    });

    clearNotesCache('TAG1');

    expect(getCachedNotes('TAG1', 1)).toBeNull();
    expect(getCachedNotes('TAG1', 2)).toBeNull();
    expect(getCachedNotes('TAG1', 1, 'custom')).toBeNull();
  });
});

describe('Audio Cache Manager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should cache and retrieve an audio URL', () => {
    const now = Date.now();
    const expires = Math.floor((now + 3600 * 1000) / 1000);
    const audioUrl = `http://audio.url/1?Expires=${expires}`;
    cacheAudioUrl('GEN', 1, 'KJV', audioUrl, 60, 1024);

    const cached = getCachedAudioUrl('GEN', 1, 'KJV');
    expect(cached).toBe(audioUrl);
  });

  it('should not return an expired audio URL', () => {
    const now = Date.now();
    const expires = Math.floor((now - 1000) / 1000);
    const audioUrl = `http://audio.url/1?Expires=${expires}`;
    cacheAudioUrl('GEN', 1, 'KJV', audioUrl, 60, 1024);

    const cached = getCachedAudioUrl('GEN', 1, 'KJV');
    expect(cached).toBeNull();
  });

  it('should clear expired audio URLs', () => {
    const now = Date.now();
    const expired = Math.floor((now - 1000) / 1000);
    const valid = Math.floor((now + 3600 * 1000) / 1000);
    const expiredUrl = `http://audio.url/1?Expires=${expired}`;
    const validUrl = `http://audio.url/2?Expires=${valid}`;

    cacheAudioUrl('GEN', 1, 'KJV', expiredUrl, 60, 1024); // Expired
    cacheAudioUrl('EXO', 2, 'ESV', validUrl, 120, 2048); // Not expired

    clearExpiredAudioUrls();

    const expiredCached = getCachedAudioUrl('GEN', 1, 'KJV');
    const validCached = getCachedAudioUrl('EXO', 2, 'ESV');

    expect(expiredCached).toBeNull();
    expect(validCached).toBe(validUrl);
  });

  it('falls back to the 24h default when Expires is malformed', () => {
    const audioUrl = 'http://audio.url/1?Expires=abc';
    cacheAudioUrl('GEN', 1, 'KJV', audioUrl, 60, 1024);

    // A NaN expiresAt would never expire — the guard must leave
    // the default 24h TTL so the entry still times out.
    expect(getCachedAudioUrl('GEN', 1, 'KJV')).toBe(audioUrl);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(getCachedAudioUrl('GEN', 1, 'KJV')).toBeNull();
  });

  it('falls back to the 24h default when Expires is missing', () => {
    const audioUrl = 'http://audio.url/1';
    cacheAudioUrl('GEN', 1, 'KJV', audioUrl, 60, 1024);

    expect(getCachedAudioUrl('GEN', 1, 'KJV')).toBe(audioUrl);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(getCachedAudioUrl('GEN', 1, 'KJV')).toBeNull();
  });

  it('falls back to the 24h default when the URL is unparseable', () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    cacheAudioUrl('GEN', 1, 'KJV', 'not-a-url', 60, 1024);

    expect(errorSpy).toHaveBeenCalledWith(
      'Error parsing audio URL expiration:',
      expect.any(Error)
    );
    expect(getCachedAudioUrl('GEN', 1, 'KJV')).toBe('not-a-url');

    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(getCachedAudioUrl('GEN', 1, 'KJV')).toBeNull();

    errorSpy.mockRestore();
  });

  // API.Bible `resourceUrl`s are AWS SigV4-presigned: expiry is
  // `X-Amz-Date` + `X-Amz-Expires` seconds.
  const amzDate = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  it('should honor X-Amz presigned URL expiry', () => {
    const now = Date.now();
    const signedAt = amzDate(new Date(now - 60 * 1000));
    const audioUrl =
      `https://cdn.example.com/JHN.3.mp3?X-Amz-Date=${signedAt}` +
      `&X-Amz-Expires=7200&X-Amz-Signature=abc`;
    cacheAudioUrl('JHN', 3, 'NIV', audioUrl, 0, 0);

    expect(getCachedAudioUrl('JHN', 3, 'NIV')).toBe(audioUrl);
  });

  it('should not return an expired X-Amz presigned URL', () => {
    const now = Date.now();
    const signedAt = amzDate(new Date(now - 2 * 3600 * 1000));
    const audioUrl =
      `https://cdn.example.com/JHN.3.mp3?X-Amz-Date=${signedAt}` +
      `&X-Amz-Expires=3600&X-Amz-Signature=abc`;
    cacheAudioUrl('JHN', 3, 'NIV', audioUrl, 0, 0);

    expect(getCachedAudioUrl('JHN', 3, 'NIV')).toBeNull();
  });

  it('should honor a lowercase expires epoch param', () => {
    const now = Date.now();
    const expires = Math.floor((now + 3600 * 1000) / 1000);
    const audioUrl = `http://audio.url/1?expires=${expires}`;
    cacheAudioUrl('GEN', 1, 'KJV', audioUrl, 60, 1024);

    expect(getCachedAudioUrl('GEN', 1, 'KJV')).toBe(audioUrl);
  });

  it('should ignore a non-epoch Expires param', () => {
    // parseInt('2025-01-01') would yield 2025 (epoch 1970 →
    // always expired); reject it and use the 24h default.
    const audioUrl = 'http://audio.url/1?Expires=2025-01-01';
    cacheAudioUrl('GEN', 1, 'KJV', audioUrl, 60, 1024);

    expect(getCachedAudioUrl('GEN', 1, 'KJV')).toBe(audioUrl);
  });

  it('should ignore an epoch-milliseconds Expires param', () => {
    // 1.7e12 is epoch ms, not seconds — must not be treated as
    // epoch seconds (~60k years out → never expires).
    const audioUrl =
      'http://audio.url/1?Expires=1893456000000';
    cacheAudioUrl('GEN', 1, 'KJV', audioUrl, 60, 1024);

    expect(getCachedAudioUrl('GEN', 1, 'KJV')).toBe(audioUrl);
  });
});

describe('Timestamp Cache', () => {
  const stamps: VerseTimestamp[] = [
    { verse_start: 0, timestamp: 0 },
    { verse_start: 1, timestamp: 3.5 },
  ];

  it('caches and retrieves timestamps per fileset/book/chapter', () => {
    cacheTimestamps('LAVNLIN1DA', 'JHN', 3, stamps);
    expect(getCachedTimestamps('LAVNLIN1DA', 'JHN', 3)).toEqual(
      stamps
    );
  });

  it('scopes entries by fileset id', () => {
    cacheTimestamps('A1DA', 'JHN', 3, stamps);
    expect(getCachedTimestamps('B1DA', 'JHN', 3)).toBeNull();
    expect(getCachedTimestamps('A1DA', 'JHN', 4)).toBeNull();
  });

  it('clears the timestamp cache', () => {
    cacheTimestamps('A1DA', 'JHN', 3, stamps);
    clearTimestampCache();
    expect(getCachedTimestamps('A1DA', 'JHN', 3)).toBeNull();
  });
});

describe('Headings Cache', () => {
  const headings: SectionHeading[] = [
    { before_verse: 1, text: 'Prologue' },
  ];

  it('caches and retrieves headings per version/book/chapter', () => {
    cacheHeadings('JHN', 1, 'ENGESV', headings);
    expect(getCachedHeadings('JHN', 1, 'ENGESV')).toEqual(headings);
    expect(getCachedHeadings('JHN', 1, 'KJV')).toBeNull();
    expect(getCachedHeadings('JHN', 2, 'ENGESV')).toBeNull();
  });

  it('clears the headings cache', () => {
    cacheHeadings('JHN', 1, 'ENGESV', headings);
    clearHeadingsCache();
    expect(getCachedHeadings('JHN', 1, 'ENGESV')).toBeNull();
  });
});
