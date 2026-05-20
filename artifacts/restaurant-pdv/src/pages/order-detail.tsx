import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetOrder,
  getGetOrderQueryKey,
  useAddOrderItem,
  useRemoveOrderItem,
  useSendOrderToKitchen,
  useCancelOrder,
  useListProducts,
  getListProductsQueryKey,
  useListCategories,
  getListCategoriesQueryKey,
  getListOrdersQueryKey,
  getListTablesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Trash2, SendHorizonal, X, CreditCard, Search } from "lucide-react";
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

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const orderId = parseInt(id!);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  const { data: order, isLoading } = useGetOrder(orderId, {
    query: { enabled: !!orderId, queryKey: getGetOrderQueryKey(orderId) },
  });

  const { data: categories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });

  const productParams: Record<string, unknown> = {};
  if (catFilter !== "all") productParams.categoryId = parseInt(catFilter);
  if (search) productParams.search = search;

  const { data: products } = useListProducts(productParams, {
    query: { queryKey: getListProductsQueryKey(productParams) },
  });

  const addItem = useAddOrderItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
        toast({ title: "Item adicionado" });
      },
    },
  });

  const removeItem = useRemoveOrderItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
        toast({ title: "Item removido" });
      },
    },
  });

  const sendToKitchen = useSendOrderToKitchen({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "Pedido enviado para a cozinha" });
      },
    },
  });

  const cancelOrder = useCancelOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
        toast({ title: "Pedido cancelado" });
        setLocation("/orders");
      },
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Pedido nao encontrado</p>
          <Button asChild className="mt-4"><Link href="/orders">Voltar</Link></Button>
        </div>
      </Layout>
    );
  }

  const isEditable = order.status === "open";

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/orders")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
        </div>

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold tracking-tight">Pedido #{order.id}</h1>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[order.status]}`}>
                {STATUS_LABELS[order.status]}
              </span>
            </div>
            <div className="text-muted-foreground text-sm space-y-0.5">
              {order.tableNumber && <p>Mesa {order.tableNumber}</p>}
              {order.customerName && <p>Cliente: {order.customerName}</p>}
              <p>Criado em: {new Date(order.createdAt).toLocaleString("pt-BR")}</p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {isEditable && (
              <>
                <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" data-testid="button-add-item">
                      <Plus className="w-4 h-4 mr-2" /> Adicionar Item
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Adicionar Item</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant={catFilter === "all" ? "default" : "outline"} onClick={() => setCatFilter("all")}>Todos</Button>
                        {categories?.map((cat) => (
                          <Button key={cat.id} size="sm" variant={catFilter === String(cat.id) ? "default" : "outline"} onClick={() => setCatFilter(String(cat.id))}>
                            {cat.name}
                          </Button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                        {products?.filter((p) => p.available).map((product) => (
                          <div
                            key={product.id}
                            className="p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors"
                            onClick={() => {
                              addItem.mutate({ id: orderId, data: { productId: product.id, quantity: 1 } });
                            }}
                            data-testid={`product-option-${product.id}`}
                          >
                            <p className="font-medium text-sm">{product.name}</p>
                            <p className="text-primary font-bold text-sm">R$ {product.price.toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button
                  onClick={() => sendToKitchen.mutate({ id: orderId })}
                  disabled={sendToKitchen.isPending || order.items.length === 0}
                  data-testid="button-send-kitchen"
                >
                  <SendHorizonal className="w-4 h-4 mr-2" /> Enviar para Cozinha
                </Button>

                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => cancelOrder.mutate({ id: orderId })}
                  disabled={cancelOrder.isPending}
                  data-testid="button-cancel-order"
                >
                  <X className="w-4 h-4 mr-2" /> Cancelar
                </Button>
              </>
            )}

            {order.status === "ready" && (
              <Button asChild data-testid="button-pay-order">
                <Link href={`/payments/${orderId}`}>
                  <CreditCard className="w-4 h-4 mr-2" /> Processar Pagamento
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Itens do Pedido</CardTitle>
              </CardHeader>
              <CardContent>
                {order.items.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <p>Nenhum item adicionado</p>
                    {isEditable && <p className="text-sm mt-1">Clique em "Adicionar Item" para incluir produtos</p>}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50" data-testid={`item-${item.id}`}>
                        <div className="flex-1">
                          <p className="font-medium">{item.productName}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.quantity}x R$ {item.unitPrice.toFixed(2)}
                          </p>
                          {item.notes && <p className="text-xs text-muted-foreground italic">{item.notes}</p>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold">R$ {item.totalPrice.toFixed(2)}</span>
                          {isEditable && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive h-8 w-8 p-0"
                              onClick={() => removeItem.mutate({ id: orderId, itemId: item.id })}
                              disabled={removeItem.isPending}
                              data-testid={`button-remove-item-${item.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle>Resumo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>R$ {order.totalAmount.toFixed(2)}</span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>R$ {order.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
                {order.notes && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">Observacoes: {order.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
