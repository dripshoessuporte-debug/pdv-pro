import { ReactNode } from "react";
import { Redirect } from "wouter";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const roles = [
  "max_control",
  "atendente",
  "cozinha",
  "motoboy",
] as const;
export type Role = (typeof roles)[number];

export type Actor = {
  id: number | null;
  storeId: number;
  name: string;
  role: Role;
  isDevelopmentFallback: boolean;
};

const roleSet = new Set<string>(roles);

export function getCurrentActor(): Actor {
  const role = roleSet.has(import.meta.env.VITE_RBAC_ROLE)
    ? (import.meta.env.VITE_RBAC_ROLE as Role)
    : "max_control";
  return {
    id: import.meta.env.VITE_RBAC_USER_ID
      ? Number(import.meta.env.VITE_RBAC_USER_ID)
      : null,
    storeId: Number(import.meta.env.VITE_STORE_ID ?? 1),
    name: import.meta.env.VITE_RBAC_NAME ?? "Operador desenvolvimento",
    role,
    isDevelopmentFallback: true,
  };
}

export const routePermissions: Record<Role, string[]> = {
  max_control: [
    "/",
    "/cash",
    "/orders",
    "/orders/new",
    "/tables",
    "/kitchen",
    "/menu",
    "/customers",
    "/routes",
    "/motoboys",
    "/settings",
    "/payments",
  ],
  atendente: [
    "/orders",
    "/orders/new",
    "/tables",
    "/kitchen",
    "/routes",
    "/motoboys",
    "/payments",
  ],
  cozinha: ["/kitchen"],
  motoboy: ["/routes"],
};

export function canAccessPath(role: Role, path: string): boolean {
  return routePermissions[role].some(
    (allowed) =>
      path === allowed || (allowed !== "/" && path.startsWith(`${allowed}/`)),
  );
}

export function defaultPathForRole(role: Role): string {
  if (role === "cozinha") return "/kitchen";
  if (role === "motoboy") return "/routes";
  if (role === "atendente") return "/orders";
  return "/";
}

export function UnauthorizedMessage() {
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-100">
          <AlertTriangle className="h-5 w-5" />
          Acesso não autorizado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>Você não tem permissão para acessar esta área.</p>
        <p>Abra o caixa para iniciar seu plantão.</p>
      </CardContent>
    </Card>
  );
}

export function ProtectedRoute({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const actor = getCurrentActor();
  if (!canAccessPath(actor.role, path)) {
    return <Redirect to={defaultPathForRole(actor.role)} />;
  }
  return <>{children}</>;
}
