import { Routes, Route, Navigate } from 'react-router-dom';
import BibleRoute from './BibleRoute';
import NotesRoute from './NotesRoute';
import TagNotesRoute from './TagNotesRoute';
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
      
      {/* Bible routes - public (can view Bible without auth) */}
      <Route path="/bible" element={<BibleRoute />} />
      <Route path="/bible/:book/:chapter" element={<BibleRoute />} />
      
      {/* Protected Notes routes - require authentication */}
      <Route 
        path="/notes" 
        element={
          <ProtectedRoute>
            <NotesRoute />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/notes/tag/:tagId" 
        element={
          <ProtectedRoute>
            <TagNotesRoute />
          </ProtectedRoute>
        } 
      />
      
      {/* Catch-all: redirect to bible */}
      <Route path="*" element={<Navigate to="/bible" replace />} />
    </Routes>
  );
}
