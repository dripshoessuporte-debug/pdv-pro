import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useListOrders,
  getListOrdersQueryKey,
  getGetAlertsQueryKey,
  useCancelOrder,
  useSendOrderToKitchen,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  ChevronRight,
  SendHorizonal,
  X,
  CreditCard,
  CalendarDays,
  Truck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OrderTimeBadge } from "@/components/order-time-badge";
import { compareNewestFirst } from "@/lib/time";

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  preparing: "Preparando",
  ready: "Pronto",
  closed: "Pago",
  cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  preparing:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  ready: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  closed: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando",
  preparing: "Em preparo",
  ready: "Pronto p/ entrega",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  awaiting_settlement: "Aguard. baixa financeira",
};

const DELIVERY_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  preparing: "bg-amber-100 text-amber-800",
  ready: "bg-green-100 text-green-800",
  out_for_delivery: "bg-blue-100 text-blue-800",
  delivered: "bg-purple-100 text-purple-800",
  awaiting_settlement: "bg-red-100 text-red-800",
};

const TYPE_LABELS: Record<string, string> = {
  table: "Mesa",
  counter: "Balcão",
  takeaway: "Viagem",
  delivery: "Delivery",
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
  ifood: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  whatsapp:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  site: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  totem:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  garcom: "bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-400",
  api_externa:
    "bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-400",
};

const STATUS_FILTERS = [
  "all",
  "open",
  "preparing",
  "ready",
  "closed",
  "cancelled",
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

type PeriodFilter = "today" | "yesterday" | "week" | "month" | "all";

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  week: "Esta semana",
  month: "Este mês",
  all: "Todos",
};

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function startOfWeek(d: Date) {
  const c = startOfDay(d);
  const day = c.getDay();
  c.setDate(c.getDate() - day);
  return c;
}

function startOfMonth(d: Date) {
  const c = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  return c;
}

function filterByPeriod(orders: { createdAt: string }[], period: PeriodFilter) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  return orders.filter((o) => {
    const d = new Date(o.createdAt);
    if (period === "today") return d >= todayStart;
    if (period === "yesterday") return d >= yesterdayStart && d < todayStart;
    if (period === "week") return d >= weekStart;
    if (period === "month") return d >= monthStart;
    return true;
  });
}

function formatGroupDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (d >= todayStart) return "Hoje";
  if (d >= yesterdayStart) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const PAYABLE = ["open", "preparing", "ready"];

const htmlErrorMessage =
  "A API retornou erro interno. Verifique os logs do Railway.";

type OrderListItem = {
  productName?: string | null;
  displayName?: string | null;
  externalProductName?: string | null;
  itemType?: string | null;
  flavors?: unknown[];
  quantity: number;
};

const isMultisaborItem = (item: OrderListItem) =>
  item.itemType === "multisabor" ||
  item.itemType === "pizza_multi_flavor" ||
  (Array.isArray(item.flavors) && item.flavors.length > 0);

const getItemDisplayName = (item: OrderListItem) =>
  item.displayName?.trim() ||
  item.externalProductName?.trim() ||
  item.productName?.trim() ||
  (isMultisaborItem(item) ? "Pizza Multisabor" : "Item sem nome");

const looksLikeHtml = (value: string) =>
  /<!doctype html|<html[\s>]|<body[\s>]|<pre[\s>]/i.test(value);

function extractListErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const data =
      "data" in error ? (error as { data?: unknown }).data : undefined;
    if (typeof data === "string" && looksLikeHtml(data))
      return htmlErrorMessage;
    if (data && typeof data === "object") {
      const message =
        (data as { error?: unknown; message?: unknown; detail?: unknown })
          .error ??
        (data as { error?: unknown; message?: unknown; detail?: unknown })
          .message ??
        (data as { error?: unknown; message?: unknown; detail?: unknown })
          .detail;
      if (typeof message === "string" && message.trim()) {
        return looksLikeHtml(message) ? htmlErrorMessage : message;
      }
    }

    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return looksLikeHtml(message) ? htmlErrorMessage : message;
    }
  }

  if (typeof error === "string" && error.trim()) {
    return looksLikeHtml(error) ? htmlErrorMessage : error;
  }

  return "Erro ao carregar pedidos.";
}

export default function Orders() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [period, setPeriod] = useState<PeriodFilter>("today");
  const [typeFilter, setTypeFilter] = useState<"all" | "local" | "delivery">(
    "all",
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const {
    data: allOrders,
    isLoading,
    isError,
    error,
    refetch,
  } = useListOrders(undefined, {
    query: {
      queryKey: getListOrdersQueryKey(),
      refetchInterval: 20_000,
    },
  });

  const periodOrders = useMemo(() => {
    if (!allOrders) return [];
    return filterByPeriod(allOrders, period) as typeof allOrders;
  }, [allOrders, period]);

  const typeFilteredList = useMemo(() => {
    if (typeFilter === "delivery")
      return periodOrders.filter((o) => o.type === "delivery");
    if (typeFilter === "local")
      return periodOrders.filter((o) => o.type !== "delivery");
    return periodOrders;
  }, [periodOrders, typeFilter]);

  const statusCounts = useMemo(() => {
    return typeFilteredList.reduce(
      (acc, o) => {
        acc[o.status] = (acc[o.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }, [typeFilteredList]);

  const displayed = useMemo(() => {
    const filtered =
      statusFilter === "all"
        ? typeFilteredList
        : typeFilteredList.filter((o) => o.status === statusFilter);
    return [...filtered].sort(compareNewestFirst);
  }, [typeFilteredList, statusFilter]);

  // Group by date only in "all" period
  const groupedDisplayed = useMemo(() => {
    if (period !== "all") return null;
    const groups: { label: string; orders: typeof displayed }[] = [];
    const map = new Map<string, typeof displayed>();
    for (const o of displayed) {
      const label = formatGroupDate(o.createdAt);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(o);
    }
    map.forEach((orders, label) => groups.push({ label, orders }));
    return groups;
  }, [displayed, period]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(displayed.map((o) => o.id)));
  };

  const bulkSendToKitchen = async () => {
    const eligible = displayed.filter(
      (o) => selectedIds.has(o.id) && o.status === "open" && o.items.length > 0,
    );
    if (eligible.length === 0) {
      toast({
        title: "Nenhum pedido aberto com itens selecionado",
        variant: "destructive",
      });
      return;
    }
    setBulkLoading(true);
    try {
      await Promise.all(
        eligible.map((o) => sendToKitchen.mutateAsync({ id: o.id })),
      );
      setSelectedIds(new Set());
      invalidateAll();
      toast({ title: `${eligible.length} pedido(s) enviados para a cozinha!` });
    } catch {
      toast({ title: "Erro ao enviar pedidos", variant: "destructive" });
    } finally {
      setBulkLoading(false);
    }
  };

  const bulkCancel = async () => {
    const eligible = displayed.filter(
      (o) => selectedIds.has(o.id) && PAYABLE.includes(o.status),
    );
    if (eligible.length === 0) {
      toast({
        title: "Nenhum pedido cancelável selecionado",
        variant: "destructive",
      });
      return;
    }
    setBulkLoading(true);
    try {
      await Promise.all(eligible.map((o) => cancel.mutateAsync({ id: o.id })));
      setSelectedIds(new Set());
      invalidateAll();
      toast({ title: `${eligible.length} pedido(s) cancelado(s)!` });
    } catch {
      toast({ title: "Erro ao cancelar pedidos", variant: "destructive" });
    } finally {
      setBulkLoading(false);
    }
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

  const renderOrder = (order: (typeof displayed)[number]) => {
    const isDelivery = order.type === "delivery";
    const deliveryFee = order.deliveryFee ?? 0;
    const isSelected = selectedIds.has(order.id);
    return (
      <Card
        key={order.id}
        className={`hover:shadow-md transition-shadow ${isSelected ? "ring-2 ring-primary/40 bg-blue-50/40 dark:bg-blue-900/10" : ""}`}
        data-testid={`card-order-${order.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {/* Checkbox */}
            <button
              onClick={() => toggleSelect(order.id)}
              className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors self-start mt-1 ${isSelected ? "bg-primary border-primary" : "border-[#CBD5E1] hover:border-primary"}`}
              title={isSelected ? "Desmarcar" : "Selecionar"}
              data-testid={`checkbox-order-${order.id}`}
            >
              {isSelected && (
                <svg
                  viewBox="0 0 10 8"
                  className="w-2.5 h-2"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M1 4l2.5 2.5L9 1"
                    stroke="white"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
            <div className="flex-1 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="font-semibold text-lg">#{order.id}</p>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[order.status] ?? ""}`}
                  >
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>

                  {isDelivery ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-700 flex items-center gap-1">
                      <Truck className="w-3 h-3" /> Delivery
                    </span>
                  ) : (
                    order.type && (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {TYPE_LABELS[order.type] ?? order.type}
                      </span>
                    )
                  )}

                  {isDelivery && order.deliveryStatus && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${DELIVERY_STATUS_COLORS[order.deliveryStatus] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {DELIVERY_STATUS_LABELS[order.deliveryStatus] ??
                        order.deliveryStatus}
                    </span>
                  )}
                  {order.source && SOURCE_LABELS[order.source] && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${SOURCE_COLORS[order.source] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {SOURCE_LABELS[order.source]}
                    </span>
                  )}
                </div>

                <p className="text-sm text-muted-foreground truncate">
                  {[
                    order.tableNumber ? `Mesa ${order.tableNumber}` : null,
                    order.customerName ?? null,
                    isDelivery && order.customerPhone
                      ? `📞 ${order.customerPhone}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || (!isDelivery ? "Sem identificação" : null)}
                </p>

                {isDelivery && order.deliveryAddress && (
                  <p className="text-xs text-muted-foreground truncate">
                    📍 {order.deliveryAddress}
                    {order.deliveryNeighborhood
                      ? ` · ${order.deliveryNeighborhood}`
                      : ""}
                  </p>
                )}

                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {order.items.length}{" "}
                    {order.items.length === 1 ? "item" : "itens"}
                  </span>
                  <span className="text-slate-300">·</span>
                  <OrderTimeBadge
                    createdAt={order.createdAt}
                    showIcon={false}
                  />
                  {isDelivery && deliveryFee > 0 && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span>Taxa R$ {deliveryFee.toFixed(2)}</span>
                    </>
                  )}
                  {isDelivery && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span>
                        {order.paymentTiming === "on_delivery"
                          ? "pagar na entrega"
                          : "pago agora"}
                      </span>
                    </>
                  )}
                </div>
                {order.items.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground truncate">
                    {order.items
                      .slice(0, 3)
                      .map((item) => `${item.quantity}x ${getItemDisplayName(item)}`)
                      .join(" · ")}
                    {order.items.length > 3 ? " · ..." : ""}
                  </p>
                )}

                {order.notes && (
                  <p className="text-xs text-muted-foreground italic mt-0.5 truncate">
                    💬 {order.notes}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <p className="font-bold text-lg">
                  R$ {order.totalAmount.toFixed(2)}
                </p>

                {order.status === "open" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sendToKitchen.mutate({ id: order.id })}
                    disabled={
                      sendToKitchen.isPending || order.items.length === 0
                    }
                    title="Enviar para cozinha"
                    data-testid={`button-send-kitchen-${order.id}`}
                  >
                    <SendHorizonal className="w-4 h-4" />
                  </Button>
                )}

                {!order.paidAt && PAYABLE.includes(order.status) && (
                  <Button
                    size="sm"
                    onClick={() => setLocation(`/payments/${order.id}`)}
                    disabled={order.items.length === 0}
                    data-testid={`button-pay-${order.id}`}
                  >
                    <CreditCard className="w-3.5 h-3.5 mr-1" /> Pagar
                  </Button>
                )}

                {!order.paidAt && PAYABLE.includes(order.status) && (
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
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pedidos</h1>
            <p className="text-muted-foreground mt-1">
              {displayed.length} pedido{displayed.length !== 1 ? "s" : ""}{" "}
              encontrado
              {displayed.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button asChild data-testid="button-new-order">
            <Link href="/orders/new">
              <Plus className="w-4 h-4 mr-2" /> Novo Pedido
            </Link>
          </Button>
        </div>

        {/* ── Tipo + Período ── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Tipo de pedido */}
          <div className="flex items-center gap-0.5 bg-muted/40 rounded-xl p-1">
            {(["all", "local", "delivery"] as const).map((key) => {
              const label =
                key === "all"
                  ? "Todos"
                  : key === "local"
                    ? "Local"
                    : "Delivery";
              const count =
                key === "all"
                  ? periodOrders.length
                  : key === "delivery"
                    ? periodOrders.filter((o) => o.type === "delivery").length
                    : periodOrders.filter((o) => o.type !== "delivery").length;
              const active = typeFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    setTypeFilter(key);
                    setSelectedIds(new Set());
                  }}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${active ? "bg-white shadow-sm text-[#0F172A] dark:bg-background dark:text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  data-testid={`tab-type-${key}`}
                >
                  {key === "delivery" && <Truck className="w-3 h-3" />}
                  {label}
                  {count > 0 && (
                    <span
                      className={`text-xs font-semibold rounded-full px-1.5 leading-5 min-w-[1.2rem] text-center ${active ? "bg-[#0F172A] text-white dark:bg-foreground dark:text-background" : "bg-muted text-muted-foreground"}`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Separador */}
          <div className="h-6 w-px bg-border hidden sm:block" />

          {/* Período */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {(
              ["today", "yesterday", "week", "month", "all"] as PeriodFilter[]
            ).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                data-testid={`period-${p}`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Filtros de status ── */}
        <div className="flex gap-1.5 flex-wrap items-center">
          {STATUS_FILTERS.map((f) => {
            const count =
              f === "all" ? typeFilteredList.length : (statusCounts[f] ?? 0);
            const active = statusFilter === f;
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-background"}`}
                data-testid={`filter-${f}`}
              >
                {f === "all" ? "Todos" : STATUS_LABELS[f]}
                {count > 0 && (
                  <span
                    className={`text-xs rounded-full px-1.5 leading-5 min-w-[1.2rem] text-center font-semibold ${active ? "bg-white/20" : "bg-muted"}`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Seleção em massa ── */}
        {displayed.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap -mt-2">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="btn-select-all"
            >
              <div
                className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${selectedIds.size > 0 && selectedIds.size === displayed.length ? "bg-primary border-primary" : "border-[#CBD5E1] hover:border-primary"}`}
              >
                {selectedIds.size > 0 &&
                  selectedIds.size === displayed.length && (
                    <svg
                      viewBox="0 0 10 8"
                      className="w-2.5 h-2"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M1 4l2.5 2.5L9 1"
                        stroke="white"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                {selectedIds.size > 0 &&
                  selectedIds.size < displayed.length && (
                    <div className="w-2 h-0.5 bg-primary rounded" />
                  )}
              </div>
              <span>
                {selectedIds.size === 0
                  ? "Selecionar todos"
                  : `${selectedIds.size} selecionado${selectedIds.size !== 1 ? "s" : ""}`}
              </span>
            </button>
            {selectedIds.size > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  onClick={bulkSendToKitchen}
                  disabled={bulkLoading}
                  data-testid="btn-bulk-kitchen"
                >
                  <SendHorizonal className="w-3.5 h-3.5" /> Enviar p/ cozinha
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50"
                  onClick={bulkCancel}
                  disabled={bulkLoading}
                  data-testid="btn-bulk-cancel"
                >
                  <X className="w-3.5 h-3.5" /> Cancelar selecionados
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs ml-auto text-muted-foreground"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Limpar seleção
                </Button>
              </>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div
            className="text-center py-16 text-muted-foreground"
            data-testid="orders-error-state"
          >
            <p className="text-lg font-medium text-destructive">
              Erro ao carregar pedidos
            </p>
            <p className="text-sm mt-1">{extractListErrorMessage(error)}</p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => refetch()}
            >
              Tentar novamente
            </Button>
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">Nenhum pedido encontrado</p>
            <p className="text-sm mt-1">
              {period === "today" ? "Nenhum pedido hoje ainda. " : ""}
              Crie um novo pedido para começar.
            </p>
          </div>
        ) : groupedDisplayed ? (
          /* Grouped by date when period = "all" */
          <div className="space-y-6">
            {groupedDisplayed.map(({ label, orders }) => (
              <div key={label}>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {label}
                  </h2>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">
                    {orders.length} pedido{orders.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-3">{orders.map(renderOrder)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">{displayed.map(renderOrder)}</div>
        )}
      </div>
    </Layout>
  );
}
