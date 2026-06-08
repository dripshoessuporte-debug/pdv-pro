import { useMemo } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetDashboardSummary,
  useGetRecentOrders,
  useGetSalesByCategory,
  useGetAlerts,
  getGetDashboardSummaryQueryKey,
  getGetRecentOrdersQueryKey,
  getGetSalesByCategoryQueryKey,
  getGetAlertsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DollarSign,
  ShoppingBag,
  UtensilsCrossed,
  ChefHat,
  TrendingUp,
  Bell,
  Truck,
  Clock,
  MapPin,
  Banknote,
  Navigation,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { OrderTimeBadge } from "@/components/order-time-badge";
import { compareNewestFirst } from "@/lib/time";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  preparing: "Preparando",
  ready: "Pronto",
  closed: "Pago",
  cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  preparing: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  ready: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  closed: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    query: {
      queryKey: getGetDashboardSummaryQueryKey(),
      refetchInterval: 30_000,
    },
  });
  const { data: allRecentOrders, isLoading: loadingOrders } = useGetRecentOrders({
    query: {
      queryKey: getGetRecentOrdersQueryKey(),
      refetchInterval: 30_000,
    },
  });

  const recentOrders = useMemo(() => {
    if (!allRecentOrders) return allRecentOrders;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return allRecentOrders.filter((o) => new Date(o.createdAt) >= todayStart);
  }, [allRecentOrders]);

  const { data: sales, isLoading: loadingSales } = useGetSalesByCategory({
    query: {
      queryKey: getGetSalesByCategoryQueryKey(),
      refetchInterval: 60_000,
    },
  });

  const { data: alerts } = useGetAlerts({
    query: {
      queryKey: getGetAlertsQueryKey(),
      refetchInterval: 30_000,
      staleTime: 20_000,
      retry: false,
    },
  });

  // Build list of active alerts (only those > 0)
  const activeAlerts = alerts
    ? [
        alerts.awaitingSettlement > 0 && {
          key: "awaitingSettlement",
          icon: Banknote,
          color: "text-[#D91F16] dark:text-red-300",
          bg: "bg-red-50 dark:bg-red-950/20",
          label: `${alerts.awaitingSettlement} entrega${alerts.awaitingSettlement > 1 ? "s" : ""} pendente${alerts.awaitingSettlement > 1 ? "s" : ""} de baixa financeira`,
          href: "/cash",
        },
        alerts.deliveryWithoutRoute > 0 && {
          key: "deliveryWithoutRoute",
          icon: MapPin,
          color: "text-red-600 dark:text-red-400",
          bg: "bg-red-50 dark:bg-red-900/20",
          label: `${alerts.deliveryWithoutRoute} delivery sem rota atribuída`,
          href: "/routes",
        },
        alerts.routesInProgress > 0 && {
          key: "routesInProgress",
          icon: Navigation,
          color: "text-blue-600 dark:text-blue-400",
          bg: "bg-blue-50 dark:bg-blue-900/20",
          label: `${alerts.routesInProgress} rota${alerts.routesInProgress > 1 ? "s" : ""} em andamento`,
          href: "/routes",
        },
        alerts.routesAvailable > 0 && {
          key: "routesAvailable",
          icon: Truck,
          color: "text-violet-600 dark:text-violet-400",
          bg: "bg-violet-50 dark:bg-violet-900/20",
          label: `${alerts.routesAvailable} rota${alerts.routesAvailable > 1 ? "s" : ""} disponível${alerts.routesAvailable > 1 ? "is" : ""} aguardando motoboy`,
          href: "/routes",
        },
        alerts.readyNotActioned > 0 && {
          key: "readyNotActioned",
          icon: Clock,
          color: "text-[#D91F16] dark:text-red-300",
          bg: "bg-red-50 dark:bg-red-950/20",
          label: `${alerts.readyNotActioned} pedido${alerts.readyNotActioned > 1 ? "s" : ""} pronto${alerts.readyNotActioned > 1 ? "s" : ""} há mais de 20 min sem ação`,
          href: "/orders",
        },
        alerts.cashRegisterOpenHours >= 12 && {
          key: "cashOpenHours",
          icon: Clock,
          color: "text-gray-600 dark:text-gray-400",
          bg: "bg-gray-50 dark:bg-gray-900/20",
          label: `Caixa aberto há ${alerts.cashRegisterOpenHours.toFixed(1)}h`,
          href: "/cash",
        },
      ].filter(Boolean)
    : [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Visão geral das operações de hoje</p>
          </div>
          <Button asChild>
            <Link href="/orders/new">+ Novo Pedido</Link>
          </Button>
        </div>

        {/* Operational Alerts */}
        {activeAlerts.length > 0 && (
          <Card className="border-amber-300 dark:border-amber-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Bell className="w-4 h-4" />
                Alertas operacionais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {activeAlerts.map((alert) => {
                  if (!alert) return null;
                  const Icon = alert.icon;
                  return (
                    <Link key={alert.key} href={alert.href}>
                      <div className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity ${alert.bg}`}>
                        <Icon className={`w-4 h-4 shrink-0 ${alert.color}`} />
                        <span className={`text-sm font-medium ${alert.color}`}>{alert.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Faturamento Hoje"
            value={summary ? `R$ ${summary.totalRevenueToday.toFixed(2)}` : null}
            sub="pedidos pagos"
            icon={DollarSign}
            loading={loadingSummary}
            accent
          />
          <StatCard
            title="Pedidos Hoje"
            value={summary?.totalOrdersToday.toString()}
            sub="criados hoje"
            icon={ShoppingBag}
            loading={loadingSummary}
          />
          <StatCard
            title="Pedidos Ativos"
            value={summary?.openOrders.toString()}
            sub="abertos + preparando + prontos"
            icon={UtensilsCrossed}
            loading={loadingSummary}
          />
          <StatCard
            title="Fila da Cozinha"
            value={summary?.pendingKitchenTickets.toString()}
            sub="aguardando preparo"
            icon={ChefHat}
            loading={loadingSummary}
            highlight={!!summary && summary.pendingKitchenTickets > 0}
          />
        </div>

        {/* Mesas */}
        {summary && (
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-green-700">{summary.availableTables}</p>
                  <p className="text-sm text-green-600">Mesas livres</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-[#FF2A1F] shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-amber-700">{summary.occupiedTables}</p>
                  <p className="text-sm text-[#D91F16]">Mesas ocupadas</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Vendas por Categoria */}
          <Card className="col-span-2">
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <CardTitle>Vendas por Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSales ? (
                <Skeleton className="w-full h-[280px]" />
              ) : sales?.every((s) => s.totalSales === 0) ? (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                  Nenhuma venda registrada ainda hoje
                </div>
              ) : (
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sales ?? []} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                      <XAxis dataKey="categoryName" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${v}`} />
                      <Tooltip
                        formatter={(v: number) => [`R$ ${v.toFixed(2)}`, "Vendas"]}
                        labelFormatter={(l) => `Categoria: ${l}`}
                      />
                      <Bar dataKey="totalSales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pedidos Recentes */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>Pedidos Recentes</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/orders">Ver todos</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingOrders ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : recentOrders?.length === 0 ? (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  Nenhum pedido hoje ainda.
                </div>
              ) : (
                <div className="space-y-3">
                  {[...(recentOrders ?? [])].sort(compareNewestFirst).map((order) => (
                    <Link key={order.id} href={`/orders/${order.id}`}>
                      <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">#{order.id}</p>
                            <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                              {STATUS_LABELS[order.status]}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {order.type === "table" ? `Mesa ${order.tableNumber ?? "?"}` : order.type === "counter" ? "Balcão" : order.type === "delivery" ? "Delivery" : "Viagem"}
                            {order.customerName ? ` · ${order.customerName}` : ""}
                          </p>
                          <OrderTimeBadge createdAt={order.createdAt} compact showIcon={false} className="mt-0.5" />
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm">R$ {order.totalAmount.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">{STATUS_LABELS[order.status] ?? order.status}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({
  title, value, sub, icon: Icon, loading, accent, highlight,
}: {
  title: string;
  value?: string | null;
  sub?: string;
  icon: React.ElementType;
  loading: boolean;
  accent?: boolean;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-red-300 dark:border-red-700 shadow-red-100 dark:shadow-red-900/20 shadow-md" : ""}>
      <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
        <Icon className={`w-4 h-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent className="pt-1 pb-4">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className={`text-2xl font-bold ${accent ? "text-primary" : ""} ${highlight ? "text-[#D91F16] dark:text-red-300" : ""}`}>
              {value ?? "0"}
            </div>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
