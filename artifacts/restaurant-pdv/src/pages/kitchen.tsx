import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import {
  useGetKitchenQueue,
  getGetKitchenQueueQueryKey,
  useMarkTicketReady,
  useBulkReadyKitchenTickets,
  useBulkCancelKitchenTickets,
  getListOrdersQueryKey,
  getGetAlertsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle2,
  ChefHat,
  Clock,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OrderDetailDialog } from "@/components/order-detail-dialog";
import { OrderTimeBadge } from "@/components/order-time-badge";
import { formatOrderTime } from "@/lib/time";

function useElapsed(createdAt: string) {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(
        Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000),
      );
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
  const label =
    mins > 0 ? `${mins}m ${secs.toString().padStart(2, "0")}s` : `${secs}s`;

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
  addonPrice?: number;
  totalPrice?: number;
};

type KitchenTicketItem = {
  id: number;
  productName: string | null;
  displayName?: string | null;
  itemType?: string | null;
  pizzaSizeName?: string | null;
  flavors?: Array<{
    productName: string;
    tierName?: string | null;
    fractionNumerator: number;
    fractionDenominator: number;
  }>;
  quantity: number;
  totalPrice: number;
  notes?: string | null;
  variantName?: string | null;
  addons?: KitchenTicketItemAddon[];
};

const isMultisaborItem = (item: KitchenTicketItem) =>
  item.itemType === "multisabor" ||
  item.itemType === "pizza_multi_flavor" ||
  (Array.isArray(item.flavors) && item.flavors.length > 0);

const getItemDisplayName = (item: KitchenTicketItem) =>
  item.displayName?.trim() ||
  item.productName?.trim() ||
  (isMultisaborItem(item) ? "Pizza Multisabor" : "Item sem nome");

function formatAddonDetails(item: KitchenTicketItem) {
  if (!Array.isArray(item.addons)) return [];

  return item.addons.map((addon) => {
    const group = addon.addonGroupName?.trim();
    const prefix = group ? `${group}: ` : "";
    const quantity = addon.quantity > 1 ? ` x${addon.quantity}` : "";
    return `${prefix}${addon.addonName}${quantity}`;
  });
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

type KitchenSortOrder = "latest" | "oldest";
const KITCHEN_SORT_STORAGE_KEY = "pdv.kitchen.sortOrder";

export default function Kitchen() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [isOrderDetailOpen, setIsOrderDetailOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<KitchenSortOrder>(() => {
    if (typeof window === "undefined") return "latest";
    const stored = window.localStorage.getItem(KITCHEN_SORT_STORAGE_KEY);
    return stored === "oldest" ? "oldest" : "latest";
  });

  const openOrderDetail = (orderId: number) => {
    setSelectedOrderId(orderId);
    setIsOrderDetailOpen(true);
  };

  const {
    data: tickets,
    isLoading,
    dataUpdatedAt,
  } = useGetKitchenQueue({
    query: {
      queryKey: getGetKitchenQueueQueryKey(),
      refetchInterval: 15_000,
    },
  });

  const invalidateOperationalQueries = () => {
    queryClient.invalidateQueries({ queryKey: getGetKitchenQueueQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["/api/delivery/routes"] });
    queryClient.invalidateQueries({
      queryKey: ["/api/delivery/orders/awaiting-settlement"],
    });
  };

  const markReady = useMarkTicketReady({
    mutation: {
      onSuccess: () => {
        invalidateOperationalQueries();
        toast({ title: "✅ Pedido marcado como pronto!" });
      },
    },
  });

  const bulkReady = useBulkReadyKitchenTickets({
    mutation: {
      onSuccess: (result) => {
        setSelectedTicketIds(new Set());
        invalidateOperationalQueries();
        toast({
          title: `✅ ${result.updatedCount} ${
            result.updatedCount === 1 ? "pedido marcado" : "pedidos marcados"
          } como pronto!`,
        });
      },
      onError: () => {
        toast({
          title: "Não foi possível marcar os pedidos como prontos",
          variant: "destructive",
        });
      },
    },
  });

  const bulkCancel = useBulkCancelKitchenTickets({
    mutation: {
      onSuccess: (result) => {
        setSelectedTicketIds(new Set());
        invalidateOperationalQueries();
        toast({
          title: `${result.cancelledCount} ${
            result.cancelledCount === 1
              ? "pedido cancelado"
              : "pedidos cancelados"
          } na cozinha`,
        });
      },
      onError: () => {
        toast({
          title: "Não foi possível cancelar os pedidos selecionados",
          variant: "destructive",
        });
      },
    },
  });

  useEffect(() => {
    window.localStorage.setItem(KITCHEN_SORT_STORAGE_KEY, sortOrder);
  }, [sortOrder]);

  const sortedTickets = useMemo(() => {
    return [...(tickets ?? [])].sort((a, b) => {
      const aTime = new Date(a.orderCreatedAt ?? a.createdAt).getTime();
      const bTime = new Date(b.orderCreatedAt ?? b.createdAt).getTime();
      return sortOrder === "latest" ? bTime - aTime : aTime - bTime;
    });
  }, [tickets, sortOrder]);

  useEffect(() => {
    const visibleTicketIds = new Set(
      (tickets ?? []).map((ticket) => ticket.id),
    );
    setSelectedTicketIds((current) => {
      const next = new Set(
        Array.from(current).filter((ticketId) =>
          visibleTicketIds.has(ticketId),
        ),
      );
      return next.size === current.size ? current : next;
    });
  }, [tickets]);

  const allVisibleTicketIds = useMemo(
    () => sortedTickets.map((ticket) => ticket.id),
    [sortedTickets],
  );
  const selectedCount = selectedTicketIds.size;
  const allSelected =
    allVisibleTicketIds.length > 0 &&
    allVisibleTicketIds.every((ticketId) => selectedTicketIds.has(ticketId));
  const isBulkActionPending = bulkReady.isPending || bulkCancel.isPending;

  const toggleTicketSelection = (ticketId: number) => {
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      if (next.has(ticketId)) {
        next.delete(ticketId);
      } else {
        next.add(ticketId);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedTicketIds(new Set());

  const toggleSelectAll = () => {
    if (allSelected) {
      clearSelection();
      return;
    }
    setSelectedTicketIds(new Set(allVisibleTicketIds));
  };

  const selectedTicketIdList = () => Array.from(selectedTicketIds);

  const handleBulkReady = () => {
    const ticketIds = selectedTicketIdList();
    if (ticketIds.length === 0) return;
    bulkReady.mutate({ data: { ticketIds } });
  };

  const handleBulkCancel = () => {
    const ticketIds = selectedTicketIdList();
    if (ticketIds.length === 0) return;
    const confirmed = window.confirm(
      `Tem certeza que deseja cancelar ${ticketIds.length} ${
        ticketIds.length === 1 ? "pedido" : "pedidos"
      } da cozinha?`,
    );
    if (!confirmed) return;

    bulkCancel.mutate({
      data: { ticketIds, reason: "cancelado na cozinha" },
    });
  };

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
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <ChefHat className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Cozinha</h1>
              <p className="text-muted-foreground mt-0.5">
                {tickets?.length ?? 0}{" "}
                {tickets?.length === 1
                  ? "pedido pendente"
                  : "pedidos pendentes"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm">
              <span className="px-2 text-xs font-semibold text-slate-500">
                Ordenar:
              </span>
              <Button
                type="button"
                size="sm"
                variant={sortOrder === "latest" ? "default" : "ghost"}
                className="h-8 rounded-lg px-3 text-xs font-bold"
                onClick={() => setSortOrder("latest")}
                data-testid="button-sort-latest"
              >
                Último
              </Button>
              <Button
                type="button"
                size="sm"
                variant={sortOrder === "oldest" ? "default" : "ghost"}
                className="h-8 rounded-lg px-3 text-xs font-bold"
                onClick={() => setSortOrder("oldest")}
                data-testid="button-sort-oldest"
              >
                Primeiro
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="w-3 h-3" />
              <span>Atualizado às {lastUpdate} · auto-refresh 15s</span>
            </div>
          </div>
        </div>

        {!isLoading && sortedTickets.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={allSelected ? "secondary" : "outline"}
                size="sm"
                onClick={toggleSelectAll}
                disabled={isBulkActionPending}
                data-testid="button-select-all-tickets"
              >
                {allSelected ? "Limpar seleção" : "Selecionar todos"}
              </Button>
              <span
                className="text-sm font-semibold text-muted-foreground"
                data-testid="text-selected-count"
              >
                {selectedCount} selecionados
              </span>
            </div>

            {selectedCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2">
                <span className="px-2 text-sm font-bold text-slate-700">
                  {selectedCount} selecionados
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="bg-green-600 font-bold text-white hover:bg-green-700"
                  onClick={handleBulkReady}
                  disabled={isBulkActionPending}
                  data-testid="button-bulk-ready"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Marcar prontos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkCancel}
                  disabled={isBulkActionPending}
                  data-testid="button-bulk-cancel"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Cancelar selecionados
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearSelection}
                  disabled={isBulkActionPending}
                  data-testid="button-clear-selection"
                >
                  <X className="mr-2 h-4 w-4" />
                  Limpar seleção
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Queue */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : sortedTickets.length === 0 ? (
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
            {sortedTickets.map((ticket) => {
              const typeColor =
                ORDER_TYPE_COLORS[ticket.orderType ?? "counter"] ??
                "bg-slate-600";
              const isSelected = selectedTicketIds.has(ticket.id);
              return (
                <div
                  key={ticket.id}
                  className={`rounded-2xl overflow-hidden shadow-lg border flex flex-col bg-card cursor-pointer transition-all hover:-translate-y-0.5 hover:border-[#D91F16]/50 hover:shadow-xl ${
                    isSelected
                      ? "border-[#D91F16] ring-2 ring-[#D91F16]/30"
                      : "border-border"
                  }`}
                  onClick={() => openOrderDetail(ticket.orderId)}
                  data-testid={`card-ticket-${ticket.id}`}
                >
                  {/* Colored header strip */}
                  <div className={`${typeColor} px-4 py-3`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <div
                          className="pt-1"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() =>
                              toggleTicketSelection(ticket.id)
                            }
                            aria-label={`Selecionar pedido ${ticket.orderId}`}
                            className="h-5 w-5 border-white bg-white/95 data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-[#D91F16]"
                            data-testid={`checkbox-ticket-${ticket.id}`}
                          />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <p className="text-white font-black text-xl leading-tight">
                            Pedido #{ticket.orderId}
                            {ticket.tableNumber
                              ? ` · Mesa ${ticket.tableNumber}`
                              : ""}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-white/90">
                            <span>
                              {ticket.customerName ?? "Cliente não informado"}
                            </span>
                            <span className="text-white/50">·</span>
                            <span>
                              {ORDER_TYPE_LABELS[ticket.orderType ?? "counter"]}
                            </span>
                          </div>
                          <div className="grid gap-0.5 text-xs font-medium text-white/85 sm:grid-cols-2">
                            <p>
                              Feito:{" "}
                              {formatOrderTime(
                                ticket.orderCreatedAt ?? ticket.createdAt,
                              )}
                            </p>
                            <p>
                              Na cozinha:{" "}
                              {formatOrderTime(
                                ticket.kitchenAcceptedAt ??
                                  ticket.ticketCreatedAt ??
                                  ticket.createdAt,
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right space-y-1">
                        <ElapsedBadge
                          createdAt={ticket.ticketCreatedAt ?? ticket.createdAt}
                        />
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
                      const multisabor = isMultisaborItem(item);
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
                                <div>
                                  <p className="font-bold text-foreground text-base leading-snug">
                                    {getItemDisplayName(item)}
                                  </p>
                                  {multisabor && (
                                    <span className="mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-orange-700">
                                      Multisabor
                                    </span>
                                  )}
                                </div>
                                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                                  R$ {item.totalPrice.toFixed(2)}
                                </span>
                              </div>
                              {Array.isArray(item.flavors) && item.flavors.length > 0 && (
                                <div className="mt-2 rounded-lg bg-white px-2.5 py-2 text-sm text-slate-700 border border-slate-200 space-y-1">
                                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                    Sabores
                                  </p>
                                  {item.flavors.map((flavor, flavorIndex) => (
                                    <div key={`${item.id}-flavor-${flavorIndex}`}>
                                      {flavor.fractionNumerator}/{flavor.fractionDenominator} {flavor.productName}
                                      {flavor.tierName ? ` — ${flavor.tierName}` : ""}
                                    </div>
                                  ))}
                                </div>
                              )}
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
                                      <p
                                        key={`${item.id}-detail-${detailIndex}`}
                                      >
                                        + {detail}
                                      </p>
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
