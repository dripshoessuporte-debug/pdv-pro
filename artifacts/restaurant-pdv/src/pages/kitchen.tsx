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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, ChefHat, Clock, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function useElapsed(createdAt: string) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
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
  return (
    <span className={`flex items-center gap-1 text-xs font-mono font-semibold px-2 py-0.5 rounded-full ${
      isLate ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
      isWarning ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
      "bg-muted text-muted-foreground"
    }`}>
      <Clock className="w-3 h-3" />
      {mins > 0 ? `${mins}m ${secs.toString().padStart(2, "0")}s` : `${secs}s`}
    </span>
  );
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  table: "Mesa",
  counter: "Balcão",
  takeaway: "Viagem",
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
    ? new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--";

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ChefHat className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Cozinha</h1>
              <p className="text-muted-foreground mt-0.5">
                {tickets?.length ?? 0} {tickets?.length === 1 ? "pedido pendente" : "pedidos pendentes"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="w-3 h-3" />
            <span>Atualizado às {lastUpdate} · auto-refresh 15s</span>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
          </div>
        ) : tickets?.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <ChefHat className="w-20 h-20 mx-auto mb-4 opacity-20" />
            <p className="text-2xl font-bold text-foreground">Cozinha livre!</p>
            <p className="text-sm mt-2">Nenhum pedido na fila no momento.</p>
            <p className="text-xs mt-1 opacity-60">A tela atualiza automaticamente a cada 15 segundos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tickets?.map((ticket) => (
              <Card
                key={ticket.id}
                className="border-2 border-amber-300 dark:border-amber-700 shadow-md"
                data-testid={`card-ticket-${ticket.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg leading-tight">
                        Pedido #{ticket.orderId}
                        {ticket.tableNumber ? ` · Mesa ${ticket.tableNumber}` : ""}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {ORDER_TYPE_LABELS[ticket.orderType ?? "counter"]}
                      </p>
                    </div>
                    <ElapsedBadge createdAt={ticket.createdAt} />
                  </div>
                  {ticket.notes && (
                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        💬 {ticket.notes}
                      </p>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    {ticket.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-2 text-sm"
                        data-testid={`item-ticket-${item.id}`}
                      >
                        <span className="font-black text-primary text-base leading-tight min-w-[1.5rem]">
                          {item.quantity}x
                        </span>
                        <div>
                          <span className="font-medium">{item.productName}</span>
                          {item.notes && (
                            <p className="text-xs text-muted-foreground italic">↳ {item.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => markReady.mutate({ id: ticket.id })}
                    disabled={markReady.isPending}
                    data-testid={`button-ready-${ticket.id}`}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Pronto — Chamar para Pagar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
