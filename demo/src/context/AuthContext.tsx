"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  api,
  clearMfaToken,
  clearTokens,
  getTokens,
  getUser,
  setMfaToken,
  setTokens,
  setUser,
} from "@/lib/auth";

export interface AuthUser {
  userId: number;
  email: string;
  accountId: number;
  accountType: string;
  roleId: number;
  roleSlug: string;
  privileges: string[];
  isPlatformAdmin: boolean;
  mfaEnabled: boolean;
  mfaEnforcementActive: boolean;
  ipAllowlist?: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ mfaRequired?: boolean; error?: string }>;
  verifyMfa: (code: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    const { accessToken } = getTokens();
    if (!accessToken) {
      setUserState(null);
      setIsLoading(false);
      return;
    }
    try {
      const res = await api.get("/api/auth/me");
      if (!res.ok) {
        clearTokens();
        setUserState(null);
        return;
      }
      const data = await res.json();
      setUserState(data.user);
      setUser(data.user);
    } catch {
      setUserState(getUser<AuthUser>());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post("/api/auth/login", { email, password });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || "Login failed" };
      }
      if (data.mfa_required && data.mfaToken) {
        setMfaToken(data.mfaToken);
        router.push("/login?mfa=1");
        return { mfaRequired: true };
      }
      if (data.tokens?.accessToken) {
        setTokens(data.tokens.accessToken, data.tokens.refreshToken);
        if (data.user) {
          setUserState(data.user);
          setUser(data.user);
        } else {
          await refreshUser();
        }
        clearMfaToken();
        router.push("/dashboard");
        return {};
      }
      return { error: "Unexpected login response" };
    },
    [router, refreshUser]
  );

  const verifyMfa = useCallback(
    async (code: string) => {
      const mfaToken = localStorage.getItem("gc_mfa_token");
      if (!mfaToken) return { error: "MFA session expired. Please log in again." };
      const res = await api.post("/api/auth/mfa/verify", { mfaToken, code });
      const data = await res.json();
      if (!res.ok) return { error: data.error || "Invalid MFA code" };
      if (data.tokens?.accessToken) {
        setTokens(data.tokens.accessToken, data.tokens.refreshToken);
        if (data.user) {
          setUserState(data.user);
          setUser(data.user);
        } else {
          await refreshUser();
        }
        clearMfaToken();
        router.push("/dashboard");
        return {};
      }
      return { error: "Unexpected MFA response" };
    },
    [router, refreshUser]
  );

  const logout = useCallback(async () => {
    const { refreshToken } = getTokens();
    try {
      if (refreshToken) {
        await api.post("/api/auth/logout", { refreshToken });
      }
    } catch {
      // ignore
    }
    clearTokens();
    clearMfaToken();
    setUserState(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, verifyMfa, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
