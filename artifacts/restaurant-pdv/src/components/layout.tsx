import { ReactNode, useState } from "react";
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
  KeyRound,
  LogOut,
  ReceiptText,
  Layers3,
  BookOpenCheck,
  PlugZap,
  Menu,
  X,
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
  { href: "/team", label: "Equipe", icon: Users },
  { href: "/routes", label: "Rotas", icon: Truck },
  { href: "/motoboys", label: "Motoboys", icon: Bike },
  { href: "/fiscal", label: "Fiscal", icon: ReceiptText },
  { href: "/settings", label: "Configurações", icon: Settings },
];

const settingsItems = [
  { href: "/settings", label: "Configurações gerais", icon: Settings },
  {
    href: "/settings/openrouteservice",
    label: "API de Distância",
    icon: KeyRound,
  },
];

const fiscalItems = [
  { href: "/fiscal", label: "Visão geral", icon: ReceiptText },
  { href: "/fiscal/focus", label: "Integração Focus", icon: PlugZap },
  { href: "/fiscal/groups", label: "Grupos e produtos", icon: Layers3 },
  {
    href: "/fiscal/codes",
    label: "Biblioteca de códigos",
    icon: BookOpenCheck,
  },
];

function AlertBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold leading-none shadow-sm shadow-red-950/25">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function SettingsNavigation({ location }: { location: string }) {
  if (!location.startsWith("/settings")) return null;

  return (
    <div className="mb-6 overflow-x-auto rounded-2xl border bg-card p-2 shadow-sm [-webkit-overflow-scrolling:touch]">
      <div className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap">
        {settingsItems.map((item) => {
          const isActive =
            item.href === "/settings"
              ? location === "/settings"
              : location.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function FiscalNavigation({ location }: { location: string }) {
  if (!location.startsWith("/fiscal")) return null;

  return (
    <div className="mb-6 overflow-x-auto rounded-2xl border bg-card p-2 shadow-sm [-webkit-overflow-scrolling:touch]">
      <div className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap">
        {fiscalItems.map((item) => {
          const isActive =
            item.href === "/fiscal"
              ? location === "/fiscal"
              : location.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { actor, user, currentStore, logout } = useAuth();
  const currentStoreId = currentStore?.id ?? actor?.storeId ?? null;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleNavItems = actor
    ? navItems.filter((item) => canAccessPath(actor.role, item.href))
    : [];
  const { data: health } = useHealthCheck();

  const { data: cashRegister, isError: noCash } = useGetCurrentCashRegister({
    query: {
      queryKey: [
        ...getGetCurrentCashRegisterQueryKey(),
        currentStoreId ?? "no-store",
      ],
      enabled: Boolean(currentStoreId),
      retry: false,
      refetchInterval: 60_000,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
    },
  });

  const { data: alerts } = useGetAlerts({
    query: {
      queryKey: [...getGetAlertsQueryKey(), currentStoreId ?? "no-store"],
      enabled: Boolean(currentStoreId),
      refetchInterval: 30_000,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      retry: false,
    },
  });

  const cashRegisterStoreId = (cashRegister as { storeId?: number } | undefined)
    ?.storeId;
  const cashRegisterBelongsToCurrentStore =
    Boolean(cashRegister) &&
    Boolean(currentStoreId) &&
    (cashRegisterStoreId === undefined ||
      cashRegisterStoreId === currentStoreId);
  const visibleCashRegister = cashRegisterBelongsToCurrentStore
    ? cashRegister
    : undefined;
  const cashOpen = !noCash && Boolean(visibleCashRegister);

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

  const systemStatus = (
    <div className="flex items-center text-zinc-300">
      {health?.status === "ok" ? (
        <CheckCircle2 className="mr-2 h-4 w-4 text-green-400" />
      ) : (
        <AlertCircle className="mr-2 h-4 w-4 text-red-400" />
      )}
      Status do Sistema
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-background text-foreground lg:flex">
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Fechar menu mobile"
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <header className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
            <img src="/brand/gestor-max-logo.png" alt="Gestor Max" className="h-9 w-auto max-w-[140px] object-contain" />
            <span className="sr-only">Gestor Max</span>
          </Link>
          <div className="hidden min-w-0 flex-1 text-right text-xs text-muted-foreground min-[430px]:block">
            <div className="truncate font-semibold text-foreground">{currentStore?.name ?? `Loja ${actor.storeId}`}</div>
            {canAccessPath(actor.role, "/cash") && (
              <div className={cashOpen ? "text-green-600" : "text-amber-600"}>Caixa {cashOpen ? "aberto" : "fechado"}</div>
            )}
          </div>
        </div>
      </header>
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[min(20rem,86vw)] -translate-x-full flex-col border-r border-white/10 bg-sidebar text-sidebar-foreground shadow-2xl shadow-slate-950/30 transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:translate-x-0 ${mobileMenuOpen ? "translate-x-0" : ""}`}>
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
                onClick={() => setMobileMenuOpen(false)}
                className={`group flex min-h-11 items-center justify-between px-3.5 py-3 rounded-xl text-sm transition-all duration-200 ${
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

        {actor.role === "atendente" && (
          <div className="mx-4 mb-3 rounded-xl border border-blue-400/20 bg-blue-500/10 px-3.5 py-3 text-xs text-blue-100">
            Esta visualização mostra apenas dados da loja atual.
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
              <span>Caixa aberto · {visibleCashRegister?.operator}</span>
            ) : (
              <Link href="/cash" className="hover:underline">
                Caixa fechado — clique para abrir
              </Link>
            )}
          </div>
        )}

        {actor.isDevelopmentFallback && <DevRoleSwitcher />}

        <div className="mx-4 mb-3 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-xs text-zinc-200">
          <div className="font-semibold text-white">
            {user?.name ?? actor.name}
          </div>
          <div className="mt-1 text-zinc-400">
            {currentStore?.name ?? `Loja ${actor.storeId}`}
          </div>
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

        <div className="border-t border-white/10 p-4 text-sm">{systemStatus}</div>
      </aside>
      <main className="min-w-0 flex-1 bg-background">
        <div className="mx-auto min-h-full max-w-7xl px-4 py-5 sm:px-6 lg:p-10">
          <SettingsNavigation location={location} />
          <FiscalNavigation location={location} />
          {children}
        </div>
      </main>
    </div>
  );
}
