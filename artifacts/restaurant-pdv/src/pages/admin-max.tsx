import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Store,
  TerminalSquare,
  ScrollText,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

type Overview = {
  totalStores: number;
  activeStores: number;
  totalUsers: number;
  ordersToday: number;
  trialStores: number;
  blockedStores: number;
  pendingAccessRequests?: number;
  failedWebhooks?: number;
  activeSubscriptions?: number;
  blockedSubscriptions?: number;
};

type PlatformStore = {
  id: number;
  name: string;
  slug?: string;
  status: string;
  city: string | null;
  state: string | null;
  createdAt: string;
  membersCount: number;
};

async function fetchPlatformJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

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

function AdminShell({
  children,
  title,
  description,
  onRefresh,
  isRefreshing = false,
}: {
  children: ReactNode;
  title: string;
  description: string;
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
              <p className="text-sm font-bold text-white">Admin Max</p>
              <p className="text-xs font-medium text-red-100/80">
                Painel da plataforma
              </p>
            </div>
          </div>

          <nav className="mt-6 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActiveMenu(location, item.href);
              const classes = `group flex min-h-11 items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                active
                  ? "border border-red-400/30 bg-red-500/15 text-red-50 shadow-lg shadow-red-950/20"
                  : "text-slate-200 hover:bg-white/10 hover:text-white"
              }`;
              const content = (
                <span className={classes}>
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${active ? "text-red-300" : ""}`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                </span>
              );
              return (
                <Link key={item.href} href={item.href}>
                  {content}
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
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                {title}
              </h1>
              <p className="mt-1 text-sm text-slate-400">{description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
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
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2">
                <p className="font-semibold text-white">
                  {user?.name ?? "Dono Gestor Max"}
                </p>
                <p className="text-xs text-slate-400">{user?.email}</p>
              </div>
              <Badge className="border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/10">
                {platformRole}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                className="border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                Sair
              </Button>
            </div>
          </div>
        </header>
        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function formatDate(date?: string | null) {
  return date ? new Date(date).toLocaleDateString("pt-BR") : "—";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function platformRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
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
    if (import.meta.env.DEV)
      console.error("[Admin Max] platform request failed", {
        status: response.status,
        body: data,
      });
    throw new Error(
      (data as { error?: string } | null)?.error ?? `HTTP ${response.status}`,
    );
  }
  return data as T;
}

function notify(message: string) {
  window.alert(message);
}

function statusClasses(status: string) {
  if (["active", "ativo"].includes(status.toLowerCase()))
    return "bg-emerald-500/10 text-emerald-200 border-emerald-400/20";
  if (["trial", "teste", "trialing"].includes(status.toLowerCase()))
    return "bg-amber-500/10 text-amber-200 border-amber-400/20";
  if (["blocked", "bloqueado"].includes(status.toLowerCase()))
    return "bg-red-500/10 text-red-200 border-red-400/20";
  return "bg-slate-500/10 text-slate-200 border-slate-400/20";
}

export function AdminMaxDashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [stores, setStores] = useState<PlatformStore[]>([]);
  const [health, setHealth] = useState<Record<string, boolean | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadDashboard = useCallback(async (refreshing = false) => {
    refreshing ? setIsRefreshing(true) : setIsLoading(true);
    setError(null);
    const [
      overviewResult,
      storesResult,
      billingResult,
      requestsResult,
      webhooksResult,
    ] = await Promise.allSettled([
      fetchPlatformJson<Overview>("/api/platform/overview"),
      fetchPlatformJson<{ stores: PlatformStore[] }>("/api/platform/stores"),
      fetchPlatformJson<{ entitlements: PlatformEntitlement[] }>(
        "/api/platform/entitlements",
      ),
      fetchPlatformJson<{ requests: AccessRequest[] }>(
        "/api/platform/access-requests",
      ),
      fetchPlatformJson<{ webhooks: BillingWebhook[] }>(
        "/api/platform/billing/webhooks",
      ),
    ]);
    if (overviewResult.status === "fulfilled")
      setOverview(overviewResult.value);
    else setError("Não foi possível carregar todos os indicadores.");
    if (storesResult.status === "fulfilled")
      setStores(storesResult.value.stores.slice(0, 5));
    setHealth({
      api: overviewResult.status === "fulfilled",
      db: overviewResult.status === "fulfilled",
      billing: billingResult.status === "fulfilled",
      requests: requestsResult.status === "fulfilled",
      webhooks: webhooksResult.status === "fulfilled",
    });
    setIsLoading(false);
    setIsRefreshing(false);
  }, []);
  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const metricCards = [
    [
      "Total de lojas",
      overview?.totalStores,
      "Clientes cadastrados",
      Store,
      "text-sky-200 bg-sky-500/10 border-sky-400/20",
    ],
    [
      "Lojas ativas",
      overview?.activeStores,
      "Liberadas para operar",
      CheckCircle2,
      "text-emerald-200 bg-emerald-500/10 border-emerald-400/20",
    ],
    [
      "Lojas bloqueadas",
      overview?.blockedStores,
      "Acesso pausado",
      AlertTriangle,
      "text-red-200 bg-red-500/10 border-red-400/20",
    ],
    [
      "Lojas em teste",
      overview?.trialStores,
      "Contas em avaliação",
      Clock3,
      "text-amber-200 bg-amber-500/10 border-amber-400/20",
    ],
    [
      "Usuários cadastrados",
      overview?.totalUsers,
      "Usuários globais",
      Users,
      "text-violet-200 bg-violet-500/10 border-violet-400/20",
    ],
    [
      "Pedidos hoje",
      overview?.ordersToday,
      "Movimento do dia",
      Activity,
      "text-orange-200 bg-orange-500/10 border-orange-400/20",
    ],
    [
      "Solicitações pendentes",
      overview?.pendingAccessRequests,
      "Aguardando análise",
      CreditCard,
      "text-cyan-200 bg-cyan-500/10 border-cyan-400/20",
    ],
    [
      "Webhooks com erro",
      overview?.failedWebhooks,
      "Falhas de processamento",
      AlertTriangle,
      "text-rose-200 bg-rose-500/10 border-rose-400/20",
    ],
    [
      "Assinaturas ativas",
      overview?.activeSubscriptions,
      "Clientes pagantes",
      CheckCircle2,
      "text-emerald-200 bg-emerald-500/10 border-emerald-400/20",
    ],
    [
      "Assinaturas bloqueadas/canceladas",
      overview?.blockedSubscriptions,
      "Atenção comercial",
      AlertTriangle,
      "text-red-200 bg-red-500/10 border-red-400/20",
    ],
  ] as const;
  const statusItems = [
    ["API online", health.api],
    ["Banco conectado", health.db],
    ["Billing/Cakto", health.billing],
    ["Solicitações de acesso", health.requests],
    ["Webhooks", health.webhooks],
  ] as const;

  return (
    <AdminShell
      title="Visão geral"
      description="Controle central da operação multi-loja do Gestor Max"
      onRefresh={() => void loadDashboard(true)}
      isRefreshing={isRefreshing}
    >
      {error && (
        <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}
      <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-black/20 md:p-8">
        <Badge className="mb-4 border-red-400/30 bg-red-500/10 text-red-100">
          <Sparkles className="mr-1 h-3 w-3" /> Centro administrativo
        </Badge>
        <h2 className="text-3xl font-bold">Central de Controle Gestor Max</h2>
        <p className="mt-3 text-slate-300">
          Opere lojas, usuários, cobrança, webhooks e solicitações em um painel
          P0 limpo.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/admin-max/stores">
            <Button className="bg-red-600 text-white hover:bg-red-700">
              Ver lojas <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="/admin-max/billing">
            <Button
              variant="outline"
              className="border-white/10 bg-white/5 text-white"
            >
              Ver cobrança
            </Button>
          </Link>
          <Link href="/admin-max/billing">
            <Button
              variant="outline"
              className="border-white/10 bg-white/5 text-white"
            >
              Ver solicitações de acesso
            </Button>
          </Link>
        </div>
      </section>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metricCards.map(([title, value, description, Icon, tone]) => (
          <Card
            key={title}
            className="border-white/10 bg-white/[0.04] text-white"
          >
            <CardContent className="p-5">
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-300">{title}</p>
                  <div className="mt-3 text-3xl font-bold">
                    {isLoading ? "—" : (value ?? 0)}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{description}</p>
                </div>
                <div className={`h-fit rounded-2xl border p-3 ${tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden border-white/10 bg-white/[0.04] text-white">
          <CardHeader>
            <CardTitle>Lojas recentes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-white/[0.03] text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Nome</th>
                    <th className="px-5 py-3">Slug</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Criada em</th>
                    <th className="px-5 py-3">Usuários</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {stores.map((store) => (
                    <tr key={store.id}>
                      <td className="px-5 py-4 font-semibold">{store.name}</td>
                      <td className="px-5 py-4 text-slate-300">
                        {store.slug ?? "—"}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs ${statusClasses(store.status)}`}
                        >
                          {store.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {formatDate(store.createdAt)}
                      </td>
                      <td className="px-5 py-4">{store.membersCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.04] text-white">
          <CardHeader>
            <CardTitle>Status da plataforma</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {statusItems.map(([label, ok]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <span>{label}</span>
                <Badge
                  className={
                    ok === true
                      ? "bg-emerald-500/10 text-emerald-200"
                      : ok === false
                        ? "bg-red-500/10 text-red-200"
                        : "bg-slate-500/10 text-slate-200"
                  }
                >
                  {ok === true
                    ? "Online"
                    : ok === false
                      ? "Indisponível"
                      : "Carregando"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </AdminShell>
  );
}

type StoreDetails = {
  store: PlatformStore;
  members: Array<{
    id: number;
    userId: number;
    name: string;
    email: string;
    role: string;
    active: boolean;
    entitlementPlan: string | null;
    entitlementStatus: string | null;
  }>;
  entitlement: {
    plan: string | null;
    status: string | null;
    userId: number;
  } | null;
  todayOrders: number;
  todayRevenue: number;
};

export function AdminMaxStoresPage() {
  const { platformRole } = useAuth();
  const [stores, setStores] = useState<PlatformStore[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [details, setDetails] = useState<StoreDetails | null>(null);
  const loadStores = useCallback(() => {
    setIsLoading(true);
    setError(null);
    fetchPlatformJson<{ stores: PlatformStore[] }>("/api/platform/stores")
      .then((d) => setStores(d.stores))
      .catch((e) =>
        setError(getErrorMessage(e, "Não foi possível carregar as lojas.")),
      )
      .finally(() => setIsLoading(false));
  }, []);
  useEffect(() => {
    loadStores();
  }, [loadStores]);
  const filtered = stores.filter(
    (s) =>
      (status === "all" || s.status === status) &&
      `${s.id} ${s.name} ${s.slug ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const counts = stores.reduce<Record<string, number>>(
    (a, s) => ({ ...a, [s.status]: (a[s.status] ?? 0) + 1 }),
    {},
  );
  async function updateStoreStatus(storeId: number, next: string) {
    if (
      !["active"].includes(next) &&
      !window.confirm(`Confirmar alteração da loja #${storeId} para ${next}?`)
    )
      return;
    try {
      await platformRequest(`/api/platform/stores/${storeId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      notify("Status da loja atualizado.");
      loadStores();
    } catch (e) {
      setError(getErrorMessage(e, "Não foi possível atualizar."));
    }
  }
  async function openDetails(storeId: number) {
    try {
      setDetails(
        await fetchPlatformJson<StoreDetails>(
          `/api/platform/stores/${storeId}`,
        ),
      );
    } catch (e) {
      setError(getErrorMessage(e, "Não foi possível carregar detalhes."));
    }
  }
  async function startSupport(
    storeId: number,
    mode: "read_only" | "full_access",
  ) {
    const reason = window.prompt(
      "Informe o motivo obrigatório do Modo Suporte:",
    );
    if (!reason?.trim()) return;
    try {
      const result = await platformRequest<{ redirectTo: string }>(
        "/api/platform/support/sessions",
        {
          method: "POST",
          body: JSON.stringify({ storeId, mode, reason }),
        },
      );
      window.location.href = result.redirectTo || "/dashboard";
    } catch (e) {
      setError(getErrorMessage(e, "Não foi possível iniciar suporte."));
    }
  }
  async function deleteStore(storeId: number) {
    const confirmation = window.prompt(
      "Digite EXCLUIR para confirmar a exclusão definitiva.",
    );
    if (confirmation !== "EXCLUIR") return;
    try {
      await platformRequest(`/api/platform/stores/${storeId}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation }),
      });
      notify("Loja excluída.");
      loadStores();
    } catch (e) {
      setError(getErrorMessage(e, "Não foi possível excluir a loja."));
    }
  }
  return (
    <AdminShell
      title="Lojas"
      description="Clientes e lojas cadastradas na plataforma."
      onRefresh={loadStores}
      isRefreshing={isLoading}
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
        <input
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
          placeholder="Buscar por nome, slug ou ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">Todas</option>
          <option value="active">active</option>
          <option value="trial">trial</option>
          <option value="blocked">blocked</option>
          <option value="archived">archived</option>
        </select>
      </div>
      <div className="mb-4 flex flex-wrap gap-2 text-xs text-slate-300">
        {["active", "trial", "blocked", "archived"].map((s) => (
          <Badge key={s} className="bg-white/10 text-slate-200">
            {s}: {counts[s] ?? 0}
          </Badge>
        ))}
      </div>
      <DataTable
        empty="Nenhuma loja encontrada."
        loading={isLoading}
        headers={[
          "ID",
          "Nome",
          "Slug",
          "Status",
          "Criada em",
          "Usuários",
          "Ações",
        ]}
      >
        {filtered.map((store) => (
          <tr key={store.id} className="text-slate-100">
            <td className="px-4 py-3">#{store.id}</td>
            <td className="px-4 py-3 font-medium">{store.name}</td>
            <td className="px-4 py-3">{store.slug ?? "—"}</td>
            <td className="px-4 py-3">
              <span
                className={`rounded-full border px-2 py-1 text-xs ${statusClasses(store.status)}`}
              >
                {store.status}
              </span>
            </td>
            <td className="px-4 py-3">{formatDate(store.createdAt)}</td>
            <td className="px-4 py-3">{store.membersCount}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void openDetails(store.id)}
                >
                  Ver detalhes
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void startSupport(store.id, "read_only")}
                >
                  Suporte — Visualizar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void startSupport(store.id, "full_access")}
                >
                  Suporte — Editar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void updateStoreStatus(store.id, "blocked")}
                >
                  Bloquear
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void updateStoreStatus(store.id, "active")}
                >
                  Reativar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void updateStoreStatus(store.id, "archived")}
                >
                  Arquivar
                </Button>
                {platformRole === "platform_owner" && (
                  <Button
                    className="bg-red-700 hover:bg-red-800"
                    size="sm"
                    onClick={() => void deleteStore(store.id)}
                  >
                    Excluir definitivamente
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
      {details && (
        <Modal
          title={`Detalhes da loja #${details.store.id}`}
          onClose={() => setDetails(null)}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Info label="Nome" value={details.store.name} />
            <Info label="Slug" value={details.store.slug ?? "—"} />
            <Info label="Status" value={details.store.status} />
            <Info
              label="Criada em"
              value={formatDate(details.store.createdAt)}
            />
            <Info label="Usuários" value={String(details.members.length)} />
            <Info
              label="Pedidos hoje"
              value={String(details.todayOrders ?? 0)}
            />
            <Info
              label="Faturamento hoje"
              value={(details.todayRevenue ?? 0).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            />
            <Info
              label="Plano do dono"
              value={`${details.entitlement?.plan ?? "—"} / ${details.entitlement?.status ?? "—"}`}
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => void startSupport(details.store.id, "read_only")}
            >
              Entrar em suporte — Visualizar
            </Button>
            <Button
              size="sm"
              onClick={() => void startSupport(details.store.id, "full_access")}
            >
              Entrar em suporte — Editar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigator.clipboard?.writeText(String(details.store.id))
              }
            >
              Copiar ID
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigator.clipboard?.writeText(details.store.slug ?? "")
              }
            >
              Copiar slug
            </Button>
          </div>
          <h3 className="mt-5 font-semibold">Usuários vinculados</h3>
          <div className="mt-2 space-y-2">
            {details.members.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-white/10 p-3 text-sm"
              >
                {m.name} · {m.email} · {m.role} ·{" "}
                {m.active ? "ativo" : "inativo"}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </AdminShell>
  );
}

type PlatformUserStore = {
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
  createdAt: string;
  lastLoginAt: string | null;
  platformRole: string | null;
  entitlementStatus: string | null;
  entitlementPlan: string | null;
  stores: PlatformUserStore[];
  activeStoresCount: number;
  totalStoresCount: number;
  isProtected: boolean;
  canDelete: boolean;
  blockReason: string | null;
};

const userTabs = [
  { value: "all", label: "Todos" },
  { value: "active-store", label: "Com loja ativa" },
  { value: "orphan", label: "Sem loja ativa" },
  { value: "platform-admins", label: "Platform admins" },
  { value: "with-subscription", label: "Com assinatura" },
  { value: "without-subscription", label: "Sem assinatura" },
  { value: "deletable", label: "Deletáveis" },
];

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function platformUserMatchesTab(user: PlatformUser, tab: string) {
  if (tab === "active-store") return user.activeStoresCount > 0;
  if (tab === "orphan") return user.activeStoresCount === 0;
  if (tab === "platform-admins") return Boolean(user.platformRole);
  if (tab === "with-subscription") return Boolean(user.entitlementStatus);
  if (tab === "without-subscription") return !user.entitlementStatus;
  if (tab === "deletable") return user.canDelete;
  return true;
}

export function AdminMaxUsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    fetchPlatformJson<{ users: PlatformUser[] }>("/api/platform/users")
      .then((d) => setUsers(d.users))
      .catch((e) =>
        setError(
          getErrorMessage(
            e,
            "Não foi possível carregar os usuários globais da plataforma.",
          ),
        ),
      )
      .finally(() => setIsLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const rows = users
    .filter((u) => platformUserMatchesTab(u, tab))
    .filter((u) => {
      const term = query.trim().toLowerCase();
      if (!term) return true;
      return [
        u.name,
        u.email,
        u.status,
        u.platformRole ?? "",
        u.entitlementPlan ?? "",
        u.entitlementStatus ?? "",
        ...u.stores.flatMap((store) => [
          store.storeName,
          store.storeSlug,
          store.storeStatus,
          store.role,
        ]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });

  async function deleteUser(user: PlatformUser) {
    if (!user.canDelete) {
      notify(user.blockReason ?? "Usuário não pode ser excluído.");
      return;
    }
    const confirmation = window.prompt(
      `Digite EXCLUIR para confirmar a exclusão definitiva de ${user.email}.`,
    );
    if (confirmation !== "EXCLUIR") return;
    try {
      await platformRequest(`/api/platform/orphan-users/${user.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation }),
      });
      notify("Usuário excluído.");
      load();
    } catch (e) {
      setError(getErrorMessage(e, "Não foi possível excluir o usuário."));
    }
  }

  return (
    <AdminShell
      title="Usuários da Plataforma"
      description="Visão global de todos os usuários, lojas vinculadas, perfis, assinaturas e proteções do Painel Dono. A aba Sem loja ativa continua usando a mesma regra de usuários órfãos."
      onRefresh={load}
      isRefreshing={isLoading}
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500"
          placeholder="Buscar por nome, e-mail, loja, função, plano ou status"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant="secondary" onClick={load} disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Atualizar
        </Button>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {userTabs.map((item) => (
          <button
            key={item.value}
            className={`rounded-full border px-3 py-2 text-sm transition ${
              tab === item.value
                ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
            onClick={() => setTab(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Total</p>
            <p className="text-2xl font-bold">{users.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Com loja ativa</p>
            <p className="text-2xl font-bold">
              {users.filter((u) => u.activeStoresCount > 0).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Sem loja ativa</p>
            <p className="text-2xl font-bold">
              {users.filter((u) => u.activeStoresCount === 0).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Deletáveis</p>
            <p className="text-2xl font-bold">
              {users.filter((u) => u.canDelete).length}
            </p>
          </CardContent>
        </Card>
      </div>
      {!isLoading && users.length > 0 && rows.length === 0 && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          Nenhum usuário encontrado para esta aba e busca. Ajuste os filtros ou
          atualize os dados.
        </div>
      )}
      <DataTable
        empty="Nenhum usuário da plataforma encontrado."
        loading={isLoading}
        headers={[
          "Nome",
          "E-mail",
          "Status",
          "Lojas",
          "Funções",
          "Assinatura",
          "Último login",
          "Proteção",
          "Ações",
        ]}
      >
        {rows.map((u) => (
          <tr key={u.id}>
            <td className="px-4 py-3 font-medium">{u.name}</td>
            <td className="px-4 py-3">{u.email}</td>
            <td className="px-4 py-3">
              <Badge variant="outline">{u.status}</Badge>
            </td>
            <td className="px-4 py-3">
              <div className="flex max-w-md flex-wrap gap-2">
                {u.stores.length === 0 ? (
                  <span className="text-slate-400">Sem loja vinculada</span>
                ) : (
                  u.stores.map((store) => (
                    <Badge
                      key={`${u.id}-${store.storeId}`}
                      variant="secondary"
                      className="whitespace-normal text-left"
                    >
                      {store.storeName} · {store.role} ·{" "}
                      {store.active ? "ativo" : "inativo"}
                    </Badge>
                  ))
                )}
              </div>
            </td>
            <td className="px-4 py-3 text-slate-300">
              {[u.platformRole, ...u.stores.map((store) => store.role)]
                .filter(Boolean)
                .join(", ") || "—"}
            </td>
            <td className="px-4 py-3">
              {u.entitlementStatus
                ? `${u.entitlementPlan ?? "plano"} · ${u.entitlementStatus}`
                : "Sem assinatura"}
            </td>
            <td className="px-4 py-3 text-slate-300">
              {formatDateTime(u.lastLoginAt)}
            </td>
            <td className="px-4 py-3">
              {u.isProtected ? (
                <Badge className="bg-amber-600">Protegido</Badge>
              ) : (
                <Badge variant="outline">Normal</Badge>
              )}
            </td>
            <td className="px-4 py-3">
              {u.canDelete ? (
                <Button
                  className="bg-red-700"
                  size="sm"
                  onClick={() => void deleteUser(u)}
                >
                  Excluir
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    notify(u.blockReason ?? "Usuário não pode ser excluído.")
                  }
                >
                  Ver motivo
                </Button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </AdminShell>
  );
}

type PlatformEntitlement = {
  userId: number;
  name: string;
  email: string;
  plan: string | null;
  status: string;
  createdAt: string;
  trialEndsAt: string | null;
  provider?: string | null;
  externalOrderId?: string | null;
  externalSubscriptionId?: string | null;
  currentPeriodEnd?: string | null;
};
type BillingWebhook = {
  id: number;
  createdAt: string;
  eventType: string | null;
  paymentStatus?: string | null;
  processingStatus: string;
  email: string | null;
  plan: string | null;
  externalOrderId: string | null;
  externalSubscriptionId: string | null;
  rawPayload: unknown;
  errorMessage: string | null;
};
type AccessRequest = {
  id: number;
  name: string;
  email: string;
  phone: string;
  restaurantName: string;
  requestedPlan: string;
  status: string;
  createdAt: string;
};
type BillingProduct = {
  id: number;
  provider: string;
  plan: string;
  productName: string | null;
  offerName: string | null;
  externalProductId: string | null;
  externalProductShortId: string | null;
  externalOfferId: string | null;
  checkoutUrl: string | null;
  active: boolean;
};

export function AdminMaxBillingPage() {
  const [tab, setTab] = useState("entitlements");
  const [entitlements, setEntitlements] = useState<PlatformEntitlement[]>([]);
  const [webhooks, setWebhooks] = useState<BillingWebhook[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [products, setProducts] = useState<BillingProduct[]>([]);
  const [payload, setPayload] = useState<string | null>(null);
  const [loadingEntitlements, setLoadingEntitlements] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingWebhooks, setLoadingWebhooks] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<
    number | string | null
  >(null);
  const [actionLoadingType, setActionLoadingType] = useState<string | null>(
    null,
  );
  const [errorEntitlements, setErrorEntitlements] = useState<string | null>(
    null,
  );
  const [errorRequests, setErrorRequests] = useState<string | null>(null);
  const [errorWebhooks, setErrorWebhooks] = useState<string | null>(null);
  const [errorProducts, setErrorProducts] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activationLink, setActivationLink] = useState<{
    activationUrl: string;
    name: string;
    email: string;
    plan: string;
    status: string;
  } | null>(null);
  const [productForm, setProductForm] = useState({
    plan: "basico",
    productName: "",
    offerName: "",
    externalProductId: "",
    externalProductShortId: "",
    externalOfferId: "",
    checkoutUrl: "",
    active: true,
  });
  const isLoading =
    loadingEntitlements ||
    loadingRequests ||
    loadingWebhooks ||
    loadingProducts;
  const absoluteActivationUrl = activationLink?.activationUrl?.startsWith(
    "http",
  )
    ? activationLink.activationUrl
    : activationLink
      ? `${window.location.origin}${activationLink.activationUrl.startsWith("/") ? "" : "/"}${activationLink.activationUrl}`
      : "";
  const load = useCallback(() => {
    setLoadingEntitlements(true);
    setLoadingRequests(true);
    setLoadingWebhooks(true);
    setLoadingProducts(true);
    setErrorEntitlements(null);
    setErrorRequests(null);
    setErrorWebhooks(null);
    setErrorProducts(null);
    void fetchPlatformJson<{ entitlements: PlatformEntitlement[] }>(
      "/api/platform/entitlements",
    )
      .then((v) => setEntitlements(v.entitlements))
      .catch((e) =>
        setErrorEntitlements(
          getErrorMessage(e, "Não foi possível carregar acessos."),
        ),
      )
      .finally(() => setLoadingEntitlements(false));
    void fetchPlatformJson<{ requests: AccessRequest[] }>(
      "/api/platform/access-requests",
    )
      .then((v) => setRequests(v.requests))
      .catch((e) =>
        setErrorRequests(
          getErrorMessage(
            e,
            "Não foi possível carregar solicitações de acesso.",
          ),
        ),
      )
      .finally(() => setLoadingRequests(false));
    void fetchPlatformJson<{ webhooks: BillingWebhook[] }>(
      "/api/platform/billing/webhooks",
    )
      .then((v) => setWebhooks(v.webhooks))
      .catch((e) =>
        setErrorWebhooks(
          getErrorMessage(e, "Não foi possível carregar webhooks."),
        ),
      )
      .finally(() => setLoadingWebhooks(false));
    void fetchPlatformJson<{ products: BillingProduct[] }>(
      "/api/platform/billing/products",
    )
      .then((v) => setProducts(v.products))
      .catch((e) =>
        setErrorProducts(
          getErrorMessage(e, "Não foi possível carregar produtos Cakto."),
        ),
      )
      .finally(() => setLoadingProducts(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function run(key: string, fn: () => Promise<unknown>) {
    setActionLoadingId(key);
    setActionLoadingType(key.split("-").pop() ?? key);
    setActionError(null);
    try {
      await fn();
      notify("Ação concluída.");
      load();
    } catch (e) {
      setActionError(
        `Falha ao executar ação: ${getErrorMessage(e, "Ação falhou.")}`,
      );
    } finally {
      setActionLoadingId(null);
      setActionLoadingType(null);
    }
  }
  async function runRequestAction(request: AccessRequest, type: string) {
    const key = `req-${request.id}-${type}`;
    setActionLoadingId(key);
    setActionLoadingType(type);
    setActionError(null);
    try {
      const result = await platformRequest<{
        activationUrl?: string;
        status?: string;
        accessRequestStatus?: string;
      }>(`/api/platform/access-requests/${request.id}/${type}`, {
        method: "POST",
      });
      if (result.activationUrl)
        setActivationLink({
          activationUrl: result.activationUrl,
          name: request.name,
          email: request.email,
          plan: request.requestedPlan,
          status: result.status ?? result.accessRequestStatus ?? "liberado",
        });
      notify(
        type === "reject"
          ? "Solicitação rejeitada."
          : "Acesso liberado e link de ativação gerado.",
      );
      load();
    } catch (e) {
      setActionError(
        `Falha ao executar ação: ${getErrorMessage(e, "Ação falhou.")}`,
      );
    } finally {
      setActionLoadingId(null);
      setActionLoadingType(null);
    }
  }
  const tabs = [
    ["entitlements", "Acessos/Entitlements"],
    ["requests", "Solicitações de acesso"],
    ["webhooks", "Webhooks Cakto"],
    ["products", "Produtos/Planos Cakto"],
  ];
  return (
    <AdminShell
      title="Cobrança"
      description="Gestão operacional de acessos, solicitações, webhooks e produtos Cakto."
      onRefresh={load}
      isRefreshing={isLoading}
    >
      {[
        errorEntitlements,
        errorRequests && "Não foi possível carregar solicitações de acesso.",
        errorWebhooks,
        errorProducts,
        actionError,
      ]
        .filter(Boolean)
        .map((err) => (
          <div
            key={String(err)}
            className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
          >
            {err}
          </div>
        ))}
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <Button
            key={id}
            variant={tab === id ? "default" : "outline"}
            className={
              tab === id
                ? "bg-red-600"
                : "border-white/10 bg-white/5 text-white"
            }
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      {tab === "entitlements" && (
        <DataTable
          loading={loadingEntitlements}
          empty="Nenhum acesso encontrado."
          headers={[
            "Nome",
            "E-mail",
            "Plano",
            "Status",
            "Provider",
            "Pedido externo",
            "Assinatura externa",
            "Período",
            "Ações",
          ]}
        >
          {entitlements.map((i) => (
            <tr key={i.userId}>
              <td className="px-4 py-3 font-medium">{i.name}</td>
              <td className="px-4 py-3">{i.email}</td>
              <td className="px-4 py-3">{i.plan ?? "—"}</td>
              <td className="px-4 py-3">{i.status}</td>
              <td className="px-4 py-3">{i.provider ?? "—"}</td>
              <td className="px-4 py-3">{i.externalOrderId ?? "—"}</td>
              <td className="px-4 py-3">{i.externalSubscriptionId ?? "—"}</td>
              <td className="px-4 py-3">
                {formatDate(i.currentPeriodEnd ?? i.trialEndsAt)}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  {[
                    ["grant-trial", "Liberar teste"],
                    ["activate", "Ativar"],
                    ["block", "Bloquear"],
                    ["cancel", "Cancelar"],
                  ].map(([k, l]) => (
                    <Button
                      key={k}
                      disabled={actionLoadingId === `${i.userId}-${k}`}
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void run(`${i.userId}-${k}`, () =>
                          platformRequest(
                            `/api/platform/entitlements/${i.userId}/${k}`,
                            { method: "POST" },
                          ),
                        )
                      }
                    >
                      {actionLoadingId === `${i.userId}-${k}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        l
                      )}
                    </Button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      {tab === "requests" && (
        <DataTable
          loading={loadingRequests}
          empty="Nenhuma solicitação encontrada."
          headers={[
            "Nome",
            "E-mail",
            "Telefone",
            "Restaurante",
            "Plano",
            "Status",
            "Criada em",
            "Ações",
          ]}
        >
          {requests.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3">{r.name}</td>
              <td className="px-4 py-3">{r.email}</td>
              <td className="px-4 py-3">{r.phone}</td>
              <td className="px-4 py-3">{r.restaurantName}</td>
              <td className="px-4 py-3">{r.requestedPlan}</td>
              <td className="px-4 py-3">{r.status}</td>
              <td className="px-4 py-3">{formatDate(r.createdAt)}</td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  {[
                    ["grant-trial", "Liberar teste"],
                    ["activate", "Ativar"],
                    ["reject", "Rejeitar"],
                  ].map(([k, l]) => (
                    <Button
                      key={k}
                      size="sm"
                      variant="secondary"
                      disabled={actionLoadingId === `req-${r.id}-${k}`}
                      onClick={() => void runRequestAction(r, k)}
                    >
                      {actionLoadingId === `req-${r.id}-${k}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        l
                      )}
                    </Button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      {tab === "webhooks" && (
        <DataTable
          loading={loadingWebhooks}
          empty="Nenhum webhook recebido."
          headers={[
            "Data",
            "Evento",
            "Status",
            "E-mail",
            "Plano",
            "Pedido",
            "Assinatura",
            "Erro",
            "Payload",
          ]}
        >
          {webhooks.map((w) => (
            <tr key={w.id}>
              <td className="px-4 py-3">{formatDate(w.createdAt)}</td>
              <td className="px-4 py-3">{w.eventType ?? "—"}</td>
              <td className="px-4 py-3">{w.processingStatus}</td>
              <td className="px-4 py-3">{w.email ?? "—"}</td>
              <td className="px-4 py-3">{w.plan ?? "—"}</td>
              <td className="px-4 py-3">{w.externalOrderId ?? "—"}</td>
              <td className="px-4 py-3">{w.externalSubscriptionId ?? "—"}</td>
              <td className="px-4 py-3 text-amber-200">
                {w.errorMessage ?? "—"}
              </td>
              <td className="px-4 py-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setPayload(JSON.stringify(w.rawPayload, null, 2))
                  }
                >
                  Ver payload
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      {tab === "products" && (
        <>
          <Card className="mb-4 border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle>Criar produto/plano Cakto</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              {Object.entries(productForm).map(([k, v]) =>
                k === "active" ? (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!v}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          active: e.target.checked,
                        })
                      }
                    />{" "}
                    ativo
                  </label>
                ) : k === "plan" ? (
                  <select
                    key={k}
                    className="rounded-xl bg-slate-900 p-2"
                    value={String(v)}
                    onChange={(e) =>
                      setProductForm({ ...productForm, plan: e.target.value })
                    }
                  >
                    <option>basico</option>
                    <option>medio</option>
                    <option>pro</option>
                  </select>
                ) : (
                  <input
                    key={k}
                    className="rounded-xl border border-white/10 bg-white/5 p-2"
                    placeholder={k}
                    value={String(v)}
                    onChange={(e) =>
                      setProductForm({ ...productForm, [k]: e.target.value })
                    }
                  />
                ),
              )}
              <Button
                className="bg-red-600"
                onClick={() =>
                  void run("product-create", () =>
                    platformRequest("/api/platform/billing/products", {
                      method: "POST",
                      body: JSON.stringify(productForm),
                    }),
                  )
                }
              >
                Criar
              </Button>
            </CardContent>
          </Card>
          <DataTable
            loading={loadingProducts}
            empty="Nenhum produto cadastrado."
            headers={[
              "Provider",
              "Plano",
              "Produto",
              "Offer ID",
              "Product ID",
              "Short ID",
              "Checkout URL",
              "Ativo",
              "Ações",
            ]}
          >
            {products.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">{p.provider}</td>
                <td className="px-4 py-3">{p.plan}</td>
                <td className="px-4 py-3">{p.productName ?? "—"}</td>
                <td className="px-4 py-3">{p.externalOfferId ?? "—"}</td>
                <td className="px-4 py-3">{p.externalProductId ?? "—"}</td>
                <td className="px-4 py-3">{p.externalProductShortId ?? "—"}</td>
                <td className="px-4 py-3 break-all">{p.checkoutUrl ?? "—"}</td>
                <td className="px-4 py-3">{p.active ? "sim" : "não"}</td>
                <td className="px-4 py-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void run(`prod-${p.id}`, () =>
                        platformRequest(
                          `/api/platform/billing/products/${p.id}`,
                          {
                            method: "PATCH",
                            body: JSON.stringify({ active: !p.active }),
                          },
                        ),
                      )
                    }
                  >
                    {p.active ? "Desativar" : "Ativar"}
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
      {activationLink && (
        <Modal
          title="Link de ativação gerado"
          onClose={() => setActivationLink(null)}
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-200">
              Envie este link para o cliente concluir o cadastro e criar a loja.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <Info label="Nome" value={activationLink.name} />
              <Info label="E-mail" value={activationLink.email} />
              <Info label="Plano" value={activationLink.plan} />
              <Info label="Status liberado" value={activationLink.status} />
            </div>
            <input
              className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
              readOnly
              value={absoluteActivationUrl}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  void navigator.clipboard.writeText(absoluteActivationUrl)
                }
              >
                Copiar link
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  window.open(
                    absoluteActivationUrl,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                Abrir link
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {payload && (
        <Modal title="Payload do webhook" onClose={() => setPayload(null)}>
          <Button
            className="mb-3"
            onClick={() => void navigator.clipboard.writeText(String(payload))}
          >
            Copiar payload
          </Button>
          <pre className="max-h-[60vh] overflow-auto rounded-xl bg-slate-950 p-4 text-xs">
            {String(payload)}
          </pre>
        </Modal>
      )}
    </AdminShell>
  );
}

function DataTable({
  headers,
  children,
  loading,
  empty,
}: {
  headers: string[];
  children: ReactNode;
  loading: boolean;
  empty: string;
}) {
  const rows = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl shadow-black/10">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-white/10 text-xs uppercase tracking-wide text-slate-300">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-slate-100">
            {children}
          </tbody>
        </table>
      </div>
      {loading && (
        <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      )}
      {!loading && rows === 0 && (
        <div className="p-6 text-center text-sm text-slate-400">{empty}</div>
      )}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-3xl border border-white/10 bg-slate-900 p-5 text-white shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

export function AdminMaxSystemsPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchPlatformJson<any>("/api/platform/system-status"));
    } catch (e) {
      setError(getErrorMessage(e, "Falha ao carregar sistemas."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const cards = data
    ? [
        [
          "API",
          data.api?.status,
          `NODE_ENV: ${data.api?.nodeEnv} • Servidor: ${data.api?.serverTime}`,
        ],
        [
          "Banco",
          data.database?.connection,
          `DATABASE_URL configurada: ${data.database?.databaseUrlConfigured ? "sim" : "não"}`,
        ],
        [
          "Cakto",
          data.cakto?.status,
          `Webhook: ${data.cakto?.webhookSecretConfigured ? "sim" : "não"} • Produtos: ${data.cakto?.mappedProducts}`,
        ],
        ["Focus", data.focus?.status, data.focus?.message],
        [
          "Planos públicos",
          data.publicPlans?.ok ? "ok" : "pendente",
          JSON.stringify(data.publicPlans?.checkoutUrlPresence ?? {}),
        ],
        [
          "Solicitações",
          data.accessRequests?.tableExists ? "ok" : "pendente",
          `Pendentes: ${data.accessRequests?.pending ?? 0}`,
        ],
      ]
    : [];
  return (
    <AdminShell
      title="Sistemas/APIs"
      description="Diagnóstico técnico de API, Banco, Cakto, Focus, planos públicos e APP_PUBLIC_URL."
      onRefresh={load}
      isRefreshing={loading}
    >
      {error && (
        <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-100">
          {error}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map(([title, status, desc]) => (
          <Card
            key={title}
            className="border-white/10 bg-white/[0.04] text-white"
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{title}</span>
                <Badge className={statusClasses(String(status))}>
                  {String(status)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-300">{String(desc)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-4 border-white/10 bg-white/[0.04] text-white">
        <CardHeader>
          <CardTitle>Tabelas críticas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-3">
            {(data?.database?.criticalTables ?? []).map((t: any) => (
              <div
                key={t.name}
                className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm"
              >
                {t.name} <span className="text-emerald-300">{t.status}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}

export function AdminMaxSupportPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchPlatformJson<any>(
        `/api/platform/support/sessions?search=${encodeURIComponent(search)}`,
      );
      setRows(r.sessions ?? []);
    } finally {
      setLoading(false);
    }
  }, [search]);
  useEffect(() => {
    void load();
  }, [load]);
  async function endSession() {
    await platformRequest("/api/platform/support/end", {
      method: "POST",
      body: "{}",
    });
    notify("Sessão encerrada.");
    void load();
  }
  return (
    <AdminShell
      title="Suporte"
      description="Use o Modo Suporte para acessar a loja do cliente sem pedir senha. Toda ação fica registrada."
      onRefresh={load}
      isRefreshing={loading}
    >
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar loja/ator"
        className="mb-4 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-slate-400"
      />
      <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.04]">
        <table className="w-full text-sm">
          <thead className="text-slate-300">
            <tr>
              <th className="p-3 text-left">Ator</th>
              <th className="p-3 text-left">Loja</th>
              <th className="p-3 text-left">Motivo</th>
              <th className="p-3">Modo</th>
              <th className="p-3">Status</th>
              <th className="p-3">Expira</th>
              <th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/10">
                <td className="p-3">{r.actorEmail}</td>
                <td className="p-3">{r.targetStoreName}</td>
                <td className="p-3">{r.reason}</td>
                <td className="p-3">
                  <Badge>{r.mode}</Badge>
                </td>
                <td className="p-3">{r.status}</td>
                <td className="p-3">{formatDate(r.expiresAt)}</td>
                <td className="p-3">
                  {r.status === "active" && (
                    <Button size="sm" onClick={endSession}>
                      Encerrar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

export function AdminMaxLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchPlatformJson<any>("/api/platform/audit-logs");
      setLogs(r.logs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <AdminShell
      title="Logs administrativos"
      description="Trilha de auditoria de lojas, cobrança, usuários e Modo Suporte."
      onRefresh={load}
      isRefreshing={loading}
    >
      <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.04]">
        <table className="w-full text-sm">
          <thead className="text-slate-300">
            <tr>
              <th className="p-3 text-left">Data</th>
              <th className="p-3 text-left">Ator</th>
              <th className="p-3 text-left">Ação</th>
              <th className="p-3 text-left">Alvo</th>
              <th className="p-3">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-white/10">
                <td className="p-3">{formatDate(l.createdAt)}</td>
                <td className="p-3">{l.actorEmail ?? "—"}</td>
                <td className="p-3">{l.action}</td>
                <td className="p-3">
                  {l.targetType}:{l.targetId}
                </td>
                <td className="p-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelected(l.metadata)}
                  >
                    Ver JSON
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelected(null)}
        >
          <pre className="max-h-[80vh] max-w-3xl overflow-auto rounded-3xl border border-white/10 bg-slate-950 p-5 text-xs text-emerald-100">
            {JSON.stringify(selected, null, 2)}
          </pre>
        </div>
      )}
    </AdminShell>
  );
}
