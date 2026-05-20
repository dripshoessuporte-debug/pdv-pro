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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, ShoppingCart, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CartItem = { productId: number; name: string; price: number; quantity: number };

export default function NewOrder() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const preselectedTableId = params.get("tableId");

  const [orderType, setOrderType] = useState<"table" | "counter" | "takeaway">("counter");
  const [tableId, setTableId] = useState(preselectedTableId ?? "");
  const [customerId, setCustomerId] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [creating, setCreating] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tables } = useListTables({ query: { queryKey: getListTablesQueryKey() } });
  const { data: customers } = useListCustomers({}, { query: { queryKey: getListCustomersQueryKey({}) } });
  const { data: categories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });

  const productParams: Record<string, unknown> = {};
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

  const addToCart = (product: NonNullable<typeof products>[number]) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { productId: product.id, name: product.name, price: product.price, quantity: 1 }];
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

  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const handleCreate = async () => {
    if (cart.length === 0) {
      toast({ title: "Adicione pelo menos um item ao pedido", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const orderData: Record<string, unknown> = { type: orderType };
      if (tableId) orderData.tableId = parseInt(tableId);
      if (customerId) orderData.customerId = parseInt(customerId);

      const order = await new Promise<{ id: number }>((resolve, reject) => {
        createOrder.mutate({ data: orderData as Parameters<typeof createOrder.mutate>[0]["data"] }, {
          onSuccess: (o) => resolve(o),
          onError: (e) => reject(e),
        });
      });

      for (const item of cart) {
        await new Promise<void>((resolve, reject) => {
          addItem.mutate(
            { id: order.id, data: { productId: item.productId, quantity: item.quantity } },
            { onSuccess: () => resolve(), onError: (e) => reject(e) }
          );
        });
      }

      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
      toast({ title: "Pedido criado com sucesso" });
      setLocation(`/orders/${order.id}`);
    } catch {
      toast({ title: "Erro ao criar pedido", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Novo Pedido</h1>
          <p className="text-muted-foreground mt-1">Configure o pedido e adicione itens</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Config + Menu */}
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {(["counter", "table", "takeaway"] as const).map((t) => (
                    <Button
                      key={t}
                      variant={orderType === t ? "default" : "outline"}
                      onClick={() => setOrderType(t)}
                      className="w-full"
                      data-testid={`button-type-${t}`}
                    >
                      {t === "counter" ? "Balcao" : t === "table" ? "Mesa" : "Viagem"}
                    </Button>
                  ))}
                </div>

                {orderType === "table" && (
                  <div>
                    <Label>Mesa</Label>
                    <Select value={tableId} onValueChange={setTableId}>
                      <SelectTrigger data-testid="select-table">
                        <SelectValue placeholder="Selecionar mesa" />
                      </SelectTrigger>
                      <SelectContent>
                        {tables?.filter((t) => t.status === "available").map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            Mesa {t.number} ({t.capacity} lugares)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label>Cliente (opcional)</Label>
                  <Select value={customerId || "none"} onValueChange={(v) => setCustomerId(v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="select-customer">
                      <SelectValue placeholder="Selecionar cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem cliente</SelectItem>
                      {customers?.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Menu */}
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
                <Button size="sm" variant={categoryFilter === "all" ? "default" : "outline"} onClick={() => setCategoryFilter("all")}>
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
                        className={`cursor-pointer hover:shadow-md transition-all ${inCart ? "ring-2 ring-primary" : ""}`}
                        onClick={() => addToCart(product)}
                        data-testid={`card-product-${product.id}`}
                      >
                        <CardContent className="p-3">
                          <p className="font-medium text-sm line-clamp-2 mb-1">{product.name}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-primary font-bold text-sm">R$ {product.price.toFixed(2)}</span>
                            {inCart && (
                              <Badge variant="secondary" className="text-xs">{inCart.quantity}</Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: Cart */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ShoppingCart className="w-5 h-5 text-primary" />
                  <h2 className="font-semibold text-lg">Pedido</h2>
                  {cartCount > 0 && <Badge>{cartCount}</Badge>}
                </div>

                {cart.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    Adicione itens ao pedido
                  </p>
                ) : (
                  <div className="space-y-3 mb-4">
                    {cart.map((item) => (
                      <div key={item.productId} className="flex items-center justify-between gap-2" data-testid={`cart-item-${item.productId}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">R$ {(item.price * item.quantity).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => removeFromCart(item.productId)}>
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="text-sm font-medium w-5 text-center">{item.quantity}</span>
                          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => addToCart({ id: item.productId, name: item.name, price: item.price } as any)}>
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {cart.length > 0 && (
                  <div className="border-t pt-3 mb-4">
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span>R$ {cartTotal.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={creating || cart.length === 0}
                  data-testid="button-create-order"
                >
                  {creating ? "Criando..." : "Confirmar Pedido"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
