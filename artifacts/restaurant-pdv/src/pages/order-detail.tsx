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
  useUpdateDeliveryStatus,
  useListProducts,
  getListProductsQueryKey,
  useListCategories,
  getListCategoriesQueryKey,
  getListOrdersQueryKey,
  getGetAlertsQueryKey,
  getListTablesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Trash2,
  SendHorizonal,
  X,
  CreditCard,
  Search,
  Truck,
  Package,
  MapPin,
  Banknote,
  Smartphone,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  preparing: "Preparando",
  ready: "Pronto",
  closed: "Pago",
  cancelled: "Cancelado",
};

const SOURCE_LABELS: Record<string, string> = {
  ifood: "iFood",
  whatsapp: "WhatsApp",
  site: "Site",
  totem: "Totem",
  garcom: "Garçom",
  api_externa: "API",
};

const SOURCE_COLORS: Record<string, string> = {
  ifood: "bg-red-100 text-red-700",
  whatsapp: "bg-green-100 text-green-700",
  site: "bg-blue-100 text-blue-700",
  totem: "bg-purple-100 text-purple-700",
  garcom: "bg-gray-100 text-gray-700",
  api_externa: "bg-gray-100 text-gray-700",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  preparing: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  ready: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  closed: "bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando preparo",
  preparing: "Em preparo",
  ready: "Pronto para entrega",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  awaiting_settlement: "Aguardando baixa financeira",
};

const DELIVERY_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  preparing: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  ready: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  out_for_delivery: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  delivered: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  awaiting_settlement: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

// Status que permitem ações financeiras
const PAYABLE = ["open", "preparing", "ready"];

// Sequência de status de entrega
const DELIVERY_SEQUENCE = ["pending", "preparing", "ready", "out_for_delivery", "delivered"];

const DELIVERY_ACTIONS: { status: string; label: string }[] = [
  { status: "ready", label: "✅ Pronto para entrega" },
  { status: "out_for_delivery", label: "🛵 Saiu para entrega" },
  { status: "delivered", label: "📦 Entregue" },
];

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const orderId = parseInt(id!);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  const invalidateOrder = () => {
    queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
  };

  const { data: order, isLoading } = useGetOrder(orderId, {
    query: {
      enabled: !!orderId,
      queryKey: getGetOrderQueryKey(orderId),
      refetchInterval: 15_000,
    },
  });

  const { data: categories } = useListCategories({
    query: { queryKey: getListCategoriesQueryKey() },
  });

  const productParams: Record<string, unknown> = {};
  if (catFilter !== "all") productParams.categoryId = parseInt(catFilter);
  if (search) productParams.search = search;

  const { data: products } = useListProducts(productParams, {
    query: { queryKey: getListProductsQueryKey(productParams) },
  });

  const addItem = useAddOrderItem({
    mutation: {
      onSuccess: () => {
        invalidateOrder();
        toast({ title: "Item adicionado" });
      },
    },
  });

  const removeItem = useRemoveOrderItem({
    mutation: {
      onSuccess: () => {
        invalidateOrder();
        toast({ title: "Item removido" });
      },
    },
  });

  const sendToKitchen = useSendOrderToKitchen({
    mutation: {
      onSuccess: () => {
        invalidateOrder();
        toast({ title: "Pedido enviado para a cozinha!" });
      },
    },
  });

  const cancelOrder = useCancelOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
        toast({ title: "Pedido cancelado" });
        setLocation("/orders");
      },
    },
  });

  const updateDeliveryStatus = useUpdateDeliveryStatus({
    mutation: {
      onSuccess: () => {
        invalidateOrder();
        toast({ title: "Status de entrega atualizado!" });
      },
      onError: () => {
        toast({ title: "Erro ao atualizar status de entrega", variant: "destructive" });
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
          <p className="text-muted-foreground">Pedido não encontrado</p>
          <Button asChild className="mt-4">
            <Link href="/orders">Voltar</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const isEditable = order.status === "open";
  const isPayable = PAYABLE.includes(order.status);
  const isDelivery = order.type === "delivery";
  const deliveryFee = order.deliveryFee ?? 0;
  const itemsSubtotal = order.totalAmount - deliveryFee;

  const currentDeliveryIdx = DELIVERY_SEQUENCE.indexOf(order.deliveryStatus ?? "");

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <Button variant="ghost" size="sm" onClick={() => setLocation("/orders")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-1" /> Pedidos
        </Button>

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">Pedido #{order.id}</h1>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${STATUS_COLORS[order.status]}`}>
                {STATUS_LABELS[order.status]}
              </span>
              {isDelivery && (
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5" /> Delivery
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground space-y-0.5">
              {order.tableNumber && <p>🪑 Mesa {order.tableNumber}</p>}
              {order.customerName && <p>👤 {order.customerName}</p>}
              {order.customerPhone && <p>📞 {order.customerPhone}</p>}
              {order.notes && <p>💬 {order.notes}</p>}
              <p>🕐 {new Date(order.createdAt).toLocaleString("pt-BR")}</p>
            </div>
          </div>

          {/* Ações */}
          <div className="flex gap-2 flex-wrap">
            {isEditable && order.items.length > 0 && (
              <Button
                onClick={() => sendToKitchen.mutate({ id: orderId })}
                disabled={sendToKitchen.isPending}
                variant="outline"
                data-testid="button-send-kitchen"
              >
                <SendHorizonal className="w-4 h-4 mr-2" /> Enviar para Cozinha
              </Button>
            )}

            {isEditable && (
              <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-add-item">
                    <Plus className="w-4 h-4 mr-2" /> Adicionar Item
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Adicionar Item ao Pedido #{orderId}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar produto..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant={catFilter === "all" ? "default" : "outline"}
                        onClick={() => setCatFilter("all")}
                      >
                        Todos
                      </Button>
                      {categories?.map((cat) => (
                        <Button
                          key={cat.id}
                          size="sm"
                          variant={catFilter === String(cat.id) ? "default" : "outline"}
                          onClick={() => setCatFilter(String(cat.id))}
                        >
                          {cat.name}
                        </Button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                      {products?.filter((p) => p.available).map((product) => (
                        <div
                          key={product.id}
                          className="p-3 border rounded-lg cursor-pointer hover:bg-accent hover:border-primary transition-colors"
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
            )}

            {isPayable && (
              <Button
                onClick={() => setLocation(`/payments/${orderId}`)}
                disabled={order.items.length === 0}
                data-testid="button-pay-order"
              >
                <CreditCard className="w-4 h-4 mr-2" /> Processar Pagamento
              </Button>
            )}

            {isPayable && (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => cancelOrder.mutate({ id: orderId })}
                disabled={cancelOrder.isPending}
                data-testid="button-cancel-order"
              >
                <X className="w-4 h-4 mr-2" /> Cancelar
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Itens + Dados de Entrega */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Itens do Pedido</CardTitle>
              </CardHeader>
              <CardContent>
                {order.items.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <p className="font-medium">Nenhum item adicionado</p>
                    {isEditable && <p className="text-sm mt-1">Use o botão "Adicionar Item" acima</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                        data-testid={`item-${item.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-primary">{item.quantity}x</span>
                            <p className="font-medium truncate">{item.productName}</p>
                          </div>
                          <p className="text-sm text-muted-foreground">R$ {item.unitPrice.toFixed(2)} cada</p>
                          {item.notes && (
                            <p className="text-xs text-muted-foreground italic mt-0.5">💬 {item.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
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

            {/* Seção de Entrega */}
            {isDelivery && (
              <Card className="border-orange-200 dark:border-orange-800">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                    <Truck className="w-5 h-5" /> Dados de Entrega
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Status atual */}
                  {order.deliveryStatus && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-medium text-muted-foreground">Status:</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${DELIVERY_STATUS_COLORS[order.deliveryStatus] ?? ""}`}>
                        {DELIVERY_STATUS_LABELS[order.deliveryStatus] ?? order.deliveryStatus}
                      </span>
                    </div>
                  )}

                  {/* Botões de avanço */}
                  {order.status !== "cancelled" && order.status !== "closed" && (
                    <div className="flex gap-2 flex-wrap">
                      {DELIVERY_ACTIONS.map((action) => {
                        const actionIdx = DELIVERY_SEQUENCE.indexOf(action.status);
                        const isCurrent = order.deliveryStatus === action.status;
                        const isPast = currentDeliveryIdx > actionIdx;
                        return (
                          <Button
                            key={action.status}
                            size="sm"
                            variant={isCurrent ? "default" : "outline"}
                            disabled={isCurrent || isPast || updateDeliveryStatus.isPending}
                            onClick={() =>
                              updateDeliveryStatus.mutate({
                                id: orderId,
                                data: {
                                  deliveryStatus: action.status as
                                    | "pending"
                                    | "preparing"
                                    | "ready"
                                    | "out_for_delivery"
                                    | "delivered",
                                },
                              })
                            }
                            data-testid={`button-delivery-${action.status}`}
                          >
                            {action.label}
                          </Button>
                        );
                      })}
                    </div>
                  )}

                  {/* Dados do cliente e endereço */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm pt-2 border-t">
                    {order.customerName && (
                      <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Cliente</p>
                        <p className="font-medium">👤 {order.customerName}</p>
                      </div>
                    )}
                    {order.customerPhone && (
                      <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Telefone</p>
                        <p className="font-medium">📞 {order.customerPhone}</p>
                      </div>
                    )}
                    {(order.deliveryAddress || order.deliveryCep) && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Endereço</p>
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
                          <div className="space-y-0.5">
                            {order.deliveryCep && (
                              <p className="text-xs text-muted-foreground">CEP: {order.deliveryCep}</p>
                            )}
                            {order.deliveryAddress && (
                              <p className="font-medium">{order.deliveryAddress}</p>
                            )}
                            {order.deliveryNeighborhood && (
                              <p className="text-muted-foreground">{order.deliveryNeighborhood}</p>
                            )}
                            {order.deliveryReference && (
                              <p className="text-muted-foreground italic text-xs">{order.deliveryReference}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {order.deliveryNotes && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Obs. de entrega</p>
                        <p className="italic text-sm">💬 {order.deliveryNotes}</p>
                      </div>
                    )}

                    {/* Payment timing info */}
                    {order.paymentTiming && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Pagamento</p>
                        {order.paymentTiming === "now" ? (
                          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 font-medium">
                            <CreditCard className="w-4 h-4" />
                            Pago no momento do pedido
                          </div>
                        ) : (
                          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 space-y-1.5 text-sm">
                            <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                              <Banknote className="w-4 h-4" />
                              Pagar na entrega —{" "}
                              {order.deliveryPaymentMethod === "dinheiro" && <><Banknote className="w-3.5 h-3.5" /> Dinheiro</>}
                              {order.deliveryPaymentMethod === "pix" && <><Smartphone className="w-3.5 h-3.5" /> Pix</>}
                              {order.deliveryPaymentMethod === "cartao" && <><CreditCard className="w-3.5 h-3.5" /> Cartão</>}
                            </div>
                            {order.needsChange && (
                              <p className="text-amber-700 dark:text-amber-400">
                                Troco para: <strong>R$ {parseFloat(String(order.changeFor ?? 0)).toFixed(2)}</strong>
                                {" · "}Levar troco de:{" "}
                                <strong>
                                  R$ {Math.max(0, parseFloat(String(order.changeFor ?? 0)) - order.totalAmount).toFixed(2)}
                                </strong>
                              </p>
                            )}
                            {order.deliveryPaymentNotes && (
                              <p className="text-xs text-muted-foreground italic">{order.deliveryPaymentNotes}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Origem do Pedido (apenas pedidos externos) */}
            {order.source && (
              <Card className="border-muted">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Origem do Pedido</p>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${SOURCE_COLORS[order.source] ?? "bg-gray-100 text-gray-700"}`}>
                      {SOURCE_LABELS[order.source] ?? order.source}
                    </span>
                    {order.externalOrderId && (
                      <span className="text-muted-foreground font-mono text-xs">ID externo: {order.externalOrderId}</span>
                    )}
                    {order.integrationStatus && (
                      <span className="text-muted-foreground text-xs">· Status: {order.integrationStatus}</span>
                    )}
                    {order.estimatedDistanceKm != null && (
                      <span className="text-muted-foreground text-xs">· ~{order.estimatedDistanceKm.toFixed(1)} km</span>
                    )}
                    {order.deliveryFeeSource && order.deliveryFeeSource !== "manual" && (
                      <span className="text-muted-foreground text-xs">
                        · Taxa: {order.deliveryFeeSource === "automatic" ? "calculada automaticamente" : "enviada pelo integrador"}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Resumo financeiro */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Resumo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground truncate">{item.quantity}x {item.productName}</span>
                    <span className="shrink-0 ml-2">R$ {item.totalPrice.toFixed(2)}</span>
                  </div>
                ))}
                {order.items.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sem itens</p>
                )}

                {isDelivery && deliveryFee > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-muted-foreground border-t pt-2 mt-1">
                      <span>Subtotal itens</span>
                      <span>R$ {itemsSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                        <Package className="w-3.5 h-3.5" /> Taxa de entrega
                      </span>
                      <span className="text-orange-600 dark:text-orange-400 font-medium">
                        + R$ {deliveryFee.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}

                <div className="border-t pt-3 mt-2">
                  <div className="flex justify-between font-bold text-xl">
                    <span>Total</span>
                    <span className="text-primary">R$ {order.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {isPayable && order.items.length > 0 && (
              <Button
                className="w-full"
                size="lg"
                onClick={() => setLocation(`/payments/${orderId}`)}
                data-testid="button-pay-order-sidebar"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Pagar · R$ {order.totalAmount.toFixed(2)}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
