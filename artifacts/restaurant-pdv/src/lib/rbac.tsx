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
  email?: string;
  role: Role;
  isDevelopmentFallback: boolean;
};

const roleSet = new Set<string>(roles);
const DEV_ROLE_STORAGE_KEY = "gestor-max-dev-role";
const DEV_NAME_STORAGE_KEY = "gestor-max-dev-name";
const DEV_STORE_ID_STORAGE_KEY = "gestor-max-dev-store-id";

let authenticatedActor: Actor | null = null;

export function setCurrentActorFromAuth(actor: Actor | null): void {
  authenticatedActor = actor;
}

function canUseDevRoleSwitcherStorage(): boolean {
  if (import.meta.env.PROD) return false;
  if (import.meta.env.VITE_ALLOW_DEV_RBAC_HEADERS === "false") return false;

  return (
    import.meta.env.DEV === true ||
    import.meta.env.VITE_ENABLE_DEV_ROLE_SWITCHER === "true"
  );
}

function readDevStorageValue(key: string): string | null {
  if (!canUseDevRoleSwitcherStorage()) return null;
  if (typeof window === "undefined") return null;

  return window.localStorage.getItem(key);
}

export function getCurrentActor(): Actor {
  if (authenticatedActor) return authenticatedActor;

  const storedRole = readDevStorageValue(DEV_ROLE_STORAGE_KEY);
  const configuredRole = storedRole ?? import.meta.env.VITE_RBAC_ROLE;
  const role = roleSet.has(configuredRole)
    ? (configuredRole as Role)
    : "max_control";

  return {
    id: import.meta.env.VITE_RBAC_USER_ID
      ? Number(import.meta.env.VITE_RBAC_USER_ID)
      : null,
    storeId: Number(
      readDevStorageValue(DEV_STORE_ID_STORAGE_KEY) ??
        import.meta.env.VITE_STORE_ID ??
        1,
    ),
    name:
      readDevStorageValue(DEV_NAME_STORAGE_KEY) ??
      import.meta.env.VITE_RBAC_NAME ??
      "Operador desenvolvimento",
    role,
    isDevelopmentFallback: true,
  };
}

export const routePermissions: Record<Role, string[]> = {
  max_control: [
    "/",
    "/dashboard",
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
    "/team",
    "/onboarding",
  ],
  atendente: [
    "/cash",
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
  return "/dashboard";
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
