import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Building2,
  CreditCard,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  Store,
  TerminalSquare,
  Trash2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

const menuItems = [
  { href: "/admin-max", label: "Visão geral", icon: LayoutDashboard },
  { href: "/admin-max/stores", label: "Lojas", icon: Building2 },
  { href: "/admin-max/users", label: "Usuários", icon: Users },
  { href: "/admin-max/billing", label: "Cobrança", icon: CreditCard },
  { href: "/admin-max/systems", label: "Sistemas/APIs", icon: TerminalSquare },
  { href: "/admin-max/support", label: "Suporte", icon: ShieldCheck },
  { href: "/admin-max/logs", label: "Logs", icon: ScrollText },
];

function isActiveMenu(pathname: string, href: string) {
  if (href === "/admin-max") return pathname === "/admin-max";
  return pathname.startsWith(href);
}

type PlatformUserStore = {
  memberId: number;
  storeId: number;
  storeName: string;
  storeSlug: string;
  storeStatus: string;
  role: string;
  active: boolean;
  isDefault: boolean;
};

type PlatformUser = {
  id: number;
  name: string;
  email: string;
  status: string;
  createdAt: string | null;
  lastLoginAt: string | null;
  platformRole: string | null;
  platformAdminStatus: string | null;
  entitlementStatus: string | null;
  entitlementPlan: string | null;
  stores: PlatformUserStore[];
  activeStoresCount: number;
  totalStoresCount: number;
  isProtected: boolean;
  canDelete: boolean;
  blockReason: string;
};

async function platformRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const data = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;
  if (!response.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error ?? `HTTP ${response.status}`,
    );
  }
  return data as T;
}

function statusClasses(status?: string | null) {
  const value = String(status ?? "").toLowerCase();
  if (["active", "ativo"].includes(value))
    return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
  if (["trial", "teste", "trialing"].includes(value))
    return "border-amber-400/20 bg-amber-500/10 text-amber-200";
  if (["blocked", "bloqueado", "cancelled", "past_due"].includes(value))
    return "border-red-400/20 bg-red-500/10 text-red-200";
  return "border-slate-400/20 bg-slate-500/10 text-slate-200";
}

function formatDate(date?: string | null) {
  return date ? new Date(date).toLocaleString("pt-BR") : "—";
}

function roleLabel(role?: string | null) {
  const map: Record<string, string> = {
    max_control: "Max Control",
    atendente: "Atendente",
    cozinha: "Cozinha",
    motoboy: "Motoboy",
    platform_owner: "Dono da plataforma",
    platform_admin: "Admin da plataforma",
    platform_support: "Suporte",
    platform_finance: "Financeiro",
  };
  return map[String(role ?? "")] ?? (role ?? "—");
}

function OwnerPanelShell({
  children,
  onRefresh,
  isRefreshing,
}: {
  children: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const { platformRole, user, logout } = useAuth();
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(239,68,68,0.16),_transparent_30%),linear-gradient(135deg,_#020617_0%,_#0f172a_50%,_#111827_100%)] text-white">
      <aside className="fixed inset-y-0 left-0 hidden w-80 border-r border-white/10 bg-slate-950/90 p-5 shadow-2xl shadow-black/30 backdrop-blur xl:block">
        <div className="flex h-full flex-col">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <img
              src="/brand/gestor-max-logo.png"
              alt="Gestor Max"
              className="h-12 w-auto object-contain"
            />
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3">
              <p className="text-sm font-bold text-white">Painel Dono</p>
              <p className="text-xs font-medium text-red-100/80">
                Administração global do Gestor Max
              </p>
            </div>
          </div>

          <nav className="mt-6 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActiveMenu(location, item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <span
                    className={`group flex min-h-11 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                      active
                        ? "border border-red-400/30 bg-red-500/15 text-red-50 shadow-lg shadow-red-950/20"
                        : "text-slate-200 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${active ? "text-red-300" : ""}`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm font-semibold text-white">
              {user?.name ?? "Dono Gestor Max"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {platformRole ?? "platform_owner"}
            </p>
            <Button
              className="mt-4 w-full border-white/10 bg-white/10 text-white hover:bg-white/15"
              variant="outline"
              size="sm"
              onClick={logout}
            >
              Sair
            </Button>
          </div>
        </div>
      </aside>

      <div className="xl:pl-80">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 px-5 py-5 backdrop-blur lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-200/80">
                Painel Dono
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
                Usuários da Plataforma
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Todos os usuários do Gestor Max, incluindo equipe das lojas,
                donos, administradores e usuários sem loja ativa.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {onRefresh && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                  />
                  Atualizar
                </Button>
              )}
              <Badge className="border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/10">
                {platformRole}
              </Badge>
            </div>
          </div>
        </header>
        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function AdminMaxUsersPage() {
  const { platformRole } = useAuth();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    platformRequest<{ users: PlatformUser[] }>("/api/platform/users")
      .then((data) => setUsers(data.users))
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar usuários.",
        ),
      )
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      total: users.length,
      withActiveStore: users.filter((u) => u.activeStoresCount > 0).length,
      withoutActiveStore: users.filter((u) => u.activeStoresCount === 0).length,
      platformAdmins: users.filter((u) => u.platformRole).length,
      withSubscription: users.filter((u) => u.entitlementStatus).length,
      withoutSubscription: users.filter((u) => !u.entitlementStatus).length,
      deletable: users.filter((u) => u.canDelete).length,
    }),
    [users],
  );

  const rows = users
    .filter((user) => {
      const haystack = [
        user.name,
        user.email,
        user.status,
        user.platformRole ?? "",
        user.entitlementPlan ?? "",
        user.entitlementStatus ?? "",
        ...user.stores.flatMap((store) => [
          store.storeName,
          store.storeSlug,
          store.role,
          store.storeStatus,
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query.toLowerCase());
    })
    .filter((user) => {
      if (filter === "all") return true;
      if (filter === "active-store") return user.activeStoresCount > 0;
      if (filter === "orphan") return user.activeStoresCount === 0;
      if (filter === "platform") return Boolean(user.platformRole);
      if (filter === "with-subscription") return Boolean(user.entitlementStatus);
      if (filter === "without-subscription") return !user.entitlementStatus;
      if (filter === "deletable") return user.canDelete;
      return true;
    });

  async function deleteUser(user: PlatformUser) {
    if (!user.canDelete || platformRole !== "platform_owner") {
      window.alert(user.blockReason);
      return;
    }
    const confirmation = window.prompt(
      `Digite EXCLUIR para excluir definitivamente ${user.email}.`,
    );
    if (confirmation !== "EXCLUIR") return;
    try {
      await platformRequest(`/api/platform/orphan-users/${user.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation }),
      });
      window.alert("Usuário excluído.");
      load();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Não foi possível excluir usuário.",
      );
    }
  }

  const stats = [
    ["Total", counts.total, "Usuários cadastrados"],
    ["Com loja ativa", counts.withActiveStore, "Equipe/donos vinculados"],
    ["Sem loja ativa", counts.withoutActiveStore, "Cadastros órfãos"],
    ["Admins plataforma", counts.platformAdmins, "Acesso ao Painel Dono"],
    ["Com assinatura", counts.withSubscription, "Entitlements ativos ou históricos"],
    ["Deletáveis", counts.deletable, "Sem loja ativa e sem vínculo crítico"],
  ];

  return (
    <OwnerPanelShell onRefresh={load} isRefreshing={isLoading}>
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {stats.map(([label, value, description]) => (
          <Card key={label} className="border-white/10 bg-white/[0.04] text-white">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {label}
              </p>
              <p className="mt-2 text-3xl font-black">
                {isLoading ? "—" : value}
              </p>
              <p className="mt-1 text-xs text-slate-500">{description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 pl-11 pr-4 text-white outline-none placeholder:text-slate-500 focus:border-red-300/40"
              placeholder="Buscar por nome, e-mail, loja, função, plano ou status"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="h-12 rounded-2xl border border-white/10 bg-slate-900 px-4 text-white outline-none focus:border-red-300/40"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">Todos</option>
            <option value="active-store">Com loja ativa</option>
            <option value="orphan">Sem loja ativa</option>
            <option value="platform">Admins da plataforma</option>
            <option value="with-subscription">Com assinatura</option>
            <option value="without-subscription">Sem assinatura</option>
            <option value="deletable">Deletáveis</option>
          </select>
        </div>
      </section>

      <Card className="mt-6 overflow-hidden border-white/10 bg-white/[0.04] text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-red-200" />
            Usuários encontrados
            <Badge className="bg-white/10 text-slate-200 hover:bg-white/10">
              {rows.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-5 py-3">Usuário</th>
                  <th className="px-5 py-3">Lojas e funções</th>
                  <th className="px-5 py-3">Assinatura</th>
                  <th className="px-5 py-3">Perfil plataforma</th>
                  <th className="px-5 py-3">Último login</th>
                  <th className="px-5 py-3">Proteção</th>
                  <th className="px-5 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {isLoading ? (
                  <tr>
                    <td className="px-5 py-8 text-center text-slate-400" colSpan={7}>
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                      Carregando usuários...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="px-5 py-8 text-center text-slate-400" colSpan={7}>
                      Nenhum usuário encontrado para este filtro.
                    </td>
                  </tr>
                ) : (
                  rows.map((user) => (
                    <tr key={user.id} className="align-top text-slate-100">
                      <td className="px-5 py-4">
                        <div className="font-semibold">{user.name}</div>
                        <div className="text-xs text-slate-400">{user.email}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge className={statusClasses(user.status)}>
                            {user.status}
                          </Badge>
                          <Badge className="bg-slate-500/10 text-slate-200 hover:bg-slate-500/10">
                            #{user.id}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {user.stores.length === 0 ? (
                          <Badge className="border-amber-400/20 bg-amber-500/10 text-amber-200 hover:bg-amber-500/10">
                            Sem loja ativa
                          </Badge>
                        ) : (
                          <div className="space-y-2">
                            {user.stores.map((store) => (
                              <div
                                key={`${user.id}-${store.memberId}`}
                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <Store className="h-3.5 w-3.5 text-red-200" />
                                  <span className="font-semibold">
                                    {store.storeName}
                                  </span>
                                  <Badge className={statusClasses(store.storeStatus)}>
                                    {store.storeStatus}
                                  </Badge>
                                  {store.isDefault && (
                                    <Badge className="bg-blue-500/10 text-blue-200 hover:bg-blue-500/10">
                                      padrão
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-1 text-xs text-slate-400">
                                  {roleLabel(store.role)} · {store.active ? "ativo" : "inativo"} · #{store.storeId}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div>{user.entitlementPlan ?? "—"}</div>
                        <Badge className={statusClasses(user.entitlementStatus)}>
                          {user.entitlementStatus ?? "sem assinatura"}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        {user.platformRole ? (
                          <div className="space-y-1">
                            <Badge className="border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/10">
                              {roleLabel(user.platformRole)}
                            </Badge>
                            <div className="text-xs text-slate-400">
                              {user.platformAdminStatus ?? "—"}
                            </div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div>{formatDate(user.lastLoginAt)}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Criado em {formatDate(user.createdAt)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          className={
                            user.canDelete
                              ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/10"
                              : "border-slate-400/20 bg-slate-500/10 text-slate-200 hover:bg-slate-500/10"
                          }
                        >
                          {user.canDelete ? "deletável" : "protegido"}
                        </Badge>
                        <div className="mt-2 text-xs text-slate-400">
                          {user.blockReason}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {user.canDelete && platformRole === "platform_owner" ? (
                          <Button
                            size="sm"
                            className="bg-red-700 hover:bg-red-800"
                            onClick={() => void deleteUser(user)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => window.alert(user.blockReason)}
                          >
                            Ver motivo
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </OwnerPanelShell>
  );
}
