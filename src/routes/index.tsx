import { Routes, Route, Navigate } from 'react-router-dom';
import BibleRoute from './BibleRoute';
import NotesRoute from './NotesRoute';
import TagNotesRoute from './TagNotesRoute';
import NoteDetailRoute from './NoteDetailRoute';
import TagManagementRoute from './TagManagementRoute';
import SearchRoute from './SearchRoute';
import { LoginPage } from '../components/LoginPage';
import { RegisterPage } from '../components/RegisterPage';

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
      <Route path="/bible/:book/:chapterVerse" element={<BibleRoute />} />

      {/* Notes routes - public for viewing, protected for private notes */}
      <Route path="/notes" element={<NotesRoute />} />
      <Route path="/notes/tag/:tagId" element={<TagNotesRoute />} />
      <Route path="/notes/:noteId" element={<NoteDetailRoute />} />

      {/* Tag management route */}
      <Route path="/tags" element={<TagManagementRoute />} />
      {/* Catch-all: redirect to bible */}
      <Route path="*" element={<Navigate to="/bible" replace />} />
    </Routes>
  );
}
