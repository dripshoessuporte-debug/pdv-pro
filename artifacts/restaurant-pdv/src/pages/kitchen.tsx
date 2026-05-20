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
import { CheckCircle2, ChefHat, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Kitchen() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tickets, isLoading } = useGetKitchenQueue({
    query: { queryKey: getGetKitchenQueueQueryKey() },
  });

  const markReady = useMarkTicketReady({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetKitchenQueueQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "Pedido marcado como pronto" });
      },
    },
  });

  const orderTypeLabel: Record<string, string> = {
    table: "Mesa",
    counter: "Balcao",
    takeaway: "Viagem",
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <ChefHat className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cozinha</h1>
            <p className="text-muted-foreground mt-1">
              {tickets?.length ?? 0} {tickets?.length === 1 ? "pedido pendente" : "pedidos pendentes"}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : tickets?.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <ChefHat className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-xl font-medium">Cozinha livre!</p>
            <p className="text-sm mt-1">Nenhum pedido pendente no momento</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tickets?.map((ticket) => (
              <Card key={ticket.id} className="border-2 border-amber-200 dark:border-amber-800 shadow-md" data-testid={`card-ticket-${ticket.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      Pedido #{ticket.orderId}
                      {ticket.tableNumber ? ` · Mesa ${ticket.tableNumber}` : ""}
                    </CardTitle>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(ticket.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {orderTypeLabel[ticket.orderType ?? "counter"]}
                    {ticket.notes ? ` · ${ticket.notes}` : ""}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {ticket.items.map((item) => (
                      <div key={item.id} className="flex items-start justify-between text-sm" data-testid={`item-ticket-${item.id}`}>
                        <div>
                          <span className="font-semibold text-primary">{item.quantity}x</span>{" "}
                          <span className="font-medium">{item.productName}</span>
                          {item.notes && (
                            <p className="text-xs text-muted-foreground italic ml-5">{item.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => markReady.mutate({ id: ticket.id })}
                    disabled={markReady.isPending}
                    data-testid={`button-ready-${ticket.id}`}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Marcar como Pronto
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
