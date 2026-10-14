import '@testing-library/jest-dom';
import { vi, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { server } from './mocks/server';

// Mock localStorage with enough `Storage` fidelity for code
// that uses `length`, `key(n)`, bracket access, or enumeration
// (`Object.keys(localStorage)`, `for...in`).
const createLocalStorageMock = (): Storage => {
  let store: Record<string, string> = {};
  const has = (key: string | symbol): boolean =>
    Object.prototype.hasOwnProperty.call(store, key);
  const target = {
    getItem: (key: string): string | null =>
      has(key) ? store[key] : null,
    setItem: (key: string, value: string): void => {
      store[String(key)] = String(value);
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    clear: (): void => {
      store = {};
    },
    key: (index: number): string | null =>
      Object.keys(store)[index] ?? null,
    get length(): number {
      return Object.keys(store).length;
    },
  };
  return new Proxy(target, {
    get: (t, prop) => {
      if (prop in t) return Reflect.get(t, prop);
      if (typeof prop === 'string' && has(prop)) {
        return store[prop];
      }
      return undefined;
    },
    set: (t, prop, value) => {
      if (typeof prop === 'string' && !(prop in t)) {
        store[prop] = String(value);
        return true;
      }
      return Reflect.set(t, prop, value);
    },
    has: (t, prop) => prop in t || has(prop),
    deleteProperty: (t, prop) => {
      if (has(prop)) {
        delete store[prop as string];
        return true;
      }
      return Reflect.deleteProperty(t, prop);
    },
    ownKeys: () => Reflect.ownKeys(store),
    getOwnPropertyDescriptor: (t, prop) => {
      if (has(prop)) {
        return {
          value: store[prop as string],
          writable: true,
          enumerable: true,
          configurable: true,
        };
      }
      return Reflect.getOwnPropertyDescriptor(t, prop);
    },
  }) as Storage;
};

vi.stubGlobal('localStorage', createLocalStorageMock());

// Mock Vercel Analytics and Speed Insights to prevent
// external script loading errors in test environment
vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

vi.mock('@vercel/speed-insights/react', () => ({
  SpeedInsights: () => null,
}));

// Establish API mocking before all tests. 'error' — not
// 'warn' — because an unhandled request is otherwise performed
// for real, silently hitting the production API.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests.
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});

// Clear localStorage before each test
beforeEach(() => {
  localStorage.clear();
});

// Clean up after the tests are finished.
afterAll(() => server.close());
