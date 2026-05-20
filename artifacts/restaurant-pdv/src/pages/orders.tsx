import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ChevronRight, SendHorizonal, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  preparing: "Preparando",
  ready: "Pronto",
  closed: "Fechado",
  cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  preparing: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  ready: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const TYPE_LABELS: Record<string, string> = {
  table: "Mesa",
  counter: "Balcao",
  takeaway: "Viagem",
};

const FILTERS = ["all", "open", "preparing", "ready", "closed", "cancelled"] as const;
type Filter = typeof FILTERS[number];

export default function Orders() {
  const [filter, setFilter] = useState<Filter>("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: orders, isLoading } = useListOrders(
    filter === "all" ? {} : { status: filter as string },
    { query: { queryKey: getListOrdersQueryKey(filter === "all" ? {} : { status: filter }) } }
  );

  const cancel = useCancelOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "Pedido cancelado" });
      },
    },
  });

  const sendToKitchen = useSendOrderToKitchen({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "Pedido enviado para a cozinha" });
      },
    },
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pedidos</h1>
            <p className="text-muted-foreground mt-1">Gerencie os pedidos do restaurante</p>
          </div>
          <Button asChild data-testid="button-new-order">
            <Link href="/orders/new">
              <Plus className="w-4 h-4 mr-2" /> Novo Pedido
            </Link>
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              data-testid={`filter-${f}`}
            >
              {f === "all" ? "Todos" : STATUS_LABELS[f]}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {orders?.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-lg font-medium">Nenhum pedido encontrado</p>
                <p className="text-sm mt-1">Crie um novo pedido para comecar</p>
              </div>
            )}
            {orders?.map((order) => (
              <Card key={order.id} className="hover:shadow-md transition-shadow" data-testid={`card-order-${order.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-lg">Pedido #{order.id}</p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                            {STATUS_LABELS[order.status]}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          <p>
                            {TYPE_LABELS[order.type]}
                            {order.tableNumber ? ` · Mesa ${order.tableNumber}` : ""}
                            {order.customerName ? ` · ${order.customerName}` : ""}
                          </p>
                          <p>{order.items.length} {order.items.length === 1 ? "item" : "itens"}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right mr-2">
                        <p className="font-bold text-lg">
                          R$ {order.totalAmount.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {order.status === "open" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => sendToKitchen.mutate({ id: order.id })}
                            disabled={sendToKitchen.isPending || order.items.length === 0}
                            data-testid={`button-send-kitchen-${order.id}`}
                          >
                            <SendHorizonal className="w-4 h-4 mr-1" /> Cozinha
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => cancel.mutate({ id: order.id })}
                            disabled={cancel.isPending}
                            data-testid={`button-cancel-${order.id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {order.status === "ready" && (
                        <Button size="sm" asChild data-testid={`button-pay-${order.id}`}>
                          <Link href={`/payments/${order.id}`}>Pagar</Link>
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
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
