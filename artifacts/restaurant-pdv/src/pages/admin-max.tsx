import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  Headphones,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Settings,
  Sparkles,
  Store,
  Users,
  ListChecks,
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
};

type PlatformStore = {
  id: number;
  name: string;
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
  { href: "/admin-max/users", label: "Usuários", icon: Users, disabled: true },
  {
    href: "/admin-max/plans",
    label: "Planos",
    icon: ListChecks,
    disabled: true,
  },
  {
    href: "/admin-max/billing",
    label: "Cobrança",
    icon: CreditCard,
    disabled: false,
  },
  {
    href: "/admin-max/support",
    label: "Suporte",
    icon: Headphones,
    disabled: true,
  },
  { href: "/admin-max/logs", label: "Logs", icon: FileText, disabled: true },
  {
    href: "/admin-max/settings",
    label: "Configurações",
    icon: Settings,
    disabled: true,
  },
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
                  : item.disabled
                    ? "cursor-not-allowed text-slate-500 opacity-70"
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
                  {item.disabled && (
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Em breve
                    </span>
                  )}
                </span>
              );
              return item.disabled ? (
                <div key={item.href}>{content}</div>
              ) : (
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

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("pt-BR");
}

function statusClasses(status: string) {
  if (["active", "ativo"].includes(status.toLowerCase()))
    return "bg-emerald-500/10 text-emerald-200 border-emerald-400/20";
  if (["trial", "teste"].includes(status.toLowerCase()))
    return "bg-amber-500/10 text-amber-200 border-amber-400/20";
  if (["blocked", "bloqueado"].includes(status.toLowerCase()))
    return "bg-red-500/10 text-red-200 border-red-400/20";
  return "bg-slate-500/10 text-slate-200 border-slate-400/20";
}

export function AdminMaxDashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [stores, setStores] = useState<PlatformStore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadDashboard = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    setStoresError(null);

    const [overviewResult, storesResult] = await Promise.allSettled([
      fetchPlatformJson<Overview>("/api/platform/overview"),
      fetchPlatformJson<{ stores: PlatformStore[] }>("/api/platform/stores"),
    ]);

    if (overviewResult.status === "fulfilled")
      setOverview(overviewResult.value);
    else setError("Não foi possível carregar os indicadores da plataforma.");

    if (storesResult.status === "fulfilled")
      setStores(storesResult.value.stores.slice(0, 5));
    else setStoresError("Não foi possível carregar as lojas recentes.");

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const metricCards = useMemo(
    () => [
      {
        title: "Total de lojas",
        value: overview?.totalStores,
        description: "Clientes cadastrados na plataforma",
        icon: Store,
        tone: "text-sky-200 bg-sky-500/10 border-sky-400/20",
      },
      {
        title: "Lojas ativas",
        value: overview?.activeStores,
        description: "Lojas liberadas para operar",
        icon: CheckCircle2,
        tone: "text-emerald-200 bg-emerald-500/10 border-emerald-400/20",
      },
      {
        title: "Usuários cadastrados",
        value: overview?.totalUsers,
        description: "Usuários vinculados às lojas",
        icon: Users,
        tone: "text-violet-200 bg-violet-500/10 border-violet-400/20",
      },
      {
        title: "Pedidos hoje",
        value: overview?.ordersToday,
        description: "Movimento operacional do dia",
        icon: Activity,
        tone: "text-orange-200 bg-orange-500/10 border-orange-400/20",
      },
      {
        title: "Lojas em teste",
        value: overview?.trialStores,
        description: "Contas em avaliação",
        icon: Clock3,
        tone: "text-amber-200 bg-amber-500/10 border-amber-400/20",
      },
      {
        title: "Lojas bloqueadas",
        value: overview?.blockedStores,
        description: "Acesso pausado ou inadimplente",
        icon: AlertTriangle,
        tone: "text-red-200 bg-red-500/10 border-red-400/20",
      },
    ],
    [overview],
  );

  const platformStatus = [
    ["API online", true],
    ["Banco conectado", true],
    ["Login ativo", true],
    ["Multi-loja ativo", true],
    ["Admin Max ativo", true],
    ["Focus", false],
    ["Assinaturas", false],
  ] as const;

  return (
    <AdminShell
      title="Visão geral"
      description="Controle central da operação multi-loja do Gestor Max"
      onRefresh={() => void loadDashboard(true)}
      isRefreshing={isRefreshing}
    >
      {(error || storesError) && (
        <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error ?? storesError}
        </div>
      )}

      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-black/20 md:p-8">
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-red-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <Badge className="mb-4 border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/10">
              <Sparkles className="mr-1 h-3 w-3" /> Centro administrativo
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Central de Controle Gestor Max
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-300">
              Acompanhe lojas, clientes, planos, status operacional e
              crescimento da plataforma.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin-max/stores">
              <Button className="bg-red-600 text-white hover:bg-red-700">
                Ver lojas <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Button
              variant="outline"
              disabled
              className="border-white/10 bg-white/5 text-slate-400"
            >
              Nova loja · Em breve
            </Button>
            <Button
              variant="outline"
              disabled
              className="border-white/10 bg-white/5 text-slate-400"
            >
              Ver planos · Em breve
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.title}
              className="border-white/10 bg-white/[0.04] text-white shadow-xl shadow-black/10"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-300">
                      {card.title}
                    </p>
                    <div className="mt-3 text-4xl font-bold tracking-tight">
                      {isLoading ? "—" : (card.value ?? 0)}
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      {card.description}
                    </p>
                  </div>
                  <div className={`rounded-2xl border p-3 ${card.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                {isLoading && (
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-red-400/60" />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="mt-6 grid gap-6 2xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden border-white/10 bg-white/[0.04] text-white">
          <CardHeader className="flex flex-row items-center justify-between border-b border-white/10">
            <div>
              <CardTitle>Lojas recentes</CardTitle>
              <p className="mt-1 text-sm text-slate-400">
                Últimos clientes cadastrados na plataforma.
              </p>
            </div>
            <Link href="/admin-max/stores">
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                Abrir lojas
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Nome da loja</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Cidade/Estado</th>
                    <th className="px-5 py-3">Criada em</th>
                    <th className="px-5 py-3">Usuários</th>
                    <th className="px-5 py-3">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {stores.map((store) => (
                    <tr key={store.id} className="text-slate-100">
                      <td className="px-5 py-4 font-semibold">{store.name}</td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(store.status)}`}
                        >
                          {store.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-300">
                        {store.city && store.state
                          ? `${store.city}/${store.state}`
                          : "—"}
                      </td>
                      <td className="px-5 py-4 text-slate-300">
                        {formatDate(store.createdAt)}
                      </td>
                      <td className="px-5 py-4">{store.membersCount}</td>
                      <td className="px-5 py-4">
                        <Link href="/admin-max/stores">
                          <Button variant="secondary" size="sm">
                            Ver detalhes
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isLoading && (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando lojas
                recentes...
              </div>
            )}
            {!isLoading && stores.length === 0 && !storesError && (
              <div className="p-8 text-center">
                <Building2 className="mx-auto h-10 w-10 text-slate-500" />
                <p className="mt-3 font-medium text-white">
                  Nenhuma loja recente encontrada
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Quando novos clientes criarem lojas, elas aparecerão aqui.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.04] text-white">
          <CardHeader>
            <CardTitle>Status da plataforma</CardTitle>
            <p className="text-sm text-slate-400">
              Sinais operacionais principais.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {platformStatus.map(([label, active]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <span className="flex items-center gap-3 text-sm font-medium text-slate-200">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${active ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" : "bg-amber-300"}`}
                  />
                  {label}
                </span>
                <span
                  className={`text-xs font-semibold ${active ? "text-emerald-200" : "text-amber-200"}`}
                >
                  {active ? "Ativo" : "Em breve"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </AdminShell>
  );
}

export function AdminMaxStoresPage() {
  const [stores, setStores] = useState<PlatformStore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchPlatformJson<{ stores: PlatformStore[] }>("/api/platform/stores")
      .then((data) => setStores(data.stores))
      .catch(() => setError("Não foi possível carregar as lojas."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AdminShell
      title="Lojas"
      description="Listagem básica de clientes e lojas cadastradas na plataforma."
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl shadow-black/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-white/10 text-xs uppercase tracking-wide text-slate-300">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Nome da loja</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Cidade/Estado</th>
                <th className="px-4 py-3">Criada em</th>
                <th className="px-4 py-3">Usuários</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {stores.map((store) => (
                <tr key={store.id} className="text-slate-100">
                  <td className="px-4 py-3">#{store.id}</td>
                  <td className="px-4 py-3 font-medium">{store.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-1 text-xs ${statusClasses(store.status)}`}
                    >
                      {store.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {store.city && store.state
                      ? `${store.city}/${store.state}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {formatDate(store.createdAt)}
                  </td>
                  <td className="px-4 py-3">{store.membersCount}</td>
                  <td className="px-4 py-3">
                    <Button variant="secondary" size="sm" disabled>
                      Ver detalhes
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isLoading && (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando lojas...
          </div>
        )}
        {!isLoading && stores.length === 0 && !error && (
          <div className="p-6 text-center text-sm text-slate-400">
            Nenhuma loja cadastrada.
          </div>
        )}
      </div>
    </AdminShell>
  );
}


type PlatformEntitlement = {
  userId: number;
  name: string;
  email: string;
  plan: string | null;
  status: string;
  source: string;
  trialEndsAt: string | null;
  activatedAt: string | null;
  createdAt: string;
};

async function postPlatformAction(path: string): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export function AdminMaxBillingPage() {
  const [entitlements, setEntitlements] = useState<PlatformEntitlement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);

  const loadEntitlements = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const data = await fetchPlatformJson<{ entitlements: PlatformEntitlement[] }>("/api/platform/entitlements");
      setEntitlements(data.entitlements);
    } catch {
      setError("Não foi possível carregar as liberações de planos.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadEntitlements();
  }, [loadEntitlements]);

  async function runAction(userId: number, action: "grant-trial" | "activate" | "block") {
    setBusyUserId(userId);
    setError(null);
    try {
      await postPlatformAction(`/api/platform/entitlements/${userId}/${action}`);
      await loadEntitlements(true);
    } catch {
      setError("Não foi possível atualizar a liberação do usuário.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <AdminShell
      title="Cobrança e liberações"
      description="Liberação manual de planos, testes e bloqueios antes da criação de loja."
      onRefresh={() => void loadEntitlements(true)}
      isRefreshing={isRefreshing}
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl shadow-black/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-white/10 text-xs uppercase tracking-wide text-slate-300">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Plano solicitado</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Criado em</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {entitlements.map((item) => (
                <tr key={item.userId} className="text-slate-100">
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-slate-300">{item.email}</td>
                  <td className="px-4 py-3 capitalize">{item.plan ?? "—"}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs ${statusClasses(item.status)}`}>{item.status}</span></td>
                  <td className="px-4 py-3 text-slate-300">{formatDate(item.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" disabled={busyUserId === item.userId} onClick={() => void runAction(item.userId, "grant-trial")}>Liberar teste</Button>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busyUserId === item.userId} onClick={() => void runAction(item.userId, "activate")}>Ativar manualmente</Button>
                      <Button size="sm" variant="destructive" disabled={busyUserId === item.userId} onClick={() => void runAction(item.userId, "block")}>Bloquear</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isLoading && <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Carregando liberações...</div>}
        {!isLoading && entitlements.length === 0 && !error && <div className="p-6 text-center text-sm text-slate-400">Nenhuma solicitação encontrada.</div>}
      </div>
    </AdminShell>
  );
}
