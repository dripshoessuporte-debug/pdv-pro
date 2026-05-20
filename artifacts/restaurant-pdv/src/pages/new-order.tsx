import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import {
  useListTables,
  getListTablesQueryKey,
  useListCustomers,
  getListCustomersQueryKey,
  useListCategories,
  getListCategoriesQueryKey,
  useListProducts,
  getListProductsQueryKey,
  useCreateOrder,
  useAddOrderItem,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, ShoppingCart, Search, MessageSquare, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type OrderType = "counter" | "table" | "takeaway" | "delivery";

type CartItem = {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  notes: string;
};

export default function NewOrder() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const preselectedTableId = params.get("tableId");

  const [orderType, setOrderType] = useState<OrderType>("counter");
  const [tableId, setTableId] = useState(preselectedTableId ?? "");
  const [customerId, setCustomerId] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [creating, setCreating] = useState(false);

  // Delivery / takeaway fields
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryCep, setDeliveryCep] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState("");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tables } = useListTables({ query: { queryKey: getListTablesQueryKey() } });
  const { data: customers } = useListCustomers({}, { query: { queryKey: getListCustomersQueryKey({}) } });
  const { data: categories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });

  const productParams: Record<string, unknown> = { availableOnly: true };
  if (categoryFilter !== "all") productParams.categoryId = parseInt(categoryFilter);
  if (productSearch) productParams.search = productSearch;

  const { data: products, isLoading: loadingProducts } = useListProducts(productParams, {
    query: { queryKey: getListProductsQueryKey(productParams) },
  });

  const createOrder = useCreateOrder();
  const addItem = useAddOrderItem();

  useEffect(() => {
    if (preselectedTableId) {
      setOrderType("table");
      setTableId(preselectedTableId);
    }
  }, [preselectedTableId]);

  const addToCart = (product: { id: number; name: string; price: number }) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { productId: product.id, name: product.name, price: product.price, quantity: 1, notes: "" }];
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === productId);
      if (existing && existing.quantity > 1) {
        return prev.map((i) => i.productId === productId ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return prev.filter((i) => i.productId !== productId);
    });
  };

  const updateItemNotes = (productId: number, notes: string) => {
    setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, notes } : i));
  };

  const cartSubtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const parsedFee = orderType === "delivery" ? (parseFloat(deliveryFee) || 0) : 0;
  const cartTotal = cartSubtotal + parsedFee;
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const handleCreate = async () => {
    if (cart.length === 0) {
      toast({ title: "Adicione pelo menos um item ao pedido", variant: "destructive" });
      return;
    }
    if (orderType === "table" && !tableId) {
      toast({ title: "Selecione uma mesa", variant: "destructive" });
      return;
    }
    if (orderType === "delivery") {
      if (!customerName.trim()) {
        toast({ title: "Nome do cliente é obrigatório para delivery", variant: "destructive" });
        return;
      }
      if (!customerPhone.trim()) {
        toast({ title: "Telefone é obrigatório para delivery", variant: "destructive" });
        return;
      }
      if (!deliveryAddress.trim()) {
        toast({ title: "Endereço é obrigatório para delivery", variant: "destructive" });
        return;
      }
      if (!deliveryNeighborhood.trim()) {
        toast({ title: "Bairro é obrigatório para delivery", variant: "destructive" });
        return;
      }
    }

    setCreating(true);
    try {
      // Build order payload
      const orderData: Record<string, unknown> = { type: orderType };

      if (tableId) orderData.tableId = parseInt(tableId);
      if (customerId) orderData.customerId = parseInt(customerId);
      if (orderNotes.trim()) orderData.notes = orderNotes.trim();

      if (orderType === "delivery") {
        // All delivery fields
        orderData.customerName = customerName.trim();
        orderData.customerPhone = customerPhone.trim();
        if (deliveryCep.trim()) orderData.deliveryCep = deliveryCep.trim();
        orderData.deliveryAddress = deliveryAddress.trim();
        orderData.deliveryNeighborhood = deliveryNeighborhood.trim();
        if (deliveryReference.trim()) orderData.deliveryReference = deliveryReference.trim();
        if (deliveryNotes.trim()) orderData.deliveryNotes = deliveryNotes.trim();
        orderData.deliveryFee = parsedFee;
      } else if (orderType === "takeaway") {
        // Takeaway: name and phone optional
        if (customerName.trim()) orderData.customerName = customerName.trim();
        if (customerPhone.trim()) orderData.customerPhone = customerPhone.trim();
      }

      const order = await new Promise<{ id: number }>((resolve, reject) => {
        createOrder.mutate(
          { data: orderData as unknown as Parameters<typeof createOrder.mutate>[0]["data"] },
          { onSuccess: (o) => resolve(o), onError: (e) => reject(e) }
        );
      });

      for (const item of cart) {
        await new Promise<void>((resolve, reject) => {
          addItem.mutate(
            {
              id: order.id,
              data: {
                productId: item.productId,
                quantity: item.quantity,
                ...(item.notes.trim() ? { notes: item.notes.trim() } : {}),
              },
            },
            { onSuccess: () => resolve(), onError: (e) => reject(e) }
          );
        });
      }

      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
      toast({ title: "Pedido criado com sucesso!" });
      setLocation(`/orders/${order.id}`);
    } catch {
      toast({ title: "Erro ao criar pedido. Tente novamente.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const ORDER_TYPES: { value: OrderType; label: string }[] = [
    { value: "counter", label: "🍽 Balcão" },
    { value: "table", label: "🪑 Mesa" },
    { value: "takeaway", label: "🛵 Viagem" },
    { value: "delivery", label: "🚚 Delivery" },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Novo Pedido</h1>
          <p className="text-muted-foreground mt-1">Configure o pedido e adicione itens</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Esquerda: Configuração + Cardápio */}
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <CardContent className="p-5 space-y-4">
                {/* Tipo de pedido */}
                <div>
                  <Label className="mb-2 block text-sm font-medium">Tipo de Pedido</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {ORDER_TYPES.map((t) => (
                      <Button
                        key={t.value}
                        variant={orderType === t.value ? "default" : "outline"}
                        onClick={() => {
                          setOrderType(t.value);
                          if (t.value !== "table") setTableId("");
                        }}
                        className="w-full text-sm"
                        data-testid={`button-type-${t.value}`}
                      >
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Mesa */}
                {orderType === "table" && (
                  <div>
                    <Label>Mesa *</Label>
                    <Select value={tableId || "none"} onValueChange={(v) => setTableId(v === "none" ? "" : v)}>
                      <SelectTrigger data-testid="select-table">
                        <SelectValue placeholder="Selecionar mesa disponível" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecionar mesa</SelectItem>
                        {tables?.filter((t) => t.status === "available").map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            Mesa {t.number} · {t.capacity} lugares
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Campos de Delivery */}
                {orderType === "delivery" && (
                  <div className="space-y-3 border rounded-lg p-4 bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800">
                    <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 font-semibold text-sm">
                      <Truck className="w-4 h-4" />
                      Dados de Entrega
                    </div>

                    {/* Nome + Telefone */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Nome do Cliente *</Label>
                        <Input
                          placeholder="Nome completo"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          data-testid="input-customer-name"
                        />
                      </div>
                      <div>
                        <Label>Telefone *</Label>
                        <Input
                          placeholder="(11) 99999-9999"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          data-testid="input-customer-phone"
                        />
                      </div>
                    </div>

                    {/* CEP + Taxa */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>CEP</Label>
                        <Input
                          placeholder="00000-000"
                          value={deliveryCep}
                          onChange={(e) => setDeliveryCep(e.target.value)}
                          data-testid="input-delivery-cep"
                          maxLength={9}
                        />
                      </div>
                      <div>
                        <Label>Taxa de Entrega (R$)</Label>
                        <Input
                          type="number"
                          step="0.50"
                          min="0"
                          placeholder="0,00"
                          value={deliveryFee}
                          onChange={(e) => setDeliveryFee(e.target.value)}
                          data-testid="input-delivery-fee"
                        />
                      </div>
                    </div>

                    {/* Endereço */}
                    <div>
                      <Label>Endereço Completo *</Label>
                      <Input
                        placeholder="Rua, número"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        data-testid="input-delivery-address"
                      />
                    </div>

                    {/* Bairro + Complemento */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Bairro *</Label>
                        <Input
                          placeholder="Bairro"
                          value={deliveryNeighborhood}
                          onChange={(e) => setDeliveryNeighborhood(e.target.value)}
                          data-testid="input-delivery-neighborhood"
                        />
                      </div>
                      <div>
                        <Label>Complemento / Referência</Label>
                        <Input
                          placeholder="Apto, ponto de referência..."
                          value={deliveryReference}
                          onChange={(e) => setDeliveryReference(e.target.value)}
                          data-testid="input-delivery-reference"
                        />
                      </div>
                    </div>

                    {/* Observação entrega */}
                    <div>
                      <Label>Observação da Entrega</Label>
                      <Textarea
                        placeholder="Ex: ligar ao chegar, portão verde..."
                        value={deliveryNotes}
                        onChange={(e) => setDeliveryNotes(e.target.value)}
                        rows={2}
                        data-testid="input-delivery-notes"
                      />
                    </div>
                  </div>
                )}

                {/* Campos de Takeaway (nome/tel opcionais) */}
                {orderType === "takeaway" && (
                  <div className="space-y-3 border rounded-lg p-4 bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                    <div className="text-blue-700 dark:text-blue-400 font-semibold text-sm">
                      🛵 Dados para Retirada (opcional)
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Nome (opcional)</Label>
                        <Input
                          placeholder="Nome do cliente"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          data-testid="input-takeaway-name"
                        />
                      </div>
                      <div>
                        <Label>Telefone (opcional)</Label>
                        <Input
                          placeholder="(11) 99999-9999"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          data-testid="input-takeaway-phone"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Cliente registrado — apenas balcão / mesa */}
                {(orderType === "counter" || orderType === "table") && (
                  <div>
                    <Label>Cliente (opcional)</Label>
                    <Select value={customerId || "none"} onValueChange={(v) => setCustomerId(v === "none" ? "" : v)}>
                      <SelectTrigger data-testid="select-customer">
                        <SelectValue placeholder="Selecionar cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem cliente identificado</SelectItem>
                        {customers?.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}{c.phone ? ` · ${c.phone}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Observação geral */}
                <div>
                  <Label>Observações do Pedido (opcional)</Label>
                  <Textarea
                    placeholder="Ex: sem cebola, alergia a amendoim..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    rows={2}
                    data-testid="input-order-notes"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Cardápio */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produto..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-product"
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant={categoryFilter === "all" ? "default" : "outline"}
                  onClick={() => setCategoryFilter("all")}
                >
                  Todos
                </Button>
                {categories?.map((cat) => (
                  <Button
                    key={cat.id}
                    size="sm"
                    variant={categoryFilter === String(cat.id) ? "default" : "outline"}
                    onClick={() => setCategoryFilter(String(cat.id))}
                    data-testid={`filter-cat-${cat.id}`}
                  >
                    {cat.name}
                  </Button>
                ))}
              </div>

              {loadingProducts ? (
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {products?.filter((p) => p.available).map((product) => {
                    const inCart = cart.find((i) => i.productId === product.id);
                    return (
                      <Card
                        key={product.id}
                        className={`cursor-pointer hover:shadow-md transition-all select-none ${inCart ? "ring-2 ring-primary bg-primary/5" : ""}`}
                        onClick={() => addToCart(product)}
                        data-testid={`card-product-${product.id}`}
                      >
                        <CardContent className="p-3">
                          <p className="font-medium text-sm line-clamp-2 mb-1">{product.name}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-primary font-bold text-sm">R$ {product.price.toFixed(2)}</span>
                            {inCart ? (
                              <Badge className="text-xs">{inCart.quantity}x</Badge>
                            ) : (
                              <Plus className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {products?.filter((p) => p.available).length === 0 && (
                    <div className="col-span-3 text-center py-8 text-muted-foreground text-sm">
                      Nenhum produto encontrado
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Direita: Carrinho */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ShoppingCart className="w-5 h-5 text-primary" />
                  <h2 className="font-semibold text-lg">Resumo do Pedido</h2>
                  {cartCount > 0 && <Badge>{cartCount}</Badge>}
                </div>

                {cart.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Clique nos produtos para adicionar</p>
                  </div>
                ) : (
                  <div className="space-y-4 mb-4 max-h-72 overflow-y-auto pr-1">
                    {cart.map((item) => (
                      <div key={item.productId} data-testid={`cart-item-${item.productId}`} className="border-b pb-3 last:border-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.quantity}x R$ {item.price.toFixed(2)} = <span className="font-semibold text-foreground">R$ {(item.price * item.quantity).toFixed(2)}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0"
                              onClick={() => removeFromCart(item.productId)}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0"
                              onClick={() => addToCart({ id: item.productId, name: item.name, price: item.price })}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-muted-foreground shrink-0" />
                          <Input
                            placeholder="Observação (ex: sem sal)"
                            value={item.notes}
                            onChange={(e) => updateItemNotes(item.productId, e.target.value)}
                            className="h-6 text-xs px-2 py-0"
                            data-testid={`cart-item-notes-${item.productId}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Totais */}
                {cart.length > 0 && (
                  <div className="border-t pt-3 mb-4 space-y-1.5">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Subtotal dos itens</span>
                      <span>R$ {cartSubtotal.toFixed(2)}</span>
                    </div>
                    {orderType === "delivery" && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Taxa de entrega</span>
                        <span className={parsedFee > 0 ? "text-orange-600 dark:text-orange-400 font-medium" : ""}>
                          {parsedFee > 0 ? `R$ ${parsedFee.toFixed(2)}` : "—"}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-xl border-t pt-1.5 mt-1">
                      <span>Total</span>
                      <span className="text-primary">R$ {cartTotal.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleCreate}
                  disabled={creating || cart.length === 0}
                  data-testid="button-create-order"
                >
                  {creating
                    ? "Criando pedido..."
                    : cart.length === 0
                    ? "Adicione itens"
                    : `Confirmar Pedido · R$ ${cartTotal.toFixed(2)}`}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
