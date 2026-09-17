import { describe, it, expect, beforeEach, vi } from 'vitest';
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
} from './cacheManager';
import { Translation } from '../store';
import { Note, Tag } from '../types';

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
  beforeEach(() => {
    localStorageMock.clear();
    vi.useFakeTimers();
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

    // Initial access
    getCachedVerses('GEN', 1, 'KJV');
    let metadata = getVerseCacheMetadata();
    expect(metadata.lruQueue[metadata.lruQueue.length - 1]).toBe('KJV:GEN:1');

    // Second access
    vi.advanceTimersByTime(1000);
    getCachedVerses('GEN', 1, 'KJV');
    metadata = getVerseCacheMetadata();
    expect(metadata.lruQueue[metadata.lruQueue.length - 1]).toBe('KJV:GEN:1');
  });

  it('should clear the verse cache', () => {
    const verses = [{ verse: 1, text: 'Test verse' }];
    cacheVerses('GEN', 1, 'KJV', verses);
    clearVerseCache();
    const cached = getCachedVerses('GEN', 1, 'KJV');
    expect(cached).toBeNull();
  });
});

describe('Translation Cache Manager', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

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

describe('Notes Cache Manager', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should cache and retrieve notes for a tag', () => {
    const tag: Tag = {
      id: 'TAG123',
      name: 'Test Tag',
      parent_tag: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    
    const notes: Note[] = [
      {
        id: 'note1',
        note_text: 'Test note 1',
        public: false,
        is_owner: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        tag,
        verses: [],
        tag_position: null,
      },
      {
        id: 'note2',
        note_text: 'Test note 2',
        public: true,
        is_owner: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        tag,
        verses: [],
        tag_position: null,
      },
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
    const tag1: Tag = { id: 'TAG1', name: 'Tag 1', parent_tag: null, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' };
    const tag2: Tag = { id: 'TAG2', name: 'Tag 2', parent_tag: null, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' };
    
    const notes1: Note[] = [
      {
        id: 'note1',
        note_text: 'Tag 1 note',
        public: false,
        is_owner: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        tag: tag1,
        verses: [],
        tag_position: null,
      },
    ];
    
    const notes2: Note[] = [
      {
        id: 'note2',
        note_text: 'Tag 2 note',
        public: false,
        is_owner: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        tag: tag2,
        verses: [],
        tag_position: null,
      },
    ];
    
    cacheNotes('TAG1', notes1);
    cacheNotes('TAG2', notes2);
    
    expect(getCachedNotes('TAG1')?.notes).toEqual(notes1);
    expect(getCachedNotes('TAG2')?.notes).toEqual(notes2);
  });

  it('should clear notes cache for a specific tag', () => {
    const tag1: Tag = { id: 'TAG1', name: 'Tag 1', parent_tag: null, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' };
    const tag2: Tag = { id: 'TAG2', name: 'Tag 2', parent_tag: null, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' };
    
    const notes1: Note[] = [
      { id: 'note1', note_text: 'Note 1', public: false, is_owner: true, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z', tag: tag1, verses: [], tag_position: null },
    ];
    const notes2: Note[] = [
      { id: 'note2', note_text: 'Note 2', public: false, is_owner: true, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z', tag: tag2, verses: [], tag_position: null },
    ];
    
    cacheNotes('TAG1', notes1);
    cacheNotes('TAG2', notes2);
    
    clearNotesCache('TAG1');
    
    expect(getCachedNotes('TAG1')).toBeNull();
    expect(getCachedNotes('TAG2')?.notes).toEqual(notes2);
  });

  it('should clear all notes cache', () => {
    const tag1: Tag = { id: 'TAG1', name: 'Tag 1', parent_tag: null, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' };
    const tag2: Tag = { id: 'TAG2', name: 'Tag 2', parent_tag: null, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' };
    
    const notes1: Note[] = [
      { id: 'note1', note_text: 'Note 1', public: false, is_owner: true, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z', tag: tag1, verses: [], tag_position: null },
    ];
    const notes2: Note[] = [
      { id: 'note2', note_text: 'Note 2', public: false, is_owner: true, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z', tag: tag2, verses: [], tag_position: null },
    ];
    
    cacheNotes('TAG1', notes1);
    cacheNotes('TAG2', notes2);
    
    clearNotesCache();
    
    expect(getCachedNotes('TAG1')).toBeNull();
    expect(getCachedNotes('TAG2')).toBeNull();
  });

  it('should update cached notes when caching again for same tag', () => {
    const tag: Tag = { id: 'TAG1', name: 'Tag 1', parent_tag: null, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' };
    
    const initialNotes: Note[] = [
      { id: 'note1', note_text: 'Initial note', public: false, is_owner: true, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z', tag, verses: [], tag_position: null },
    ];
    const updatedNotes: Note[] = [
      { id: 'note1', note_text: 'Updated note', public: false, is_owner: true, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z', tag, verses: [], tag_position: null },
      { id: 'note2', note_text: 'New note', public: false, is_owner: true, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z', tag, verses: [], tag_position: null },
    ];
    
    cacheNotes('TAG1', initialNotes);
    cacheNotes('TAG1', updatedNotes);
    
    const cached = getCachedNotes('TAG1');
    expect(cached?.notes).toEqual(updatedNotes);
    expect(cached?.notes.length).toBe(2);
  });

  it('should store timestamp with cached notes', () => {
    const tag: Tag = { id: 'TAG1', name: 'Tag 1', parent_tag: null, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' };
    
    const notes: Note[] = [
      { id: 'note1', note_text: 'Test note', public: false, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z', tag, verses: [] },
    ];
    
    const beforeCache = Date.now();
    cacheNotes('TAG1', notes);
    const afterCache = Date.now();
    
    // Verify timestamp is stored (check localStorage directly)
    const cacheStr = localStorageMock.getItem('bible_notes_cache');
    expect(cacheStr).toBeTruthy();
    
    const cache = JSON.parse(cacheStr!);
    expect(cache['TAG1:page1:default'].timestamp).toBeGreaterThanOrEqual(
      beforeCache
    );
    expect(cache['TAG1:page1:default'].timestamp).toBeLessThanOrEqual(
      afterCache
    );
  });

  it('should cache different pages independently', () => {
    const tag: Tag = {
      id: 'TAG1',
      name: 'Tag 1',
      parent_tag: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    const page1Notes: Note[] = [
      {
        id: 'note1',
        note_text: 'Page 1 note',
        public: false,
        is_owner: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        tag,
        verses: [],
        tag_position: null,
      },
    ];

    const page2Notes: Note[] = [
      {
        id: 'note2',
        note_text: 'Page 2 note',
        public: false,
        is_owner: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        tag,
        verses: [],
        tag_position: null,
      },
    ];

    cacheNotes('TAG1', page1Notes, { count: 50, hasMore: true, page: 1 });
    cacheNotes('TAG1', page2Notes, { count: 50, hasMore: true, page: 2 });

    expect(getCachedNotes('TAG1', 1)?.notes).toEqual(page1Notes);
    expect(getCachedNotes('TAG1', 2)?.notes).toEqual(page2Notes);
  });

  it('should cache different orderings independently', () => {
    const tag: Tag = {
      id: 'TAG1',
      name: 'Tag 1',
      parent_tag: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    const defaultNotes: Note[] = [
      {
        id: 'note1',
        note_text: 'Default order',
        public: false,
        is_owner: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        tag,
        verses: [],
        tag_position: null,
      },
    ];

    const customNotes: Note[] = [
      {
        id: 'note2',
        note_text: 'Custom order',
        public: false,
        is_owner: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        tag,
        verses: [],
        tag_position: null,
      },
    ];

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

    expect(getCachedNotes('TAG1', 1, null)?.notes).toEqual(defaultNotes);
    expect(getCachedNotes('TAG1', 1, 'custom')?.notes).toEqual(customNotes);
  });

  it('should clear all pages when clearing tag cache', () => {
    const tag: Tag = {
      id: 'TAG1',
      name: 'Tag 1',
      parent_tag: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    const notes: Note[] = [
      {
        id: 'note1',
        note_text: 'Test note',
        public: false,
        is_owner: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        tag,
        verses: [],
        tag_position: null,
      },
    ];

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
    localStorageMock.clear();
    vi.useFakeTimers();
  });

  it('should cache and retrieve an audio URL', () => {
    const now = Date.now();
    const audioUrl = `http://audio.url/1?Expires=${Math.floor((now + 3600 * 1000) / 1000)}`;
    cacheAudioUrl('GEN', 1, 'KJV', audioUrl, 60, 1024);

    const cached = getCachedAudioUrl('GEN', 1, 'KJV');
    expect(cached).toBe(audioUrl);
  });

  it('should not return an expired audio URL', () => {
    const now = Date.now();
    const audioUrl = `http://audio.url/1?Expires=${Math.floor((now - 1000) / 1000)}`;
    cacheAudioUrl('GEN', 1, 'KJV', audioUrl, 60, 1024);

    const cached = getCachedAudioUrl('GEN', 1, 'KJV');
    expect(cached).toBeNull();
  });

  it('should clear expired audio URLs', () => {
    const now = Date.now();
    const expiredUrl = `http://audio.url/1?Expires=${Math.floor((now - 1000) / 1000)}`;
    const validUrl = `http://audio.url/2?Expires=${Math.floor((now + 3600 * 1000) / 1000)}`;

    cacheAudioUrl('GEN', 1, 'KJV', expiredUrl, 60, 1024); // Expired
    cacheAudioUrl('EXO', 2, 'ESV', validUrl, 120, 2048); // Not expired

    clearExpiredAudioUrls();

    const expiredCached = getCachedAudioUrl('GEN', 1, 'KJV');
    const validCached = getCachedAudioUrl('EXO', 2, 'ESV');

    expect(expiredCached).toBeNull();
    expect(validCached).toBe(validUrl);
  });
});
