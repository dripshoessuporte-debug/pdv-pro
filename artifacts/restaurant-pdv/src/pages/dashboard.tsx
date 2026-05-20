import { Link } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetDashboardSummary,
  useGetRecentOrders,
  useGetSalesByCategory,
  getGetDashboardSummaryQueryKey,
  getGetRecentOrdersQueryKey,
  getGetSalesByCategoryQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingBag, UtensilsCrossed, ChefHat, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
  const { data: recentOrders, isLoading: loadingOrders } = useGetRecentOrders({
    query: {
      queryKey: getGetRecentOrdersQueryKey(),
      refetchInterval: 30_000,
    },
  });
  const { data: sales, isLoading: loadingSales } = useGetSalesByCategory({
    query: {
      queryKey: getGetSalesByCategoryQueryKey(),
      refetchInterval: 60_000,
    },
  });

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
            <Card className="bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{summary.availableTables}</p>
                  <p className="text-sm text-green-600 dark:text-green-500">Mesas livres</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <div>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{summary.occupiedTables}</p>
                  <p className="text-sm text-amber-600 dark:text-amber-500">Mesas ocupadas</p>
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
                  {recentOrders?.map((order) => (
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
                            {order.type === "table" ? `Mesa ${order.tableNumber ?? "?"}` : order.type === "counter" ? "Balcão" : "Viagem"}
                            {order.customerName ? ` · ${order.customerName}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm">R$ {order.totalAmount.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
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
    <Card className={highlight ? "border-amber-400 dark:border-amber-600 shadow-amber-100 dark:shadow-amber-900/20 shadow-md" : ""}>
      <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
        <Icon className={`w-4 h-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent className="pt-1 pb-4">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className={`text-2xl font-bold ${accent ? "text-primary" : ""} ${highlight ? "text-amber-600 dark:text-amber-400" : ""}`}>
              {value ?? "0"}
            </div>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
