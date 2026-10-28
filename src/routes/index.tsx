import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
// Eager: the bible reader is the landing route, so splitting it
// would only add a waterfall before first paint.
import BibleRoute from './BibleRoute';
import LegacyBibleRedirect from './LegacyBibleRedirect';
import { ProtectedRoute } from '../components/ProtectedRoute';
// lazyWithReload self-heals stale hashed chunks after a deploy
// (one guarded page reload) instead of crashing the boundary.
import { lazyWithReload } from '../utils/lazyWithReload';

const NotesRoute = lazyWithReload(() => import('./NotesRoute'));
const TagNotesRoute = lazyWithReload(
  () => import('./TagNotesRoute')
);
const NoteDetailRoute = lazyWithReload(
  () => import('./NoteDetailRoute')
);
const TagManagementRoute = lazyWithReload(
  () => import('./TagManagementRoute')
);
const SearchRoute = lazyWithReload(() => import('./SearchRoute'));
const LoginPage = lazyWithReload(() =>
  import('../components/LoginPage').then((m) => ({
    default: m.LoginPage,
  }))
);
const RegisterPage = lazyWithReload(() =>
  import('../components/RegisterPage').then((m) => ({
    default: m.RegisterPage,
  }))
);

const routeFallback = (
  <Center style={{ height: '100%' }}>
    <Loader />
  </Center>
);

export function AppRoutes() {
  return (
    <Suspense fallback={routeFallback}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Navigate to="/bible" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Search route */}
        <Route path="/search" element={<SearchRoute />} />

        {/* Bible routes - public (can view Bible without auth) */}
        <Route path="/bible" element={<BibleRoute />} />
        <Route path="/bible/:ref" element={<BibleRoute />} />
        {/* Legacy name-based URLs: /bible/John/3.16 */}
        <Route
          path="/bible/:book/:chapterVerse"
          element={<LegacyBibleRedirect />}
        />

        {/* Notes routes - public for viewing, protected for private notes */}
        <Route path="/notes" element={<NotesRoute />} />
        <Route path="/notes/tag/:tagId" element={<TagNotesRoute />} />
        <Route path="/notes/:noteId" element={<NoteDetailRoute />} />

        {/* Tag management route - protected: it only exists to
            write user-owned tags, so anonymous visitors go to
            /login. /notes/tag/:tagId and /notes/:noteId stay
            public for sharing. */}
        <Route
          path="/tags"
          element={
            <ProtectedRoute>
              <TagManagementRoute />
            </ProtectedRoute>
          }
        />
        {/* Catch-all: redirect to bible */}
        <Route path="*" element={<Navigate to="/bible" replace />} />
      </Routes>
    </Suspense>
  );
}
