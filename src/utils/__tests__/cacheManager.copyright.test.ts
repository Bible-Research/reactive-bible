import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from 'vitest';
import {
  cacheCopyright,
  getCachedCopyright,
  clearCopyrightCache,
} from '../cacheManager';
import { FilesetCopyright } from '../../types';

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

const sampleCopyright: FilesetCopyright[] = [
  {
    id: 'ENGESV',
    type: 'text_plain',
    size: 'C',
    copyright: '© 2001 Crossway Bibles',
    copyright_date: '2001',
    copyright_description:
      'The Holy Bible, English Standard Version',
  },
];

describe('Copyright Cache', () => {
  beforeEach(() => {
    localStorageMock.clear();
    // Invalidate in-memory storageCache in cacheManager
    // by simulating tab visibility change
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(
      new Event('visibilitychange')
    );
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(
      new Event('visibilitychange')
    );
  });

  it('stores and retrieves copyright data', () => {
    cacheCopyright('ENGESV', sampleCopyright);
    const result = getCachedCopyright('ENGESV');

    expect(result).toEqual(sampleCopyright);
  });

  it('returns null on cache miss', () => {
    const result = getCachedCopyright('ENGESV');

    expect(result).toBeNull();
  });

  it('clears all copyright cache entries', () => {
    cacheCopyright('ENGESV', sampleCopyright);
    cacheCopyright('ENGKJV', []);

    clearCopyrightCache();

    expect(getCachedCopyright('ENGESV')).toBeNull();
    expect(getCachedCopyright('ENGKJV')).toBeNull();
  });
});
