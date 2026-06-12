import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCurrentActorQueryKey } from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { roles, type Role } from "@/lib/rbac";

const ROLE_STORAGE_KEY = "gestor-max-dev-role";
const NAME_STORAGE_KEY = "gestor-max-dev-name";
const STORE_ID_STORAGE_KEY = "gestor-max-dev-store-id";
const DEFAULT_STORE_ID = "1";

const devRoleProfiles: Record<Role, { label: string; name: string }> = {
  max_control: { label: "Max Control", name: "Administrador" },
  atendente: { label: "Atendente", name: "Atendente teste" },
  cozinha: { label: "Cozinha", name: "Cozinha teste" },
  motoboy: { label: "Motoboy", name: "Motoboy teste" },
};

const roleSet = new Set<string>(roles);

function canShowDevRoleSwitcher(): boolean {
  if (import.meta.env.PROD) return false;
  if (import.meta.env.VITE_ALLOW_DEV_RBAC_HEADERS === "false") return false;

  return (
    import.meta.env.DEV === true ||
    import.meta.env.VITE_ENABLE_DEV_ROLE_SWITCHER === "true"
  );
}

function readStoredRole(): Role {
  if (typeof window === "undefined") return "max_control";

  const storedRole = window.localStorage.getItem(ROLE_STORAGE_KEY);
  if (storedRole && roleSet.has(storedRole)) return storedRole as Role;

  const envRole = import.meta.env.VITE_RBAC_ROLE;
  return roleSet.has(envRole) ? (envRole as Role) : "max_control";
}

function readStoreId(): string {
  if (typeof window === "undefined") return DEFAULT_STORE_ID;

  return (
    window.localStorage.getItem(STORE_ID_STORAGE_KEY) ??
    import.meta.env.VITE_STORE_ID ??
    DEFAULT_STORE_ID
  );
}

export function DevRoleSwitcher() {
  const isEnabled = canShowDevRoleSwitcher();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [currentRole, setCurrentRole] = useState<Role>(() => readStoredRole());
  const [storeId, setStoreId] = useState<string>(() => readStoreId());

  const currentProfile = useMemo(
    () => devRoleProfiles[currentRole],
    [currentRole],
  );

  if (!isEnabled) return null;

  function handleRoleChange(nextRole: Role) {
    const nextProfile = devRoleProfiles[nextRole];
    const nextStoreId = storeId || DEFAULT_STORE_ID;

    window.localStorage.setItem(ROLE_STORAGE_KEY, nextRole);
    window.localStorage.setItem(NAME_STORAGE_KEY, nextProfile.name);
    window.localStorage.setItem(STORE_ID_STORAGE_KEY, nextStoreId);

    setCurrentRole(nextRole);
    setStoreId(nextStoreId);

    queryClient.invalidateQueries({ queryKey: getGetCurrentActorQueryKey() });
    queryClient.invalidateQueries();

    toast({ title: `Perfil de teste alterado para ${nextProfile.label}.` });

    window.setTimeout(() => {
      window.location.reload();
    }, 350);
  }

  return (
    <div className="mx-4 mb-3 rounded-xl border border-sky-400/25 bg-sky-500/10 px-3.5 py-3 text-xs text-sky-50 shadow-sm shadow-sky-950/20">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-wide text-sky-200">
          Modo teste
        </span>
        <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] font-semibold text-sky-100 ring-1 ring-sky-300/20">
          DEV
        </span>
      </div>

      <Select
        value={currentRole}
        onValueChange={(value) => handleRoleChange(value as Role)}
      >
        <SelectTrigger className="h-8 border-sky-300/25 bg-slate-950/30 text-xs text-white focus:ring-sky-300/40">
          <SelectValue aria-label={currentProfile.label} />
        </SelectTrigger>
        <SelectContent>
          {roles.map((role) => (
            <SelectItem key={role} value={role}>
              {devRoleProfiles[role].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="mt-2 space-y-1 text-[11px] text-sky-100/85">
        <p>Perfil: {currentProfile.label}</p>
        <p>Loja: {storeId || DEFAULT_STORE_ID}</p>
      </div>
    </div>
  );
}
