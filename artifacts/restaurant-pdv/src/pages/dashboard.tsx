import { Layout } from "@/components/layout";
import { 
  useGetDashboardSummary, 
  useGetRecentOrders, 
  useGetSalesByCategory,
  getGetDashboardSummaryQueryKey,
  getGetRecentOrdersQueryKey,
  getGetSalesByCategoryQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingBag, UtensilsCrossed, ChefHat } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });
  const { data: recentOrders, isLoading: loadingOrders } = useGetRecentOrders({
    query: { queryKey: getGetRecentOrdersQueryKey() }
  });
  const { data: sales, isLoading: loadingSales } = useGetSalesByCategory({
    query: { queryKey: getGetSalesByCategoryQueryKey() }
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Visao geral das operacoes de hoje</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Faturamento Hoje" 
            value={summary ? `R$ ${summary.totalRevenueToday.toFixed(2)}` : null}
            icon={DollarSign} 
            loading={loadingSummary} 
          />
          <StatCard 
            title="Pedidos Hoje" 
            value={summary?.totalOrdersToday.toString()}
            icon={ShoppingBag} 
            loading={loadingSummary} 
          />
          <StatCard 
            title="Pedidos Abertos" 
            value={summary?.openOrders.toString()}
            icon={UtensilsCrossed} 
            loading={loadingSummary} 
          />
          <StatCard 
            title="Fila da Cozinha" 
            value={summary?.pendingKitchenTickets.toString()}
            icon={ChefHat} 
            loading={loadingSummary} 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>Vendas por Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSales ? (
                <Skeleton className="w-full h-[300px]" />
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sales || []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="categoryName" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="totalSales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pedidos Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingOrders ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="space-y-4">
                  {recentOrders?.map(order => (
                    <div key={order.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                      <div>
                        <p className="font-medium">Pedido #{order.id}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {order.type === "table" ? "Mesa" : order.type === "counter" ? "Balcao" : "Viagem"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">R$ {order.totalAmount.toFixed(2)}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {order.status === "open" ? "Aberto" : order.status === "preparing" ? "Preparando" : order.status === "ready" ? "Pronto" : order.status === "closed" ? "Fechado" : "Cancelado"}
                        </p>
                      </div>
                    </div>
                  ))}
                  {recentOrders?.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">Nenhum pedido recente.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ title, value, icon: Icon, loading }: { title: string, value?: string | null, icon: any, loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{value || "0"}</div>}
      </CardContent>
    </Card>
  );
}
