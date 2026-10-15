import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  // Check `token`, not just `isAuthenticated`: the token
  // rehydrates synchronously from localStorage while
  // `isAuthenticated` only flips once App's mount effect calls
  // checkAuth — gating on isAuthenticated alone would bounce
  // logged-in users refreshing a protected page (the same
  // timing NotesRoute documents). checkAuth validates the
  // token server-side and logs out on rejection, which then
  // clears `token` and triggers this redirect.
  const token = useAuthStore((state) => state.token);
  const location = useLocation();

  if (!isAuthenticated && !token) {
    // Redirect to login, but save the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
