import { type ReactNode, useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Building2,
  CreditCard,
  Headphones,
  LayoutDashboard,
  ListChecks,
  Settings,
  Users,
  FileText,
} from "lucide-react";
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
    disabled: true,
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

function AdminShell({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description: string;
}) {
  const { platformRole, user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-white/10 bg-slate-900/95 p-6 lg:block">
        <div className="flex items-center gap-3">
          <img
            src="/brand/gestor-max-logo.png"
            alt="Gestor Max"
            className="h-11 w-auto"
          />
          <div>
            <p className="text-sm font-semibold">Admin Max</p>
            <p className="text-xs text-slate-400">Plataforma</p>
          </div>
        </div>
        <nav className="mt-8 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const content = (
              <span
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${item.disabled ? "cursor-not-allowed text-slate-500" : "text-slate-200 hover:bg-white/10"}`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
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
      </aside>

      <div className="lg:pl-72">
        <header className="border-b border-white/10 bg-slate-950/80 px-5 py-4 backdrop-blur lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              <p className="mt-1 text-sm text-slate-400">{description}</p>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <span>{user?.name}</span>
              <span className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs text-red-200">
                {platformRole}
              </span>
              <Button variant="outline" size="sm" onClick={logout}>
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

export function AdminMaxDashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlatformJson<Overview>("/api/platform/overview")
      .then(setOverview)
      .catch(() =>
        setError("Não foi possível carregar os indicadores da plataforma."),
      );
  }, []);

  const cards = [
    ["Total de lojas", overview?.totalStores],
    ["Lojas ativas", overview?.activeStores],
    ["Usuários cadastrados", overview?.totalUsers],
    ["Pedidos hoje", overview?.ordersToday],
    ["Lojas em teste", overview?.trialStores],
    ["Lojas bloqueadas", overview?.blockedStores],
  ];

  return (
    <AdminShell
      title="Visão geral"
      description="Indicadores iniciais da operação multi-loja do Gestor Max."
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value]) => (
          <Card key={label} className="border-white/10 bg-white/5 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{value ?? "—"}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}

export function AdminMaxStoresPage() {
  const [stores, setStores] = useState<PlatformStore[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlatformJson<{ stores: PlatformStore[] }>("/api/platform/stores")
      .then((data) => setStores(data.stores))
      .catch(() => setError("Não foi possível carregar as lojas."));
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
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
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
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                    {store.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {store.city && store.state
                    ? `${store.city}/${store.state}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {new Date(store.createdAt).toLocaleDateString("pt-BR")}
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
        {stores.length === 0 && !error && (
          <div className="p-6 text-center text-sm text-slate-400">
            Nenhuma loja cadastrada.
          </div>
        )}
      </div>
    </AdminShell>
  );
}
