import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  UtensilsCrossed, 
  Users, 
  ChefHat, 
  ListOrdered,
  CreditCard,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { useHealthCheck } from "@workspace/api-client-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Pedidos", icon: ListOrdered },
  { href: "/tables", label: "Mesas", icon: UtensilsCrossed },
  { href: "/kitchen", label: "Cozinha", icon: ChefHat },
  { href: "/menu", label: "Cardapio", icon: UtensilsCrossed },
  { href: "/customers", label: "Clientes", icon: Users },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck();

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
            return (
              <Link key={item.href} href={item.href} className={`flex items-center px-3 py-2.5 rounded-md transition-colors ${isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                <item.icon className="w-5 h-5 mr-3" />
                {item.label}
              </Link>
            );
          })}
        </nav>
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
