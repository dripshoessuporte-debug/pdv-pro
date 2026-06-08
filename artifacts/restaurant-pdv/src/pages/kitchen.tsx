import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import {
  useGetKitchenQueue,
  getGetKitchenQueueQueryKey,
  useMarkTicketReady,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, ChefHat, Clock, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OrderDetailDialog } from "@/components/order-detail-dialog";
import { OrderTimeBadge } from "@/components/order-time-badge";
import { formatOrderTime } from "@/lib/time";

function useElapsed(createdAt: string) {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  );
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [createdAt]);
  return elapsed;
}

function ElapsedBadge({ createdAt }: { createdAt: string }) {
  const seconds = useElapsed(createdAt);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const isLate = mins >= 15;
  const isWarning = mins >= 8;
  const label = mins > 0
    ? `${mins}m ${secs.toString().padStart(2, "0")}s`
    : `${secs}s`;

  if (isLate) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full bg-red-600 text-white animate-pulse">
        <Clock className="w-3.5 h-3.5" />
        {label}
      </span>
    );
  }
  if (isWarning) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full bg-amber-500 text-white">
        <Clock className="w-3.5 h-3.5" />
        {label}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full bg-slate-700 text-white">
      <Clock className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

type KitchenTicketItemAddon = {
  id: number;
  addonGroupName: string;
  addonName: string;
  quantity: number;
};

type KitchenTicketItem = {
  id: number;
  productName: string | null;
  quantity: number;
  totalPrice: number;
  notes?: string | null;
  variantName?: string | null;
  addons?: KitchenTicketItemAddon[];
};

function formatAddonDetails(item: KitchenTicketItem) {
  if (!Array.isArray(item.addons)) return [];

  return item.addons.map((addon) =>
    `${addon.addonGroupName}: ${addon.addonName}${addon.quantity > 1 ? ` x${addon.quantity}` : ""}`,
  );
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  table: "Mesa",
  counter: "Balcão",
  takeaway: "Viagem",
  delivery: "Delivery",
};

const ORDER_TYPE_COLORS: Record<string, string> = {
  table: "bg-blue-600",
  counter: "bg-violet-600",
  takeaway: "bg-teal-600",
  delivery: "bg-[#FF2A1F]",
};

export default function Kitchen() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [isOrderDetailOpen, setIsOrderDetailOpen] = useState(false);

  const openOrderDetail = (orderId: number) => {
    setSelectedOrderId(orderId);
    setIsOrderDetailOpen(true);
  };

  const { data: tickets, isLoading, dataUpdatedAt } = useGetKitchenQueue({
    query: {
      queryKey: getGetKitchenQueueQueryKey(),
      refetchInterval: 15_000,
    },
  });

  const markReady = useMarkTicketReady({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetKitchenQueueQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "✅ Pedido marcado como pronto!" });
      },
    },
  });

  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "--";

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ChefHat className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Cozinha</h1>
              <p className="text-muted-foreground mt-0.5">
                {tickets?.length ?? 0}{" "}
                {tickets?.length === 1 ? "pedido pendente" : "pedidos pendentes"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="w-3 h-3" />
            <span>Atualizado às {lastUpdate} · auto-refresh 15s</span>
          </div>
        </div>

        {/* Queue */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : tickets?.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <ChefHat className="w-20 h-20 mx-auto mb-4 opacity-20" />
            <p className="text-2xl font-bold text-foreground">Cozinha livre!</p>
            <p className="text-sm mt-2">Nenhum pedido na fila no momento.</p>
            <p className="text-xs mt-1 opacity-60">
              A tela atualiza automaticamente a cada 15 segundos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {tickets?.map((ticket) => {
              const typeColor = ORDER_TYPE_COLORS[ticket.orderType ?? "counter"] ?? "bg-slate-600";
              return (
                <div
                  key={ticket.id}
                  className="rounded-2xl overflow-hidden shadow-lg border border-border flex flex-col bg-card cursor-pointer transition-all hover:-translate-y-0.5 hover:border-[#D91F16]/50 hover:shadow-xl"
                  onClick={() => openOrderDetail(ticket.orderId)}
                  data-testid={`card-ticket-${ticket.id}`}
                >
                  {/* Colored header strip */}
                  <div className={`${typeColor} px-4 py-3`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-white font-black text-xl leading-tight">
                          Pedido #{ticket.orderId}
                          {ticket.tableNumber ? ` · Mesa ${ticket.tableNumber}` : ""}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-white/90">
                          <span>{ticket.customerName ?? "Cliente não informado"}</span>
                          <span className="text-white/50">·</span>
                          <span>{ORDER_TYPE_LABELS[ticket.orderType ?? "counter"]}</span>
                        </div>
                        <div className="grid gap-0.5 text-xs font-medium text-white/85 sm:grid-cols-2">
                          <p>Feito: {formatOrderTime(ticket.orderCreatedAt ?? ticket.createdAt)}</p>
                          <p>Na cozinha: {formatOrderTime(ticket.kitchenAcceptedAt ?? ticket.ticketCreatedAt ?? ticket.createdAt)}</p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right space-y-1">
                        <ElapsedBadge createdAt={ticket.ticketCreatedAt ?? ticket.createdAt} />
                        <OrderTimeBadge
                          createdAt={ticket.orderCreatedAt ?? ticket.createdAt}
                          compact
                          showIcon={false}
                          className="justify-end rounded-full bg-white/90 px-2 py-1 text-[11px] text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Items body */}
                  <div className="flex-1 bg-white px-4 pt-4 pb-3 space-y-3 dark:bg-card">
                    {ticket.items.map((item) => {
                      const addonDetails = formatAddonDetails(item);
                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border border-slate-200 bg-slate-50/80 p-3"
                          data-testid={`item-ticket-${item.id}`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="shrink-0 rounded-lg bg-[#D91F16]/10 px-2.5 py-1.5 text-base font-black leading-none text-[#D91F16]">
                              {item.quantity}×
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-bold text-foreground text-base leading-snug">
                                  {item.productName ?? "Item sem nome"}
                                </p>
                                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                                  R$ {item.totalPrice.toFixed(2)}
                                </span>
                              </div>
                              {item.variantName && (
                                <p className="mt-1 text-sm font-semibold text-slate-700">
                                  Variação: {item.variantName}
                                </p>
                              )}
                              {addonDetails.length > 0 && (
                                <div className="mt-2 rounded-lg bg-white px-2.5 py-2 text-sm text-slate-700 border border-slate-200">
                                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                    Adicionais
                                  </p>
                                  <div className="space-y-0.5">
                                    {addonDetails.map((detail, detailIndex) => (
                                      <p key={`${item.id}-detail-${detailIndex}`}>+ {detail}</p>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {item.notes && (
                                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-sm font-semibold text-amber-900">
                                  Obs: {item.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {ticket.notes && (
                      <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                          Obs. do pedido: {ticket.notes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Action button */}
                  <div className="px-4 pb-4">
                    <Button
                      className="w-full h-11 text-base font-bold bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-xl shadow-sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        markReady.mutate({ id: ticket.id });
                      }}
                      disabled={markReady.isPending}
                      data-testid={`button-ready-${ticket.id}`}
                    >
                      <CheckCircle2 className="w-5 h-5 mr-2" />
                      Pronto — Chamar para Pagar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <OrderDetailDialog
        orderId={selectedOrderId}
        open={isOrderDetailOpen}
        onOpenChange={setIsOrderDetailOpen}
      />
    </Layout>
  );
}
