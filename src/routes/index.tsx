import { Routes, Route, Navigate } from 'react-router-dom';
import BibleRoute from './BibleRoute';
import NotesRoute from './NotesRoute';
import TagNotesRoute from './TagNotesRoute';

export function AppRoutes() {
  return (
    <Routes>
      {/* Redirect root to /bible (will redirect to current book/chapter) */}
      <Route path="/" element={<Navigate to="/bible" replace />} />
      
      {/* Bible routes */}
      <Route path="/bible" element={<BibleRoute />} />
      <Route path="/bible/:book/:chapter" element={<BibleRoute />} />
      
      {/* Notes routes */}
      <Route path="/notes" element={<NotesRoute />} />
      <Route path="/notes/tag/:tagId" element={<TagNotesRoute />} />
      
      {/* Catch-all: redirect to bible */}
      <Route path="*" element={<Navigate to="/bible" replace />} />
    </Routes>
  );
}
