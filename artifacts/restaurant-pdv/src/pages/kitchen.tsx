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
                  className="rounded-2xl overflow-hidden shadow-lg border border-border flex flex-col bg-card"
                  data-testid={`card-ticket-${ticket.id}`}
                >
                  {/* Colored header strip */}
                  <div className={`${typeColor} px-4 py-3 flex items-center justify-between gap-3`}>
                    <div className="min-w-0">
                      <p className="text-white font-black text-xl leading-tight">
                        Pedido #{ticket.orderId}
                        {ticket.tableNumber ? ` · Mesa ${ticket.tableNumber}` : ""}
                      </p>
                      <p className="text-white/80 text-sm font-medium mt-0.5">
                        {ORDER_TYPE_LABELS[ticket.orderType ?? "counter"]}
                      </p>
                    </div>
                    <ElapsedBadge createdAt={ticket.createdAt} />
                  </div>

                  {/* Items body */}
                  <div className="flex-1 px-4 pt-4 pb-3 space-y-2.5">
                    {ticket.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-3"
                        data-testid={`item-ticket-${item.id}`}
                      >
                        <span className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 text-primary font-black text-base flex items-center justify-center leading-none">
                          {item.quantity}×
                        </span>
                        <div className="min-w-0 pt-1.5">
                          <p className="font-bold text-foreground text-base leading-snug">
                            {item.productName}
                          </p>
                          {"addons" in item && Array.isArray(item.addons) && item.addons.map((addon: { id: number; addonName: string }) => (
                            <p key={addon.id} className="text-sm text-muted-foreground font-medium mt-0.5">
                              ↳ {addon.addonName}
                            </p>
                          ))}
                          {item.notes && (
                            <p className="text-sm text-amber-700 dark:text-amber-400 font-medium mt-0.5">
                              💬 {item.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}

                    {ticket.notes && (
                      <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                          💬 {ticket.notes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Action button */}
                  <div className="px-4 pb-4">
                    <Button
                      className="w-full h-11 text-base font-bold bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-xl shadow-sm"
                      onClick={() => markReady.mutate({ id: ticket.id })}
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
    </Layout>
  );
}
