"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getCurrentUser, localLogin, login as apiLogin } from "@/lib/api";
import type { CurrentUser } from "@/lib/types";

const TOKEN_KEY = "cloakdlp_token";

interface AuthState {
  token: string | null;
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    if (stored) {
      getCurrentUser(stored)
        .then((u) => {
          setToken(stored);
          setUser(u);
        })
        .catch(() => {
          window.localStorage.removeItem(TOKEN_KEY);
          return tryLocalLogin();
        })
        .finally(() => setLoading(false));
      return;
    }
    tryLocalLogin().finally(() => setLoading(false));

    // Zero-config sign-in: if this console is being opened on the same machine it's running
    // on (the normal case — Start Menu shortcut, agent-adjacent tray app), the backend trusts
    // the loopback connection and logs us straight in. Opened from another machine on the LAN,
    // this 403s and the regular login form shows instead — nothing breaks, it just falls back.
    async function tryLocalLogin() {
      try {
        const accessToken = await localLogin();
        const u = await getCurrentUser(accessToken);
        window.localStorage.setItem(TOKEN_KEY, accessToken);
        setToken(accessToken);
        setUser(u);
      } catch {
        // not reachable via loopback (or some other failure) — fall through to manual login
      }
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const accessToken = await apiLogin(email, password);
    const u = await getCurrentUser(accessToken);
    window.localStorage.setItem(TOKEN_KEY, accessToken);
    setToken(accessToken);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, loading, login, logout }),
    [token, user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
