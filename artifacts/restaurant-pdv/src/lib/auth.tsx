import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "wouter";
import {
  defaultPathForRole,
  setCurrentActorFromAuth,
  type Actor,
  type Role,
} from "@/lib/rbac";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
};

export type AuthStore = {
  id: number;
  name: string;
  role: Role;
};

export type PlatformRole =
  | "platform_owner"
  | "platform_admin"
  | "platform_support"
  | "platform_finance";

export type AuthSession = {
  user: AuthUser;
  platformRole: PlatformRole | null;
  stores: AuthStore[];
  currentStore: AuthStore | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  stores: AuthStore[];
  currentStore: AuthStore | null;
  platformRole: PlatformRole | null;
  actor: Actor | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
    options?: { redirect?: boolean },
  ) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function actorFromSession(session: AuthSession | null): Actor | null {
  if (!session?.currentStore) return null;
  return {
    id: session.user.id,
    storeId: session.currentStore.id,
    name: session.user.name,
    email: session.user.email,
    role: session.currentStore.role,
    isDevelopmentFallback: false,
  };
}

async function fetchJson<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // Ignore non-JSON errors; status details are still included below.
    }
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error?: unknown }).error)
        : `HTTP ${response.status} ${response.statusText}`;
    throw Object.assign(new Error(message), { status: response.status, data });
  }

  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

function getErrorMessage(error: unknown): string {
  const data =
    error && typeof error === "object" && "data" in error
      ? (error as { data?: unknown }).data
      : null;
  if (data && typeof data === "object" && "error" in data) {
    const message = (data as { error?: unknown }).error;
    if (typeof message === "string" && message.trim()) return message;
  }

  if (error instanceof Error && error.message.trim()) return error.message;

  return "Não foi possível autenticar. Tente novamente.";
}

export { getErrorMessage as getAuthErrorMessage };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, navigate] = useLocation();

  const updateSession = useCallback((nextSession: AuthSession | null) => {
    setSession(nextSession);
    setCurrentActorFromAuth(actorFromSession(nextSession));
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextSession = await fetchJson<AuthSession>("/api/auth/me");
      updateSession(nextSession);
    } catch {
      updateSession(null);
    } finally {
      setIsLoading(false);
    }
  }, [updateSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string, options = { redirect: true }) => {
      const nextSession = await fetchJson<AuthSession>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      updateSession(nextSession);

      if (options.redirect !== false) {
        if (!nextSession.currentStore) {
          throw new Error("Nenhuma loja vinculada.");
        }
        navigate(defaultPathForRole(nextSession.currentStore.role));
      }

      return nextSession;
    },
    [navigate, updateSession],
  );

  const logout = useCallback(async () => {
    try {
      await fetchJson<null>("/api/auth/logout", { method: "POST" });
    } finally {
      updateSession(null);
      navigate("/login");
    }
  }, [navigate, updateSession]);

  const actor = useMemo(() => actorFromSession(session), [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      stores: session?.stores ?? [],
      currentStore: session?.currentStore ?? null,
      platformRole: session?.platformRole ?? null,
      actor,
      isAuthenticated: Boolean(session),
      isLoading,
      login,
      logout,
      refresh,
    }),
    [actor, isLoading, login, logout, refresh, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context)
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return context;
}
