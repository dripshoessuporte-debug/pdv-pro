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
  Store,
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
  if (!response.ok)
    throw new Error(
      (data as { error?: string } | null)?.error ?? `HTTP ${response.status}`,
    );
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

type PlatformOrphanUser = {
  id: number;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  platformRole: string | null;
  activeStoresCount: number;
  entitlementStatus: string | null;
};
function userBlockReason(u: PlatformOrphanUser, role?: string | null) {
  if (
    u.platformRole === "platform_owner" ||
    u.platformRole === "platform_admin"
  )
    return "usuário protegido";
  if (u.activeStoresCount > 0) return "possui loja ativa";
  if (role !== "platform_owner") return "somente platform_owner pode excluir";
  return "deletável";
}
export function AdminMaxUsersPage() {
  const { platformRole } = useAuth();
  const [users, setUsers] = useState<PlatformOrphanUser[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    fetchPlatformJson<{ users: PlatformOrphanUser[] }>(
      "/api/platform/orphan-users",
    )
      .then((d) => setUsers(d.users))
      .catch((e) =>
        setError(getErrorMessage(e, "Não foi possível carregar usuários.")),
      )
      .finally(() => setIsLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const rows = users
    .filter((u) =>
      `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()),
    )
    .filter(
      (u) =>
        filter === "all" ||
        (filter === "with" && u.entitlementStatus) ||
        (filter === "without" && !u.entitlementStatus) ||
        (filter === "protected" &&
          ["platform_owner", "platform_admin"].includes(
            u.platformRole ?? "",
          )) ||
        (filter === "deletable" &&
          userBlockReason(u, platformRole) === "deletável"),
    );
  async function deleteUser(id: number) {
    const confirmation = window.prompt(
      "Digite EXCLUIR para confirmar a exclusão definitiva do usuário de teste.",
    );
    if (confirmation !== "EXCLUIR") return;
    try {
      await platformRequest(`/api/platform/orphan-users/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation }),
      });
      notify("Usuário excluído.");
      load();
    } catch (e) {
      setError(getErrorMessage(e, "Não foi possível excluir."));
    }
  }
  return (
    <AdminShell
      title="Usuários sem loja ativa"
      description="Use esta área para limpar cadastros de teste que impedem novo cadastro com o mesmo e-mail."
      onRefresh={load}
      isRefreshing={isLoading}
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_240px]">
        <input
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
          placeholder="Buscar por nome/e-mail"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">todos</option>
          <option value="with">com entitlement</option>
          <option value="without">sem entitlement</option>
          <option value="protected">protegidos</option>
          <option value="deletable">deletáveis</option>
        </select>
      </div>
      <DataTable
        empty="Nenhum usuário sem loja ativa encontrado."
        loading={isLoading}
        headers={[
          "Nome",
          "E-mail",
          "Status",
          "Entitlement",
          "Perfil",
          "Motivo",
          "Ações",
        ]}
      >
        {rows.map((u) => {
          const reason = userBlockReason(u, platformRole);
          return (
            <tr key={u.id}>
              <td className="px-4 py-3 font-medium">{u.name}</td>
              <td className="px-4 py-3">{u.email}</td>
              <td className="px-4 py-3">{u.status}</td>
              <td className="px-4 py-3">{u.entitlementStatus ?? "—"}</td>
              <td className="px-4 py-3">{u.platformRole ?? "—"}</td>
              <td className="px-4 py-3 text-slate-300">{reason}</td>
              <td className="px-4 py-3">
                {reason === "deletável" ? (
                  <Button
                    className="bg-red-700"
                    size="sm"
                    onClick={() => void deleteUser(u.id)}
                  >
                    Excluir usuário de teste
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => notify(reason)}
                  >
                    Ver motivo
                  </Button>
                )}
              </td>
            </tr>
          );
        })}
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    Promise.allSettled([
      fetchPlatformJson<{ entitlements: PlatformEntitlement[] }>(
        "/api/platform/entitlements",
      ),
      fetchPlatformJson<{ requests: AccessRequest[] }>(
        "/api/platform/access-requests",
      ),
      fetchPlatformJson<{ webhooks: BillingWebhook[] }>(
        "/api/platform/billing/webhooks",
      ),
      fetchPlatformJson<{ products: BillingProduct[] }>(
        "/api/platform/billing/products",
      ),
    ])
      .then(([e, r, w, p]) => {
        if (e.status === "fulfilled") setEntitlements(e.value.entitlements);
        if (r.status === "fulfilled") setRequests(r.value.requests);
        if (w.status === "fulfilled") setWebhooks(w.value.webhooks);
        if (p.status === "fulfilled") setProducts(p.value.products);
        if ([e, r, w, p].some((x) => x.status === "rejected"))
          setError("Alguns dados de cobrança estão indisponíveis.");
      })
      .finally(() => setIsLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      const result = (await fn()) as { activationUrl?: string };
      notify(
        result?.activationUrl
          ? `Ação concluída. Link: ${result.activationUrl}`
          : "Ação concluída.",
      );
      load();
    } catch (e) {
      setError(getErrorMessage(e, "Ação falhou."));
    } finally {
      setBusy(null);
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
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
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
          loading={isLoading}
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
                      disabled={busy === `${i.userId}-${k}`}
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
                      {busy === `${i.userId}-${k}` ? (
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
          loading={isLoading}
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
                      disabled={busy === `req-${r.id}-${k}`}
                      onClick={() =>
                        void run(`req-${r.id}-${k}`, () =>
                          platformRequest(
                            `/api/platform/access-requests/${r.id}/${k}`,
                            { method: "POST" },
                          ),
                        )
                      }
                    >
                      {l}
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
          loading={isLoading}
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
            loading={isLoading}
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
