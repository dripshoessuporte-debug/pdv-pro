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
} from "lucide-react";
import {
  useHealthCheck,
  useGetCurrentCashRegister,
  getGetCurrentCashRegisterQueryKey,
} from "@workspace/api-client-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cash", label: "Caixa", icon: Wallet },
  { href: "/orders", label: "Pedidos", icon: ListOrdered },
  { href: "/tables", label: "Mesas", icon: UtensilsCrossed },
  { href: "/kitchen", label: "Cozinha", icon: ChefHat },
  { href: "/menu", label: "Cardápio", icon: BookOpen },
  { href: "/customers", label: "Clientes", icon: Users },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck();

  const { data: cashRegister, isError: noCash } = useGetCurrentCashRegister({
    query: {
      queryKey: getGetCurrentCashRegisterQueryKey(),
      retry: false,
      refetchInterval: 60_000,
      staleTime: 30_000,
    },
  });

  const cashOpen = !noCash && !!cashRegister;

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="h-16 flex items-center px-6 border-b">
          <UtensilsCrossed className="w-6 h-6 text-primary mr-2" />
          <span className="font-bold text-lg tracking-tight">PDV Pro</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const isCash = item.href === "/cash";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-md transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <span className="flex items-center">
                  <item.icon className="w-5 h-5 mr-3" />
                  {item.label}
                </span>
                {isCash && (
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                    cashOpen
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                      : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                  }`}>
                    {cashOpen ? "Aberto" : "Fechado"}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Cash status footer */}
        <div className={`mx-4 mb-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
          cashOpen
            ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
            : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
        }`}>
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cashOpen ? "bg-green-500" : "bg-amber-500"}`} />
          {cashOpen ? (
            <span>Caixa aberto · {cashRegister?.operator}</span>
          ) : (
            <Link href="/cash" className="hover:underline">
              Caixa fechado — clique para abrir
            </Link>
          )}
        </div>

        <div className="p-4 border-t text-sm flex items-center justify-between">
          <div className="flex items-center text-muted-foreground">
            {health?.status === "ok" ? (
              <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />
            ) : (
              <AlertCircle className="w-4 h-4 text-destructive mr-2" />
            )}
            Status do Sistema
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-muted/30">
        <div className="p-8 max-w-7xl mx-auto h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
