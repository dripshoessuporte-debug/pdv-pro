import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useListOrders,
  getListOrdersQueryKey,
  useCancelOrder,
  useSendOrderToKitchen,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ChevronRight, SendHorizonal, X, CreditCard, CalendarDays, Truck, PackageCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando",
  preparing: "Em preparo",
  ready: "Pronto p/ entrega",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
};

const TYPE_LABELS: Record<string, string> = {
  table: "Mesa",
  counter: "Balcão",
  takeaway: "Viagem",
  delivery: "Delivery",
};

const STATUS_FILTERS = ["all", "open", "preparing", "ready", "closed", "cancelled"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

type PeriodFilter = "today" | "yesterday" | "week" | "month" | "all";

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  week: "Esta semana",
  month: "Este mês",
  all: "Todos",
};

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function startOfWeek(d: Date) {
  const c = startOfDay(d);
  const day = c.getDay();
  c.setDate(c.getDate() - day);
  return c;
}

function startOfMonth(d: Date) {
  const c = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  return c;
}

function filterByPeriod(orders: { createdAt: string }[], period: PeriodFilter) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  return orders.filter((o) => {
    const d = new Date(o.createdAt);
    if (period === "today")     return d >= todayStart;
    if (period === "yesterday") return d >= yesterdayStart && d < todayStart;
    if (period === "week")      return d >= weekStart;
    if (period === "month")     return d >= monthStart;
    return true;
  });
}

function formatGroupDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (d >= todayStart) return "Hoje";
  if (d >= yesterdayStart) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const PAYABLE = ["open", "preparing", "ready"];

export default function Orders() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [period, setPeriod] = useState<PeriodFilter>("today");
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [completingDelivery, setCompletingDelivery] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const markDelivered = async (orderId: number) => {
    setCompletingDelivery(orderId);
    try {
      const res = await fetch(`/api/delivery/orders/${orderId}/delivered`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      toast({ title: "Entrega confirmada! Pedido encerrado." });
    } catch (e) {
      toast({ title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`, variant: "destructive" });
    } finally {
      setCompletingDelivery(null);
    }
  };

  const { data: allOrders, isLoading } = useListOrders(undefined, {
    query: {
      queryKey: getListOrdersQueryKey(),
      refetchInterval: 20_000,
    },
  });

  const periodOrders = useMemo(() => {
    if (!allOrders) return [];
    return filterByPeriod(allOrders, period) as typeof allOrders;
  }, [allOrders, period]);

  const statusCounts = useMemo(() => {
    return periodOrders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [periodOrders]);

  const displayed = useMemo(() => {
    let list = deliveryOnly ? periodOrders.filter((o) => o.type === "delivery") : periodOrders;
    if (statusFilter !== "all") list = list.filter((o) => o.status === statusFilter);
    return list;
  }, [periodOrders, statusFilter, deliveryOnly]);

  // Group by date only in "all" period
  const groupedDisplayed = useMemo(() => {
    if (period !== "all") return null;
    const groups: { label: string; orders: typeof displayed }[] = [];
    const map = new Map<string, typeof displayed>();
    for (const o of displayed) {
      const label = formatGroupDate(o.createdAt);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(o);
    }
    map.forEach((orders, label) => groups.push({ label, orders }));
    return groups;
  }, [displayed, period]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
  };

  const cancel = useCancelOrder({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        toast({ title: "Pedido cancelado" });
      },
    },
  });

  const sendToKitchen = useSendOrderToKitchen({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        toast({ title: "Pedido enviado para a cozinha!" });
      },
    },
  });

  const renderOrder = (order: (typeof displayed)[number]) => {
    const isDelivery = order.type === "delivery";
    const deliveryFee = order.deliveryFee ?? 0;
    return (
      <Card
        key={order.id}
        className="hover:shadow-md transition-shadow"
        data-testid={`card-order-${order.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="font-semibold text-lg">#{order.id}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[order.status] ?? ""}`}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>

                {isDelivery ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-700 flex items-center gap-1">
                    <Truck className="w-3 h-3" /> Delivery
                  </span>
                ) : (
                  order.type && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {TYPE_LABELS[order.type] ?? order.type}
                    </span>
                  )
                )}

                {isDelivery && order.deliveryStatus && (
                  <span className="text-xs text-slate-500 font-medium">
                    · {DELIVERY_STATUS_LABELS[order.deliveryStatus] ?? order.deliveryStatus}
                  </span>
                )}
              </div>

              <p className="text-sm text-muted-foreground truncate">
                {[
                  order.tableNumber ? `Mesa ${order.tableNumber}` : null,
                  order.customerName ?? null,
                  isDelivery && order.customerPhone ? `📞 ${order.customerPhone}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || (!isDelivery ? "Sem identificação" : null)}
              </p>

              {isDelivery && order.deliveryAddress && (
                <p className="text-xs text-muted-foreground truncate">
                  📍 {order.deliveryAddress}
                  {order.deliveryNeighborhood ? ` · ${order.deliveryNeighborhood}` : ""}
                </p>
              )}

              <p className="text-xs text-muted-foreground mt-0.5">
                {order.items.length} {order.items.length === 1 ? "item" : "itens"} ·{" "}
                {new Date(order.createdAt).toLocaleString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                })}
                {isDelivery && deliveryFee > 0 ? ` · Taxa R$ ${deliveryFee.toFixed(2)}` : ""}
              </p>

              {order.notes && (
                <p className="text-xs text-muted-foreground italic mt-0.5 truncate">
                  💬 {order.notes}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <p className="font-bold text-lg">R$ {order.totalAmount.toFixed(2)}</p>

              {order.status === "open" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sendToKitchen.mutate({ id: order.id })}
                  disabled={sendToKitchen.isPending || order.items.length === 0}
                  title="Enviar para cozinha"
                  data-testid={`button-send-kitchen-${order.id}`}
                >
                  <SendHorizonal className="w-4 h-4" />
                </Button>
              )}

              {isDelivery && order.deliveryStatus === "out_for_delivery" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                  onClick={() => markDelivered(order.id)}
                  disabled={completingDelivery === order.id}
                  title="Confirmar entrega"
                  data-testid={`button-dar-baixa-${order.id}`}
                >
                  <PackageCheck className="w-4 h-4" />
                  {completingDelivery === order.id ? "..." : "Dar Baixa"}
                </Button>
              )}

              {PAYABLE.includes(order.status) && (
                <Button
                  size="sm"
                  onClick={() => setLocation(`/payments/${order.id}`)}
                  disabled={order.items.length === 0}
                  data-testid={`button-pay-${order.id}`}
                >
                  <CreditCard className="w-3.5 h-3.5 mr-1" /> Pagar
                </Button>
              )}

              {PAYABLE.includes(order.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => cancel.mutate({ id: order.id })}
                  disabled={cancel.isPending}
                  title="Cancelar pedido"
                  data-testid={`button-cancel-${order.id}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLocation(`/orders/${order.id}`)}
                data-testid={`button-view-${order.id}`}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pedidos</h1>
            <p className="text-muted-foreground mt-1">
              {displayed.length} pedido{displayed.length !== 1 ? "s" : ""} encontrado
              {displayed.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button asChild data-testid="button-new-order">
            <Link href="/orders/new">
              <Plus className="w-4 h-4 mr-2" /> Novo Pedido
            </Link>
          </Button>
        </div>

        {/* ── Aba Delivery ── */}
        <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 self-start w-fit">
          <button
            onClick={() => setDeliveryOnly(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              !deliveryOnly ? "bg-white shadow-sm text-[#0F172A]" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-all-orders"
          >
            Todos os pedidos
          </button>
          <button
            onClick={() => setDeliveryOnly(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              deliveryOnly ? "bg-white shadow-sm text-[#0F172A]" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-delivery-only"
          >
            <Truck className="w-3.5 h-3.5" />
            Delivery
            {(() => {
              const cnt = periodOrders.filter((o) => o.type === "delivery").length;
              return cnt > 0 ? (
                <span className={`text-xs font-semibold rounded-full px-1.5 leading-5 min-w-[1.2rem] text-center ${deliveryOnly ? "bg-[#0F172A] text-white" : "bg-muted text-muted-foreground"}`}>
                  {cnt}
                </span>
              ) : null;
            })()}
          </button>
        </div>

        {/* ── Filtros de período ── */}
        <div className="flex gap-2 flex-wrap items-center">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          {(["today", "yesterday", "week", "month", "all"] as PeriodFilter[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => setPeriod(p)}
              className="gap-1.5"
              data-testid={`period-${p}`}
            >
              {PERIOD_LABELS[p]}
            </Button>
          ))}
        </div>

        {/* ── Filtros de status ── */}
        <div className="flex gap-2 flex-wrap items-center">
          {STATUS_FILTERS.map((f) => {
            const count = f === "all" ? periodOrders.length : (statusCounts[f] ?? 0);
            return (
              <Button
                key={f}
                variant={statusFilter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(f)}
                className="gap-1.5"
                data-testid={`filter-${f}`}
              >
                {f === "all" ? "Todos" : STATUS_LABELS[f]}
                {count > 0 && (
                  <span
                    className={`text-xs rounded-full px-1.5 py-0 min-w-[1.2rem] text-center ${
                      statusFilter === f ? "bg-white/20" : "bg-muted"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">Nenhum pedido encontrado</p>
            <p className="text-sm mt-1">
              {period === "today" ? "Nenhum pedido hoje ainda. " : ""}
              Crie um novo pedido para começar.
            </p>
          </div>
        ) : groupedDisplayed ? (
          /* Grouped by date when period = "all" */
          <div className="space-y-6">
            {groupedDisplayed.map(({ label, orders }) => (
              <div key={label}>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{label}</h2>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">{orders.length} pedido{orders.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-3">
                  {orders.map(renderOrder)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {displayed.map(renderOrder)}
          </div>
        )}
      </div>
    </Layout>
  );
}
