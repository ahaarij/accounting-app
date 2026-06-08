import { Navigate } from 'react-router-dom';
import { useAuth, UserRole } from './AuthContext';

export function PrivateRoute({ children, roles }: { children: JSX.Element; roles?: UserRole[] }) {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
