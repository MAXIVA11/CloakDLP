"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { getCurrentUser, localLogin } from "@/lib/api";
import type { CurrentUser } from "@/lib/types";

const TOKEN_KEY = "cloakdlp_token";

interface AuthState {
  token: string | null;
  user: CurrentUser | null;
  loading: boolean;
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

    // Zero-config sign-in: the console is a personal, single-user tool, so opening it on the
    // machine it's running on (Start Menu shortcut, agent-adjacent tray app) is the only sign-in
    // flow there is. The backend trusts the loopback connection and logs us straight in.
    async function tryLocalLogin() {
      try {
        const accessToken = await localLogin();
        const u = await getCurrentUser(accessToken);
        window.localStorage.setItem(TOKEN_KEY, accessToken);
        setToken(accessToken);
        setUser(u);
      } catch {
        // not reachable via loopback (or some other failure); user/token stay null
      }
    }
  }, []);

  const value = useMemo(() => ({ token, user, loading }), [token, user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
