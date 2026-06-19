import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchCurrentUser, getStoredToken, loginAccount, registerAccount, setStoredToken, type AuthUser } from "./authApi";
import { AuthPage } from "./AuthPage";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetchCurrentUser()
      .then((u) => { if (!cancelled) setUser(u); })
      .catch(() => { setStoredToken(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: u } = await loginAccount(email, password);
    setStoredToken(token);
    setUser(u);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const { token, user: u } = await registerAccount(email, password);
    setStoredToken(token);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function ProtectedRoute({ children, hint }: { children: ReactNode; hint?: string }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="page">
        <div className="container auth-loading">
          <div className="skeleton sk-line" style={{ width: "200px", height: "24px", margin: "0 auto" }} />
        </div>
      </div>
    );
  }
  if (!user) {
    return <AuthPage redirectHint={hint ?? "Sign in to view your orders and checkout."} />;
  }
  return <>{children}</>;
}
