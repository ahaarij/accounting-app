import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function PrivateRoute({ children, adminOnly = false }: { children: JSX.Element; adminOnly?: boolean }) {
  const { token, isAdmin } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}
