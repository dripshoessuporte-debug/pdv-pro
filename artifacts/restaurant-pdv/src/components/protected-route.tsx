import { type ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { canAccessPath, defaultPathForRole } from "@/lib/rbac";

export function ProtectedRoute({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const { actor, isAuthenticated, isLoading, platformRole } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Carregando sessão...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  if (platformRole && !actor) {
    return <Redirect to="/admin-max" />;
  }

  if (!actor) {
    return <Redirect to="/create-store" />;
  }

  if (!canAccessPath(actor.role, path)) {
    return <Redirect to={defaultPathForRole(actor.role)} />;
  }

  return <>{children}</>;
}
