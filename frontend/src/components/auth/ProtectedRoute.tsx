import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const checkAdmin = useAuthStore((s) => s.isAdmin);
  if (!checkAdmin()) return <Navigate to="/" replace />;
  return <>{children}</>;
}
