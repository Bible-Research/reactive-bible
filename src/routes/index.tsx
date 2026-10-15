import { Routes, Route, Navigate } from 'react-router-dom';
import BibleRoute from './BibleRoute';
import LegacyBibleRedirect from './LegacyBibleRedirect';
import NotesRoute from './NotesRoute';
import TagNotesRoute from './TagNotesRoute';
import NoteDetailRoute from './NoteDetailRoute';
import TagManagementRoute from './TagManagementRoute';
import SearchRoute from './SearchRoute';
import { LoginPage } from '../components/LoginPage';
import { RegisterPage } from '../components/RegisterPage';
import { ProtectedRoute } from '../components/ProtectedRoute';

export function AppRoutes() {
  return (
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
  );
}
