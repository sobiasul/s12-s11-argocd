import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type User } from "./api";

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, displayName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load, ask the server who we are. The cookie may still be valid from
  // a previous visit, so this is what makes a refresh not log you out.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { user } = await api.get<{ user: User }>("/auth/me");
        if (!cancelled) setUser(user);
      } catch {
        // Access token expired? Try one silent refresh before giving up.
        try {
          const { user } = await api.post<{ user: User }>("/auth/refresh");
          if (!cancelled) setUser(user);
        } catch {
          if (!cancelled) setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await api.post<{ user: User }>("/auth/login", { email, password });
    setUser(user);
  }, []);

  const register = useCallback(async (email: string, displayName: string, password: string) => {
    const { user } = await api.post<{ user: User }>("/auth/register", { email, displayName, password });
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
