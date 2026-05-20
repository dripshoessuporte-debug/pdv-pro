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
import { Plus, ChevronRight, SendHorizonal, X, CreditCard, CalendarDays } from "lucide-react";
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

const TYPE_LABELS: Record<string, string> = {
  table: "Mesa",
  counter: "Balcão",
  takeaway: "Viagem",
  delivery: "Delivery",
};

const STATUS_FILTERS = ["all", "open", "preparing", "ready", "closed", "cancelled"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

const PAYABLE = ["open", "preparing", "ready"];

export default function Orders() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [todayOnly, setTodayOnly] = useState(true);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Always fetch ALL orders — filtering is done entirely in the frontend.
  // This ensures statusCounts are always accurate for every button,
  // and avoids separate cache entries per status (which caused stale/empty lists).
  const { data: allOrders, isLoading } = useListOrders(undefined, {
    query: {
      queryKey: getListOrdersQueryKey(),
      refetchInterval: 20_000,
    },
  });

  // Step 1: apply the date filter
  const periodOrders = useMemo(() => {
    if (!allOrders) return [];
    if (!todayOnly) return allOrders;
    return allOrders.filter((o) => isToday(o.createdAt));
  }, [allOrders, todayOnly]);

  // Step 2: compute per-status counts from the date-filtered set
  const statusCounts = useMemo(() => {
    return periodOrders.reduce(
      (acc, o) => {
        acc[o.status] = (acc[o.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [periodOrders]);

  // Step 3: apply the status filter on top of the date filter
  const displayed = useMemo(() => {
    if (statusFilter === "all") return periodOrders;
    return periodOrders.filter((o) => o.status === statusFilter);
  }, [periodOrders, statusFilter]);

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

        {/* Filtros */}
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <Button
              size="sm"
              variant={todayOnly ? "default" : "outline"}
              onClick={() => setTodayOnly(true)}
              className="gap-1.5"
            >
              <CalendarDays className="w-3.5 h-3.5" /> Hoje
            </Button>
            <Button
              size="sm"
              variant={!todayOnly ? "default" : "outline"}
              onClick={() => setTodayOnly(false)}
            >
              Todos os dias
            </Button>
            <div className="h-5 w-px bg-border mx-1" />
            {STATUS_FILTERS.map((f) => {
              // "Todos" shows count of the whole period; others show per-status count
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
              {todayOnly ? "Nenhum pedido hoje ainda. " : ""}
              Crie um novo pedido para começar.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayed.map((order) => (
              <Card
                key={order.id}
                className="hover:shadow-md transition-shadow"
                data-testid={`card-order-${order.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-semibold text-lg">#{order.id}</p>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            STATUS_COLORS[order.status] ?? ""
                          }`}
                        >
                          {STATUS_LABELS[order.status] ?? order.status}
                        </span>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {order.type ? (TYPE_LABELS[order.type] ?? order.type) : ""}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {order.tableNumber ? `Mesa ${order.tableNumber}` : ""}
                        {order.tableNumber && order.customerName ? " · " : ""}
                        {order.customerName ?? ""}
                        {!order.tableNumber && !order.customerName ? "Sem identificação" : ""}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {order.items.length} {order.items.length === 1 ? "item" : "itens"} ·{" "}
                        {new Date(order.createdAt).toLocaleString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </p>
                      {order.notes && (
                        <p className="text-xs text-muted-foreground italic mt-0.5 truncate">
                          💬 {order.notes}
                        </p>
                      )}
                    </div>

                    {/* Valor + Ações */}
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="font-bold text-lg text-right">
                        R$ {order.totalAmount.toFixed(2)}
                      </p>

                      {/* Enviar para cozinha (só status aberto) */}
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

                      {/* Pagar: qualquer status ativo */}
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

                      {/* Cancelar (status ativo) */}
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

                      {/* Ver detalhes */}
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
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
