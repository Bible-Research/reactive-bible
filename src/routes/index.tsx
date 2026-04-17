import { Routes, Route, Navigate } from 'react-router-dom';
import BibleRoute from './BibleRoute';
import NotesRoute from './NotesRoute';
import TagNotesRoute from './TagNotesRoute';
import TagManagementRoute from './TagManagementRoute';
import { LoginPage } from '../components/LoginPage';
import { RegisterPage } from '../components/RegisterPage';

export function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Navigate to="/bible" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Bible routes - public (can view Bible without auth) */}
      <Route path="/bible" element={<BibleRoute />} />
      <Route path="/bible/:book/:chapter" element={<BibleRoute />} />

      {/* Notes routes - public for viewing, protected for private notes */}
      <Route path="/notes" element={<NotesRoute />} />
      <Route path="/notes/tag/:tagId" element={<TagNotesRoute />} />

      {/* Tag management route */}
      <Route path="/tags" element={<TagManagementRoute />} />
      {/* Catch-all: redirect to bible */}
      <Route path="*" element={<Navigate to="/bible" replace />} />
    </Routes>
  );
}
