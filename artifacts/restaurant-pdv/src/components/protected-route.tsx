import { type ReactNode, useEffect, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { hasStoreCreationAccess, useAuth } from "@/lib/auth";
import { canAccessPath, defaultPathForRole } from "@/lib/rbac";
import { getOnboardingStatus } from "@/pages/onboarding";

const onboardingAllowedPaths = new Set(["/onboarding", "/settings", "/team"]);

export function ProtectedRoute({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const { actor, entitlement, isAuthenticated, isLoading, platformRole } = useAuth();
  const [location] = useLocation();
  const [mustOnboard, setMustOnboard] = useState(false);
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!actor || actor.role !== "max_control" || onboardingAllowedPaths.has(path)) {
      setMustOnboard(false);
      setIsCheckingOnboarding(false);
      return;
    }

    setIsCheckingOnboarding(true);
    getOnboardingStatus()
      .then((status) => {
        if (!cancelled) setMustOnboard(status.applies && !status.completed);
      })
      .catch(() => {
        if (!cancelled) setMustOnboard(false);
      })
      .finally(() => {
        if (!cancelled) setIsCheckingOnboarding(false);
      });

    return () => {
      cancelled = true;
    };
  }, [actor, path]);

  if (isLoading || isCheckingOnboarding) {
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
    return <Redirect to={hasStoreCreationAccess(entitlement) ? "/create-store" : "/plans"} />;
  }

  if (!canAccessPath(actor.role, path)) {
    return <Redirect to={defaultPathForRole(actor.role)} />;
  }

  if (mustOnboard) {
    return <Redirect to="/onboarding" />;
  }

  return <>{children}</>;
}
