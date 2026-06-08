import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type UserRole = 'super_admin' | 'admin' | 'developer' | 'user';

interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
  name?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  isSuperAdmin: boolean;
  isAdmin: boolean;       // super_admin or admin
  canEdit: boolean;       // anyone except plain user
}

const AuthContext = createContext<AuthContextValue>(null!);

function parseToken(token: string): AuthUser | null {
  try {
    const p = JSON.parse(atob(token.split('.')[1]));
    return { id: p.sub, email: p.email, role: p.role, name: p.name };
  } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const t = localStorage.getItem('token');
    return t ? parseToken(t) : null;
  });

  const login = useCallback((newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(parseToken(newToken));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, token, login, logout,
      isSuperAdmin: user?.role === 'super_admin',
      isAdmin: user?.role === 'super_admin' || user?.role === 'admin',
      canEdit: user?.role !== 'user',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
