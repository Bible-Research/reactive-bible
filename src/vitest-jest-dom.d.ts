import type { TestingLibraryMatchers } from
  '@testing-library/jest-dom/matchers';

/* eslint-disable @typescript-eslint/no-empty-interface */
/* eslint-disable @typescript-eslint/no-unused-vars */
declare module 'vitest' {
  // jest-dom v5 types only augment Jest's Matchers; extend
  // vitest's Assertion so DOM matchers typecheck in tests.
  interface Assertion<R extends void | Promise<void> = void, T = unknown>
    extends TestingLibraryMatchers<
      typeof expect.stringContaining,
      R
    > {}
}
