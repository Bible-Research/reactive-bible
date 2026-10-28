import { lazy, type ComponentType } from 'react';
import {
  isChunkLoadError,
  reloadForStaleChunk,
} from './chunkLoadError';

// React.lazy's declared factory resolves modules to
// `ComponentType<any>`; `Parameters<typeof lazy>` recovers that
// signature without writing `any` in this file.
type LazyFactory = Parameters<typeof lazy>[0];

// Deliberately never settles — the reload replaces this page
// before resolution would matter. `Promise<never>` keeps the
// generic below out of this branch (a `ComponentType<T>` here
// would poison inference to `never`).
const NEVER_SETTLES = new Promise<never>(() => undefined);

/**
 * Drop-in for `React.lazy` that self-heals stale chunks after a
 * deploy. When the dynamic import rejects with a chunk-load
 * error the page reloads once (fresh index.html → fresh asset
 * hashes) and the returned promise deliberately never settles
 * while the reload tears the page down — the Suspense fallback
 * stays mounted instead of flashing an error. Once the reload
 * guard has fired, or for any non-chunk failure, the original
 * error is rethrown so ErrorBoundary/reportError handle it.
 */
// `ComponentType<never>` is the universal component supertype:
// props are contravariant, so every ComponentType<P> is
// assignable to it (React's own lazy() uses
// `ComponentType<any>`, which the no-any rule bans). The lazy
// component is returned as plain `T` — `LazyExoticComponent`'s
// own `ComponentType<any>` bound is likewise unwritable
// without `any`, and `T` keeps JSX prop checking exact.
export const lazyWithReload = <T extends ComponentType<never>>(
  factory: () => Promise<{ default: T }>
): T => {
  const wrapped = (async () => {
    try {
      return await factory();
    } catch (error) {
      if (isChunkLoadError(error) && reloadForStaleChunk()) {
        return NEVER_SETTLES;
      }
      throw error;
    }
  }) as unknown as LazyFactory;
  return lazy(wrapped) as unknown as T;
};
