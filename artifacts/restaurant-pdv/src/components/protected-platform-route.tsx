import { type ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

const allowedPlatformRoles = new Set([
  "platform_owner",
  "platform_admin",
  "platform_support",
]);

export function ProtectedPlatformRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, platformRole } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        Carregando sessão administrativa...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Redirect to={`/admin-max/login?next=${encodeURIComponent(location)}`} />
    );
  }

  if (!platformRole || !allowedPlatformRoles.has(platformRole)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/10 p-8 text-center shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-300">
            403
          </p>
          <h1 className="mt-3 text-2xl font-bold">
            Acesso administrativo negado
          </h1>
          <p className="mt-3 text-sm text-slate-300">
            Este usuário não possui acesso administrativo ao Admin Max.
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
