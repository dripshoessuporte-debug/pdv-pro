import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  CreditCard,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  Store,
  TerminalSquare,
  Users,
  X,
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

type StoreMember = {
  id: number;
  userId: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  isDefault?: boolean;
  userStatus?: string;
  entitlementPlan?: string | null;
  entitlementStatus?: string | null;
};

type StoreDetails = {
  store: PlatformStore & { activeMembersCount?: number };
  members: StoreMember[];
  maxControlUsers?: StoreMember[];
  membersByRole?: Record<string, number>;
  entitlement: {
    plan: string | null;
    status: string | null;
    userId: number;
    userName?: string;
    userEmail?: string;
  } | null;
  activeCashRegister?: {
    id: number;
    operatorUserId: number | null;
    operator: string;
    openingAmount: number;
    openedAt: string | null;
  } | null;
  lastCashRegister?: {
    id: number;
    operator: string;
    status: string;
    openedAt: string | null;
    closedAt: string | null;
    closingAmount: number | null;
  } | null;
  today?: {
    orders: number;
    revenue: number;
    openCashRegister: boolean;
  };
  todayOrders: number;
  todayRevenue: number;
  operationalHealth?: {
    attentionCount: number;
    checks: Array<{
      key: string;
      label: string;
      status: "ok" | "attention" | "neutral";
      message: string;
    }>;
  };
};

function isActiveMenu(pathname: string, href: string) {
  if (href === "/admin-max") return pathname === "/admin-max";
  return pathname.startsWith(href);
}

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
  if (["blocked", "bloqueado", "archived", "cancelled", "past_due"].includes(value))
    return "border-red-400/20 bg-red-500/10 text-red-200";
  return "border-slate-400/20 bg-slate-500/10 text-slate-200";
}

function checkClasses(status?: string) {
  if (status === "ok") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
  if (status === "attention") return "border-red-400/20 bg-red-500/10 text-red-200";
  return "border-slate-400/20 bg-slate-500/10 text-slate-200";
}

function formatDate(date?: string | null) {
  return date ? new Date(date).toLocaleString("pt-BR") : "—";
}

function money(value?: number | null) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function roleLabel(role?: string | null) {
  const map: Record<string, string> = {
    max_control: "Max Control",
    atendente: "Atendente",
    cozinha: "Cozinha",
    motoboy: "Motoboy",
    owner: "Owner legado",
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
            <img src="/brand/gestor-max-logo.png" alt="Gestor Max" className="h-12 w-auto object-contain" />
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3">
              <p className="text-sm font-bold text-white">Painel Dono</p>
              <p className="text-xs font-medium text-red-100/80">Administração global</p>
            </div>
          </div>
          <nav className="mt-6 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActiveMenu(location, item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <span className={`group flex min-h-11 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${active ? "border border-red-400/30 bg-red-500/15 text-red-50 shadow-lg shadow-red-950/20" : "text-slate-200 hover:bg-white/10 hover:text-white"}`}>
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-red-300" : ""}`} />
                    <span className="truncate">{item.label}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm font-semibold text-white">{user?.name ?? "Dono Gestor Max"}</p>
            <p className="mt-1 text-xs text-slate-400">{platformRole ?? "platform_owner"}</p>
            <Button className="mt-4 w-full border-white/10 bg-white/10 text-white hover:bg-white/15" variant="outline" size="sm" onClick={logout}>Sair</Button>
          </div>
        </div>
      </aside>
      <div className="xl:pl-80">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 px-5 py-5 backdrop-blur lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-200/80">Painel Dono</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Lojas</h1>
              <p className="mt-1 text-sm text-slate-400">Controle das lojas com saúde operacional, equipe, caixa e assinatura.</p>
            </div>
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing} className="w-fit border-white/10 bg-white/5 text-white hover:bg-white/10">
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} /> Atualizar
              </Button>
            )}
          </div>
        </header>
        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function AdminMaxStoresPage() {
  const [stores, setStores] = useState<PlatformStore[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [details, setDetails] = useState<StoreDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const loadStores = useCallback(() => {
    setIsLoading(true);
    setError(null);
    platformRequest<{ stores: PlatformStore[] }>("/api/platform/stores")
      .then((data) => setStores(data.stores))
      .catch((err) => setError(err instanceof Error ? err.message : "Não foi possível carregar lojas."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const filtered = stores.filter((store) => {
    const statusOk = status === "all" || store.status === status;
    const queryOk = `${store.id} ${store.name} ${store.slug ?? ""}`.toLowerCase().includes(query.toLowerCase());
    return statusOk && queryOk;
  });

  const counts = useMemo(
    () => stores.reduce<Record<string, number>>((acc, store) => {
      acc[store.status] = (acc[store.status] ?? 0) + 1;
      return acc;
    }, {}),
    [stores],
  );

  async function openDetails(storeId: number) {
    setLoadingDetails(true);
    setError(null);
    try {
      setDetails(await platformRequest<StoreDetails>(`/api/platform/stores/${storeId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar detalhes da loja.");
    } finally {
      setLoadingDetails(false);
    }
  }

  return (
    <OwnerPanelShell onRefresh={loadStores} isRefreshing={isLoading}>
      {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="p-5"><p className="text-xs uppercase text-slate-400">Total</p><p className="mt-2 text-3xl font-black">{isLoading ? "—" : stores.length}</p></CardContent></Card>
        <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="p-5"><p className="text-xs uppercase text-slate-400">Ativas</p><p className="mt-2 text-3xl font-black">{counts.active ?? 0}</p></CardContent></Card>
        <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="p-5"><p className="text-xs uppercase text-slate-400">Teste</p><p className="mt-2 text-3xl font-black">{counts.trial ?? 0}</p></CardContent></Card>
        <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="p-5"><p className="text-xs uppercase text-slate-400">Bloqueadas</p><p className="mt-2 text-3xl font-black">{counts.blocked ?? 0}</p></CardContent></Card>
      </section>

      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 pl-11 pr-4 text-white outline-none placeholder:text-slate-500" placeholder="Buscar por nome, slug ou ID" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select className="h-12 rounded-2xl border border-white/10 bg-slate-900 px-4 text-white" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todas</option>
            <option value="active">active</option>
            <option value="trial">trial</option>
            <option value="blocked">blocked</option>
            <option value="archived">archived</option>
          </select>
        </div>
      </section>

      <Card className="mt-6 overflow-hidden border-white/10 bg-white/[0.04] text-white">
        <CardHeader><CardTitle>Lojas encontradas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase text-slate-400"><tr><th className="px-5 py-3">Loja</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Criada em</th><th className="px-5 py-3">Usuários</th><th className="px-5 py-3">Ações</th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {isLoading ? <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Carregando lojas...</td></tr> : filtered.length === 0 ? <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">Nenhuma loja encontrada.</td></tr> : filtered.map((store) => (
                  <tr key={store.id} className="text-slate-100">
                    <td className="px-5 py-4"><div className="font-semibold">{store.name}</div><div className="text-xs text-slate-400">#{store.id} · {store.slug ?? "—"}</div></td>
                    <td className="px-5 py-4"><Badge className={statusClasses(store.status)}>{store.status}</Badge></td>
                    <td className="px-5 py-4">{formatDate(store.createdAt)}</td>
                    <td className="px-5 py-4">{store.membersCount}</td>
                    <td className="px-5 py-4"><Button size="sm" variant="secondary" onClick={() => void openDetails(store.id)}>Ver detalhes</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {details && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-slate-950 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
              <div><p className="text-xs uppercase tracking-[0.22em] text-red-200">Detalhes da loja</p><h2 className="mt-1 text-2xl font-black">{details.store.name}</h2><p className="text-sm text-slate-400">#{details.store.id} · {details.store.slug}</p></div>
              <Button variant="outline" className="border-white/10 bg-white/5 text-white" onClick={() => setDetails(null)}><X className="h-4 w-4" /></Button>
            </div>
            {loadingDetails ? <div className="p-8 text-center text-slate-400"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Carregando detalhes...</div> : (
              <div className="space-y-6 p-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="p-4"><p className="text-xs uppercase text-slate-400">Status</p><Badge className={`mt-2 ${statusClasses(details.store.status)}`}>{details.store.status}</Badge></CardContent></Card>
                  <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="p-4"><p className="text-xs uppercase text-slate-400">Caixa agora</p><div className="mt-2 flex items-center gap-2"><Banknote className="h-4 w-4" /><span className="font-bold">{details.activeCashRegister ? `Aberto #${details.activeCashRegister.id}` : "Fechado"}</span></div><p className="mt-1 text-xs text-slate-400">{details.activeCashRegister ? `${details.activeCashRegister.operator} · ${formatDate(details.activeCashRegister.openedAt)}` : "Nenhum caixa aberto"}</p></CardContent></Card>
                  <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="p-4"><p className="text-xs uppercase text-slate-400">Pedidos hoje</p><p className="mt-2 text-2xl font-black">{details.today?.orders ?? details.todayOrders ?? 0}</p></CardContent></Card>
                  <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="p-4"><p className="text-xs uppercase text-slate-400">Faturamento hoje</p><p className="mt-2 text-2xl font-black">{money(details.today?.revenue ?? details.todayRevenue)}</p></CardContent></Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
                  <Card className="border-white/10 bg-white/[0.04] text-white"><CardHeader><CardTitle>Equipe vinculada</CardTitle></CardHeader><CardContent className="space-y-2">{details.members.map((member) => <div key={member.id} className="rounded-xl border border-white/10 bg-white/5 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-semibold">{member.name}</div><div className="text-xs text-slate-400">{member.email}</div></div><Badge className={member.active ? "bg-emerald-500/10 text-emerald-200" : "bg-slate-500/10 text-slate-200"}>{member.active ? "ativo" : "inativo"}</Badge></div><div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300"><Badge className="bg-white/10 text-slate-200">{roleLabel(member.role)}</Badge>{member.isDefault && <Badge className="bg-blue-500/10 text-blue-200">padrão</Badge>}{member.entitlementStatus && <Badge className={statusClasses(member.entitlementStatus)}>{member.entitlementPlan ?? "plano"} · {member.entitlementStatus}</Badge>}</div></div>)}</CardContent></Card>
                  <div className="space-y-6">
                    <Card className="border-white/10 bg-white/[0.04] text-white"><CardHeader><CardTitle>Responsáveis</CardTitle></CardHeader><CardContent className="space-y-2">{(details.maxControlUsers ?? []).length > 0 ? details.maxControlUsers!.map((user) => <div key={user.id} className="rounded-xl border border-white/10 bg-white/5 p-3"><div className="font-semibold">{user.name}</div><div className="text-xs text-slate-400">{user.email}</div></div>) : <p className="text-sm text-red-200">Nenhum Max Control ativo.</p>}</CardContent></Card>
                    <Card className="border-white/10 bg-white/[0.04] text-white"><CardHeader><CardTitle>Assinatura</CardTitle></CardHeader><CardContent><div className="font-semibold">{details.entitlement?.plan ?? "—"}</div><Badge className={`mt-2 ${statusClasses(details.entitlement?.status)}`}>{details.entitlement?.status ?? "sem assinatura"}</Badge><p className="mt-2 text-xs text-slate-400">Referência: {details.entitlement?.userName ?? "—"}</p></CardContent></Card>
                    <Card className="border-white/10 bg-white/[0.04] text-white"><CardHeader><CardTitle>Saúde operacional</CardTitle></CardHeader><CardContent className="space-y-2">{details.operationalHealth?.checks?.map((check) => <div key={check.key} className={`rounded-xl border p-3 ${checkClasses(check.status)}`}><div className="flex items-center gap-2 font-semibold">{check.status === "attention" ? <AlertTriangle className="h-4 w-4" /> : check.status === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}{check.label}</div><p className="mt-1 text-xs opacity-80">{check.message}</p></div>)}</CardContent></Card>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </OwnerPanelShell>
  );
}
