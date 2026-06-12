import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  UtensilsCrossed,
  Users,
  ChefHat,
  ListOrdered,
  Wallet,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Truck,
  Bike,
  Settings,
  LogOut,
} from "lucide-react";
import {
  useHealthCheck,
  useGetCurrentCashRegister,
  useGetAlerts,
  getGetCurrentCashRegisterQueryKey,
  getGetAlertsQueryKey,
} from "@workspace/api-client-react";
import { DevRoleSwitcher } from "@/components/dev-role-switcher";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { canAccessPath } from "@/lib/rbac";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cash", label: "Caixa", icon: Wallet },
  { href: "/orders", label: "Pedidos", icon: ListOrdered },
  { href: "/tables", label: "Mesas", icon: UtensilsCrossed },
  { href: "/kitchen", label: "Cozinha", icon: ChefHat },
  { href: "/menu", label: "Cardápio", icon: BookOpen },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/routes", label: "Rotas", icon: Truck },
  { href: "/motoboys", label: "Motoboys", icon: Bike },
  { href: "/settings", label: "Configurações", icon: Settings },
];

function AlertBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold leading-none shadow-sm shadow-red-950/25">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { actor, user, currentStore, logout } = useAuth();

  const visibleNavItems = actor
    ? navItems.filter((item) => canAccessPath(actor.role, item.href))
    : [];
  const { data: health } = useHealthCheck();

  const { data: cashRegister, isError: noCash } = useGetCurrentCashRegister({
    query: {
      queryKey: getGetCurrentCashRegisterQueryKey(),
      retry: false,
      refetchInterval: 60_000,
      staleTime: 30_000,
    },
  });

  const { data: alerts } = useGetAlerts({
    query: {
      queryKey: getGetAlertsQueryKey(),
      refetchInterval: 30_000,
      staleTime: 20_000,
      refetchOnWindowFocus: true,
      retry: false,
    },
  });

  const cashOpen = !noCash && !!cashRegister;

  // Badge counts per nav section
  const cashBadge = alerts?.awaitingSettlement ?? 0;
  const routesBadge =
    (alerts?.routesInProgress ?? 0) +
    (alerts?.routesAvailable ?? 0) +
    (alerts?.deliveryWithoutRoute ?? 0);
  const kitchenBadge = alerts?.pendingKitchenCount ?? 0;
  const ordersBadge = alerts?.activeOrdersCount ?? 0;

  if (!actor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Carregando sessão...
      </div>
    );
  }

  function getBadge(href: string): number {
    if (href === "/cash") return cashBadge;
    if (href === "/routes") return routesBadge;
    if (href === "/kitchen") return kitchenBadge;
    if (href === "/orders") return ordersBadge;
    return 0;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <aside className="w-64 border-r border-white/10 bg-sidebar text-sidebar-foreground flex flex-col shadow-2xl shadow-slate-950/20">
        <div className="min-h-20 flex items-center px-6 border-b border-white/10">
          <Link href="/" className="flex min-h-11 items-center">
            <img
              src="/brand/gestor-max-logo.png"
              alt="Gestor Max"
              className="h-11 w-auto max-w-[188px] object-contain"
            />
            <span className="sr-only">Gestor Max</span>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {visibleNavItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            const isCash = item.href === "/cash";
            const badge = getBadge(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center justify-between px-3.5 py-3 rounded-xl text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-primary text-white font-semibold shadow-lg shadow-red-950/30"
                    : "text-zinc-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="flex items-center">
                  <item.icon
                    className={`w-5 h-5 mr-3 transition-colors ${isActive ? "text-white" : "text-zinc-400 group-hover:text-white"}`}
                  />
                  {item.label}
                </span>
                <span className="flex items-center gap-1.5">
                  {badge > 0 && <AlertBadge count={badge} />}
                  {isCash && (
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        cashOpen
                          ? "bg-green-500/15 text-green-300 ring-1 ring-green-400/25"
                          : "bg-red-500/15 text-red-200 ring-1 ring-red-400/25"
                      }`}
                    >
                      {cashOpen ? "Aberto" : "Fechado"}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Cash status footer */}
        {actor.role === "atendente" && (
          <div className="mx-4 mb-3 rounded-xl border border-blue-400/20 bg-blue-500/10 px-3.5 py-3 text-xs text-blue-100">
            Esta visualização mostra apenas dados do seu plantão atual.
          </div>
        )}
        {canAccessPath(actor.role, "/cash") && (
          <div
            className={`mx-4 mb-3 px-3.5 py-3 rounded-xl text-xs flex items-center gap-2.5 border ${
              cashOpen
                ? "bg-green-500/10 text-green-200 border-green-400/20"
                : "bg-amber-500/10 text-amber-200 border-amber-400/20"
            }`}
          >
            <div
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cashOpen ? "bg-green-400" : "bg-amber-400"}`}
            />
            {cashOpen ? (
              <span>Caixa aberto · {cashRegister?.operator}</span>
            ) : (
              <Link href="/cash" className="hover:underline">
                Caixa fechado — clique para abrir
              </Link>
            )}
          </div>
        )}

        <DevRoleSwitcher />

        <div className="mx-4 mb-3 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-xs text-zinc-200">
          <div className="font-semibold text-white">{user?.name ?? actor.name}</div>
          <div className="mt-1 text-zinc-400">{currentStore?.name ?? `Loja ${actor.storeId}`}</div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
            {currentStore?.role ?? actor.role}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3 w-full justify-center gap-2 bg-white/10 text-white hover:bg-white/15"
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>

        <div className="p-4 border-t border-white/10 text-sm flex items-center justify-between">
          <div className="flex items-center text-zinc-300">
            {health?.status === "ok" ? (
              <CheckCircle2 className="w-4 h-4 text-green-400 mr-2" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 mr-2" />
            )}
            Status do Sistema
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="p-8 lg:p-10 max-w-7xl mx-auto min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
