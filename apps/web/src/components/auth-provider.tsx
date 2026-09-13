"use client";

import type { AuthResponse, AuthenticatedUser } from "@trading-bolt/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiRequest } from "@/lib/api";
import { authStorage } from "@/lib/auth-storage";

interface AuthContextValue {
  user: AuthenticatedUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restore(): Promise<void> {
      const accessToken = authStorage.getAccessToken();
      if (accessToken) {
        try {
          const me = await apiRequest<AuthenticatedUser>("/api/auth/me", {
            token: accessToken,
          });
          if (!cancelled) {
            setUser(me);
          }
        } catch {
          authStorage.clear();
        }
      }
      if (!cancelled) {
        setLoading(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiRequest<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    authStorage.setTokens(response.tokens);
    setUser(response.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const response = await apiRequest<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: { email, password },
    });
    authStorage.setTokens(response.tokens);
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    const accessToken = authStorage.getAccessToken();
    const refreshToken = authStorage.getRefreshToken();
    try {
      if (accessToken && refreshToken) {
        await apiRequest<void>("/api/auth/logout", {
          method: "POST",
          token: accessToken,
          body: { refreshToken },
        });
      }
    } finally {
      authStorage.clear();
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
