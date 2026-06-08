import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Truck,
  RefreshCw,
  Sparkles,
  MapPin,
  Package,
  DollarSign,
  User,
  Phone,
  Banknote,
  CreditCard,
  Smartphone,
  QrCode,
  Play,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  Hash,
  Plus,
  Minus,
  ArrowRightLeft,
  Zap,
  X,
  ChevronRight,
  ChevronDown,
  Timer,
  PlusCircle,
  Lock,
  ShoppingBag,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Layout } from "@/components/layout";
import { OrderDetailDialog } from "@/components/order-detail-dialog";
import { OrderTimeBadge } from "@/components/order-time-badge";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAlertsQueryKey,
  getGetCurrentCashRegisterQueryKey,
  getGetDashboardSummaryQueryKey,
  getListAwaitingSettlementQueryKey,
} from "@workspace/api-client-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type RouteStatus = "available" | "in_progress" | "completed";
type DeliveryOrderStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered";

interface RouteOrderItem {
  productId: number | null;
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface RouteOrder {
  id: number;
  orderId: number;
  routeId: number;
  stopOrder: number;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryNeighborhood: string | null;
  deliveryCep: string | null;
  deliveryFee: number;
  estimatedDistanceKm: number | null;
  totalAmount: number;
  deliveryStatus: string | null;
  paymentTiming: string | null;
  needsChange: string | null;
  changeFor: number | null;
  deliveryPaymentMethod: string | null;
  deliveryPaymentNotes: string | null;
  orderCreatedAt: string | null;
  orderKitchenAcceptedAt: string | null;
  routeTimeAt: string | null;
  items: RouteOrderItem[];
}

interface DeliveryRoute {
  id: number;
  name: string;
  status: RouteStatus;
  color: string;
  courierName: string | null;
  mainNeighborhood: string;
  includedNeighborhoods: string[];
  mapsUrl: string | null;
  totalDeliveryFee: number;
  totalToReceive: number;
  totalChangeNeeded: number;
  dispatchDeadline: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  orders: RouteOrder[];
}

interface PendingDeliveryOrder {
  id: number;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryNeighborhood: string | null;
  deliveryCep: string | null;
  deliveryFee: number;
  totalAmount: number;
  deliveryStatus: string | null;
  paymentTiming: string;
  needsChange: string | null;
  changeFor: number | null;
  deliveryPaymentMethod: string | null;
  createdAt: string;
  kitchenAcceptedAt: string | null;
  dispatchDeadline: string | null;
}

interface MoveOrderState {
  orderId: number;
  routeId: number;
  customerName: string | null;
}

interface AddPendingState {
  orderId: number;
  customerName: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<RouteStatus, string> = {
  available: "Disponível",
  in_progress: "Em andamento",
  completed: "Concluída",
};

const STATUS_COLORS: Record<RouteStatus, string> = {
  available: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  in_progress:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  completed:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

const DELIVERY_STATUS_LABELS: Record<DeliveryOrderStatus, string> = {
  pending: "Aguardando",
  preparing: "Preparando",
  ready: "Pronto",
  out_for_delivery: "A caminho",
  delivered: "Entregue",
};

const DELIVERY_STATUS_COLORS: Record<DeliveryOrderStatus, string> = {
  pending: "bg-slate-100 text-slate-700",
  preparing: "bg-amber-300 text-amber-950 font-semibold",
  ready: "bg-emerald-100 text-emerald-800",
  out_for_delivery: "bg-blue-100 text-blue-800",
  delivered: "bg-purple-100 text-purple-800",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao: "Cartão",
};

const PAYMENT_METHOD_ICONS: Record<string, typeof Banknote> = {
  dinheiro: Banknote,
  pix: Smartphone,
  cartao: CreditCard,
};

// ─── API ─────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

type TimeUrgency = "ok" | "warning" | "danger";

function getTimeStatus(dispatchDeadline: string | null): {
  label: string;
  urgency: TimeUrgency;
} {
  if (!dispatchDeadline) return { label: "Sem prazo", urgency: "ok" };
  const diffMs = new Date(dispatchDeadline).getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin > 5) return { label: `${diffMin} min`, urgency: "ok" };
  if (diffMin > 0) return { label: `${diffMin} min`, urgency: "warning" };
  return { label: `+${Math.abs(diffMin)} min atraso`, urgency: "danger" };
}

const URGENCY_DOT: Record<TimeUrgency, string> = {
  ok: "bg-green-500",
  warning: "bg-amber-400",
  danger: "bg-red-500 animate-pulse",
};

const URGENCY_TEXT: Record<TimeUrgency, string> = {
  ok: "text-green-700 dark:text-green-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400 font-semibold",
};

const URGENCY_ICON: Record<TimeUrgency, typeof Clock> = {
  ok: Clock,
  warning: AlertTriangle,
  danger: AlertCircle,
};

function isTodayLocal(iso: string | null): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Routes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingDeliveryOrder[]>(
    [],
  );
  const [dispatchMinutes, setDispatchMinutes] = useState<number | null>(null);
  const [storeDispatchMinutes, setStoreDispatchMinutes] = useState<
    number | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const savingDispatch = false;
  const [, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );

  const [qrRoute, setQrRoute] = useState<DeliveryRoute | null>(null);
  const [assignRoute, setAssignRoute] = useState<DeliveryRoute | null>(null);
  const [courierName, setCourierName] = useState("");
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(
    null,
  );
  const [couriers, setCouriers] = useState<
    { id: number; name: string; vehicle: string }[]
  >([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!assignRoute) return;
    apiFetch<{ id: number; name: string; vehicle: string }[]>("/couriers")
      .then(setCouriers)
      .catch(() => setCouriers([]));
  }, [assignRoute]);
  const [preparingConfirm, setPreparingConfirm] = useState(false);
  const [completing, setCompleting] = useState<number | null>(null);
  const [moveOrderState, setMoveOrderState] = useState<MoveOrderState | null>(
    null,
  );
  const [movingOrder, setMovingOrder] = useState(false);
  const [addPendingState, setAddPendingState] =
    useState<AddPendingState | null>(null);
  const [addingToRoute, setAddingToRoute] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [maxOrdersPerRoute, setMaxOrdersPerRoute] = useState(4);
  const [routeView, setRouteView] = useState<
    "pending" | "available" | "in_progress" | "completed"
  >("pending");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [isOrderDetailOpen, setIsOrderDetailOpen] = useState(false);

  const openOrderDetail = (orderId: number) => {
    setSelectedOrderId(orderId);
    setIsOrderDetailOpen(true);
  };

  const fetchRoutes = useCallback(async () => {
    try {
      const data = await apiFetch<DeliveryRoute[]>("/delivery/routes");
      setRoutes(data);
    } catch {
      toast({ title: "Erro ao carregar rotas", variant: "destructive" });
    }
  }, [toast]);

  const fetchPendingOrders = useCallback(async () => {
    try {
      const data = await apiFetch<PendingDeliveryOrder[]>(
        "/delivery/orders/pending",
      );
      setPendingOrders(data);
    } catch {
      // silently ignore
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const s = await apiFetch<{
        deliveryDispatchTimeMinutes: number;
        maxOrdersPerRoute: number;
      }>("/settings");
      setDispatchMinutes(s.deliveryDispatchTimeMinutes);
      setStoreDispatchMinutes(s.deliveryDispatchTimeMinutes);
      setMaxOrdersPerRoute(s.maxOrdersPerRoute ?? 4);
    } catch {
      // silently ignore
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchRoutes(), fetchPendingOrders(), fetchSettings()]);
    setLoading(false);
  }, [fetchRoutes, fetchPendingOrders, fetchSettings]);

  useEffect(() => {
    fetchAll();
    const pollInterval = setInterval(() => {
      void fetchRoutes();
      void fetchPendingOrders();
    }, 15_000);
    timerRef.current = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => {
      clearInterval(pollInterval);
      clearInterval(timerRef.current);
    };
  }, [fetchAll, fetchRoutes, fetchPendingOrders]);

  const handleGroupRoutes = async () => {
    setGenerating(true);
    try {
      const { created } = await apiFetch<{ created: number }>(
        "/delivery/routes/generate",
        { method: "POST" },
      );
      await refreshDeliveryAndFinanceViews();
      setRouteView("available");
      toast({
        title:
          created === 0
            ? "Nenhum pedido em preparação ou pronto encontrado"
            : `${created} rota${created !== 1 ? "s" : ""} gerada${created !== 1 ? "s" : ""}!`,
      });
    } catch {
      toast({ title: "Erro ao gerar rotas", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleUpdateDispatchTime = (delta: number) => {
    if (dispatchMinutes === null) return;
    const newMinutes = Math.max(1, Math.min(180, dispatchMinutes + delta));
    setDispatchMinutes(newMinutes);
    toast({
      title: `Prazo temporário da tela ajustado para ${newMinutes} minutos.`,
      description:
        storeDispatchMinutes === null
          ? "Carregando padrão da loja..."
          : `Padrão da loja: ${storeDispatchMinutes} min`,
    });
  };

  const handleAssign = async (forcePrep = false) => {
    if (!assignRoute) return;
    const hasSelection = selectedCourierId !== null || courierName.trim();
    if (!hasSelection) return;

    // Warn if some orders are still preparing
    if (!forcePrep) {
      const preparingCount = assignRoute.orders.filter(
        (o) => o.deliveryStatus === "preparing",
      ).length;
      if (preparingCount > 0) {
        setPreparingConfirm(true);
        return;
      }
    }

    setAssigning(true);
    setPreparingConfirm(false);
    try {
      const body = selectedCourierId
        ? { courierId: selectedCourierId }
        : { courierName: courierName.trim() };
      await apiFetch(`/delivery/routes/${assignRoute.id}/assign`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await refreshDeliveryAndFinanceViews();
      const name =
        couriers.find((c) => c.id === selectedCourierId)?.name ??
        courierName.trim();
      toast({ title: `Rota assumida por ${name}!` });
      setAssignRoute(null);
      setCourierName("");
      setSelectedCourierId(null);
    } catch (e) {
      toast({
        title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`,
        variant: "destructive",
      });
    } finally {
      setAssigning(false);
    }
  };

  const handleComplete = async (route: DeliveryRoute) => {
    setCompleting(route.id);
    try {
      await apiFetch(`/delivery/routes/${route.id}/complete`, {
        method: "POST",
      });
      await refreshDeliveryAndFinanceViews();
      toast({ title: "Rota concluída! Pedidos marcados como entregues." });
    } catch (e) {
      toast({
        title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`,
        variant: "destructive",
      });
    } finally {
      setCompleting(null);
    }
  };

  const handleMoveToRoute = async (targetRouteId: number) => {
    if (!moveOrderState) return;
    setMovingOrder(true);
    try {
      await apiFetch(`/delivery/routes/${moveOrderState.routeId}/move-order`, {
        method: "POST",
        body: JSON.stringify({
          orderId: moveOrderState.orderId,
          targetRouteId,
        }),
      });
      await Promise.all([fetchRoutes(), fetchPendingOrders()]);
      toast({ title: "Pedido movido!" });
      setMoveOrderState(null);
    } catch (e) {
      toast({
        title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`,
        variant: "destructive",
      });
    } finally {
      setMovingOrder(false);
    }
  };

  const handleRemoveFromRoute = async () => {
    if (!moveOrderState) return;
    setMovingOrder(true);
    try {
      await apiFetch(`/delivery/routes/${moveOrderState.routeId}/move-order`, {
        method: "POST",
        body: JSON.stringify({ orderId: moveOrderState.orderId }),
      });
      await Promise.all([fetchRoutes(), fetchPendingOrders()]);
      toast({ title: "Pedido voltou para aguardando rota." });
      setMoveOrderState(null);
    } catch (e) {
      toast({
        title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`,
        variant: "destructive",
      });
    } finally {
      setMovingOrder(false);
    }
  };

  const handleDirectRemoveFromRoute = async (
    routeId: number,
    orderId: number,
  ) => {
    try {
      await apiFetch(`/delivery/routes/${routeId}/move-order`, {
        method: "POST",
        body: JSON.stringify({ orderId }),
      });
      await Promise.all([fetchRoutes(), fetchPendingOrders()]);
      toast({ title: "Pedido removido da rota." });
    } catch (e) {
      toast({
        title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`,
        variant: "destructive",
      });
    }
  };

  const handleCreateEmergency = async (
    orderId: number,
    fromMoveDialog?: boolean,
  ) => {
    setMovingOrder(true);
    try {
      await apiFetch("/delivery/routes/emergency", {
        method: "POST",
        body: JSON.stringify({ orderId }),
      });
      await Promise.all([fetchRoutes(), fetchPendingOrders()]);
      toast({ title: "Rota de emergência criada!" });
      if (fromMoveDialog) setMoveOrderState(null);
      setAddPendingState(null);
    } catch (e) {
      toast({
        title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`,
        variant: "destructive",
      });
    } finally {
      setMovingOrder(false);
    }
  };

  const handleAddPendingToRoute = async (targetRouteId: number) => {
    if (!addPendingState) return;
    setAddingToRoute(true);
    try {
      await apiFetch(`/delivery/routes/${targetRouteId}/add-order`, {
        method: "POST",
        body: JSON.stringify({ orderId: addPendingState.orderId }),
      });
      await Promise.all([fetchRoutes(), fetchPendingOrders()]);
      toast({ title: "Pedido adicionado à rota!" });
      setAddPendingState(null);
    } catch (e) {
      toast({
        title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`,
        variant: "destructive",
      });
    } finally {
      setAddingToRoute(false);
    }
  };

  const [pendingSelected, setPendingSelected] = useState<Set<number>>(
    new Set(),
  );
  const refreshDeliveryAndFinanceViews = useCallback(async () => {
    await Promise.all([
      fetchRoutes(),
      fetchPendingOrders(),
      queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() }),
      queryClient.invalidateQueries({
        queryKey: getGetDashboardSummaryQueryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: getGetCurrentCashRegisterQueryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: getListAwaitingSettlementQueryKey(),
      }),
    ]);
  }, [fetchPendingOrders, fetchRoutes, queryClient]);

  const pendingOrdersRenderable = pendingOrders
    .filter((order) => {
      const isEligibleDeliveryStatus = [
        "pending",
        "preparing",
        "ready",
      ].includes(order.deliveryStatus ?? "");
      const hasRouteLink =
        (order as { routeId?: number | null }).routeId != null;
      return (
        isEligibleDeliveryStatus &&
        !hasRouteLink &&
        isTodayLocal(order.createdAt)
      );
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkAdding, setBulkAdding] = useState(false);

  const togglePending = (id: number) => {
    setPendingSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllPending = () => {
    if (pendingSelected.size > 0) setPendingSelected(new Set());
    else setPendingSelected(new Set(pendingOrdersRenderable.map((o) => o.id)));
  };

  const handleBulkAddToRoute = async (routeId: number) => {
    setBulkAdding(true);
    try {
      await Promise.all(
        Array.from(pendingSelected).map((orderId) =>
          apiFetch(`/delivery/routes/${routeId}/add-order`, {
            method: "POST",
            body: JSON.stringify({ orderId }),
          }),
        ),
      );
      await Promise.all([fetchRoutes(), fetchPendingOrders()]);
      toast({
        title: `${pendingSelected.size} pedido(s) adicionado(s) à rota!`,
      });
      setPendingSelected(new Set());
      setBulkAddOpen(false);
    } catch (e) {
      toast({
        title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`,
        variant: "destructive",
      });
    } finally {
      setBulkAdding(false);
    }
  };

  const activeRoutes = routes.filter((r) => r.status !== "completed");
  const availableRoutes = routes.filter((r) => r.status === "available");
  const inProgressRoutes = routes.filter((r) => r.status === "in_progress");
  const hasActiveRoutes = availableRoutes.length + inProgressRoutes.length > 0;
  const hasPendingOrders = pendingOrdersRenderable.length > 0;
  const completedTodayRoutes = routes.filter(
    (r) => r.status === "completed" && isTodayLocal(r.completedAt),
  );
  const oldCompletedRoutes = routes.filter(
    (r) => r.status === "completed" && !isTodayLocal(r.completedAt),
  );
  const completedRoutes = showCompleted
    ? [...completedTodayRoutes, ...oldCompletedRoutes]
    : completedTodayRoutes;

  const routeNavigation = (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-2 shadow-sm">
      <button
        type="button"
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${routeView === "pending" ? "bg-[#D91F16] text-white shadow-sm" : "bg-white/10 text-slate-200 hover:bg-white/15"}`}
        onClick={() => setRouteView("pending")}
        data-testid="tab-pending-routes"
      >
        <span>Aguardando rota</span>
        <span
          className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-black ${routeView === "pending" ? "bg-white text-[#D91F16]" : "bg-slate-700 text-white"}`}
        >
          {pendingOrdersRenderable.length}
        </span>
      </button>
      <button
        type="button"
        onClick={() => setRouteView("available")}
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${routeView === "available" ? "bg-[#D91F16] text-white shadow-sm" : "bg-white/10 text-slate-200 hover:bg-white/15"}`}
        data-testid="tab-available"
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${routeView === "available" ? "bg-white" : "bg-[#D91F16]"}`}
        />
        <span>Rotas disponíveis</span>
        <span
          className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-black ${routeView === "available" ? "bg-white text-[#D91F16]" : "bg-slate-700 text-white"}`}
        >
          {availableRoutes.length}
        </span>
      </button>
      <button
        type="button"
        onClick={() => setRouteView("in_progress")}
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${routeView === "in_progress" ? "bg-[#D91F16] text-white shadow-sm" : "bg-white/10 text-slate-200 hover:bg-white/15"}`}
        data-testid="tab-in-progress"
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${routeView === "in_progress" ? "bg-white" : "bg-[#0F172A]"}`}
        />
        <span>Em andamento</span>
        <span
          className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-black ${routeView === "in_progress" ? "bg-white text-[#D91F16]" : "bg-slate-700 text-white"}`}
        >
          {inProgressRoutes.length}
        </span>
      </button>
      <button
        type="button"
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${routeView === "completed" ? "bg-[#D91F16] text-white shadow-sm" : "bg-white/10 text-slate-200 hover:bg-white/15"}`}
        onClick={() => setRouteView("completed")}
        data-testid="tab-completed-today"
      >
        <span>Concluídas hoje</span>
        <span
          className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-black ${routeView === "completed" ? "bg-white text-[#D91F16]" : "bg-slate-700 text-white"}`}
        >
          {completedTodayRoutes.length}
        </span>
      </button>
    </div>
  );

  return (
    <Layout>
      <div className="space-y-5">
        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
              <Truck className="w-6 h-6 text-primary" />
              Painel de Rotas
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Delivery em tempo real — agrupe pedidos em rotas quando estiver
              pronto
            </p>
            {/* ── Legenda de cores por distância ── */}
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2">
              {ROUTE_DISTANCE_LEGEND.map((entry) => (
                <div key={entry.label} className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${entry.tone}`}
                  />
                  <span className="text-xs text-muted-foreground">
                    {entry.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-muted rounded-lg px-2.5 py-1.5 text-sm">
              <Timer className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground text-xs">Prazo:</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => handleUpdateDispatchTime(-5)}
                disabled={
                  savingDispatch ||
                  dispatchMinutes === null ||
                  dispatchMinutes <= 1
                }
              >
                <Minus className="w-3 h-3" />
              </Button>
              <span className="font-semibold w-14 text-center text-xs">
                {savingDispatch || dispatchMinutes === null
                  ? "..."
                  : `${dispatchMinutes} min`}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => handleUpdateDispatchTime(5)}
                disabled={
                  savingDispatch ||
                  dispatchMinutes === null ||
                  dispatchMinutes >= 180
                }
              >
                <Plus className="w-3 h-3" />
              </Button>
              <span className="text-[11px] text-muted-foreground pl-1">
                Padrão da loja: {storeDispatchMinutes ?? "..."} min
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAll}
              disabled={loading}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
              />
              Atualizar
            </Button>
            <Button
              onClick={handleGroupRoutes}
              disabled={generating}
              className="gap-1.5"
              data-testid="button-generate-routes"
            >
              <Sparkles className="w-4 h-4" />
              {generating ? "Agrupando..." : "Gerar Rotas"}
            </Button>
          </div>
        </div>

        {/* ── Stats strip ── */}
        {(routes.length > 0 || pendingOrdersRenderable.length > 0) && (
          <div className="flex items-center gap-3 flex-wrap">
            {[
              {
                label: "Aguardando rota",
                count: pendingOrdersRenderable.length,
              },
              {
                label: "Disponíveis",
                count: activeRoutes.filter((r) => r.status === "available")
                  .length,
              },
              {
                label: "Em andamento",
                count: activeRoutes.filter((r) => r.status === "in_progress")
                  .length,
              },
              { label: "Concluídas hoje", count: completedTodayRoutes.length },
            ].map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2"
              >
                <span className="min-w-[1.75rem] h-7 rounded-md bg-[#0F172A] text-white text-sm font-bold flex items-center justify-center px-1.5">
                  {s.count}
                </span>
                <span className="text-xs font-medium text-[#0F172A]">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="text-center py-16 text-muted-foreground">
            <RefreshCw className="w-7 h-7 mx-auto mb-3 animate-spin opacity-40" />
            <p className="text-sm">Carregando...</p>
          </div>
        )}

        {/* ── Empty ── */}
        {!loading &&
          routes.length === 0 &&
          pendingOrdersRenderable.length === 0 && (
            <div className="text-center py-16 border-2 border-dashed rounded-xl text-muted-foreground">
              <Truck className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-lg font-semibold mb-1">
                Nenhum pedido delivery
              </p>
              <p className="text-sm max-w-xs mx-auto">
                Pedidos de delivery aparecem aqui assim que registrados. Use{" "}
                <strong>Gerar Rotas</strong> para agrupá-los.
              </p>
            </div>
          )}

        {/* ── Route navigation ── */}
        {!loading && routeNavigation}

        {/* ── Pending orders (compact list) ── */}
        {!loading &&
          routeView === "pending" &&
          pendingOrdersRenderable.length > 0 && (
            <section id="pending-routes-section">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h2 className="text-base font-semibold">Aguardando Rota</h2>
                <Badge
                  variant="secondary"
                  className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                >
                  {pendingOrdersRenderable.length}
                </Badge>
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  {/* Select all toggle */}
                  <button
                    onClick={toggleSelectAllPending}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="btn-select-all-pending"
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${pendingSelected.size === pendingOrdersRenderable.length && pendingOrdersRenderable.length > 0 ? "bg-primary border-primary" : pendingSelected.size > 0 ? "bg-primary/40 border-primary" : "border-[#CBD5E1] hover:border-primary"}`}
                    >
                      {pendingSelected.size > 0 && (
                        <div
                          className={`${pendingSelected.size === pendingOrdersRenderable.length ? "w-2 h-1.5" : "w-1.5 h-0.5"} bg-white rounded`}
                        />
                      )}
                    </div>
                    {pendingSelected.size === 0
                      ? "Selecionar todos"
                      : `${pendingSelected.size} selecionado${pendingSelected.size !== 1 ? "s" : ""}`}
                  </button>

                  {/* Bulk actions */}
                  {pendingSelected.size > 0 && activeRoutes.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/5"
                      onClick={() => setBulkAddOpen(true)}
                      data-testid="btn-bulk-add-route"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar {pendingSelected.size} à rota
                    </Button>
                  )}
                  {pendingSelected.size > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => setPendingSelected(new Set())}
                    >
                      Limpar
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border overflow-hidden bg-card">
                {pendingOrdersRenderable.map((order, idx) => (
                  <PendingOrderRow
                    key={order.id}
                    order={order}
                    dispatchMinutes={dispatchMinutes}
                    activeRoutes={activeRoutes}
                    isLast={idx === pendingOrdersRenderable.length - 1}
                    selected={pendingSelected.has(order.id)}
                    onToggle={() => togglePending(order.id)}
                    onAddToRoute={() =>
                      setAddPendingState({
                        orderId: order.id,
                        customerName: order.customerName,
                      })
                    }
                    onEmergency={() => handleCreateEmergency(order.id)}
                    onOpenOrder={() => openOrderDetail(order.id)}
                  />
                ))}
              </div>
            </section>
          )}

        {/* ── Routes grid (tab-controlled) ── */}
        {routeView === "available" ? (
          availableRoutes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {availableRoutes.map((route, idx) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  index={idx}
                  allActiveRoutes={activeRoutes}
                  maxOrders={maxOrdersPerRoute}
                  onAssign={() => {
                    setAssignRoute(route);
                    setCourierName("");
                  }}
                  onComplete={() => handleComplete(route)}
                  onQrCode={() => setQrRoute(route)}
                  onMoveOrder={(orderId, customerName) =>
                    setMoveOrderState({
                      orderId,
                      routeId: route.id,
                      customerName,
                    })
                  }
                  onDirectRemove={(orderId) =>
                    handleDirectRemoveFromRoute(route.id, orderId)
                  }
                  onOpenOrder={openOrderDetail}
                  completing={completing === route.id}
                />
              ))}
            </div>
          ) : (
            !loading && (
              <div className="text-center py-10 border-2 border-dashed rounded-xl text-muted-foreground">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">Nenhuma rota disponível</p>
                <p className="text-xs mt-1">
                  Clique em <strong>Gerar Rotas</strong> para agrupar os pedidos
                </p>
              </div>
            )
          )
        ) : routeView === "in_progress" && inProgressRoutes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {inProgressRoutes.map((route, idx) => (
              <RouteCard
                key={route.id}
                route={route}
                index={idx}
                allActiveRoutes={activeRoutes}
                maxOrders={maxOrdersPerRoute}
                onAssign={() => {
                  setAssignRoute(route);
                  setCourierName("");
                }}
                onComplete={() => handleComplete(route)}
                onQrCode={() => setQrRoute(route)}
                onMoveOrder={(orderId, customerName) =>
                  setMoveOrderState({
                    orderId,
                    routeId: route.id,
                    customerName,
                  })
                }
                onDirectRemove={(orderId) =>
                  handleDirectRemoveFromRoute(route.id, orderId)
                }
                onOpenOrder={openOrderDetail}
                completing={completing === route.id}
              />
            ))}
          </div>
        ) : routeView === "in_progress" ? (
          !loading && (
            <div className="text-center py-10 border-2 border-dashed rounded-xl text-muted-foreground">
              <Truck className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Nenhuma rota em andamento</p>
              <p className="text-xs mt-1">
                Rotas assumidas por motoboys aparecerão aqui
              </p>
            </div>
          )
        ) : routeView === "pending" && pendingOrdersRenderable.length === 0 ? (
          !loading && (
            <div className="text-center py-10 border-2 border-dashed rounded-xl text-muted-foreground">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">
                Nenhum pedido aguardando rota
              </p>
              <p className="text-xs mt-1">
                Novos pedidos preparados aparecerão nesta aba
              </p>
            </div>
          )
        ) : null}

        {/* ── Completed routes ── */}
        {routeView === "completed" &&
          (completedTodayRoutes.length > 0 ? (
            <section className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 opacity-75">
                {completedTodayRoutes.map((route, idx) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    index={idx}
                    allActiveRoutes={[]}
                    maxOrders={maxOrdersPerRoute}
                    onAssign={() => {}}
                    onComplete={() => {}}
                    onQrCode={() => setQrRoute(route)}
                    onMoveOrder={() => {}}
                    onDirectRemove={() => {}}
                    onOpenOrder={openOrderDetail}
                    completing={false}
                  />
                ))}
              </div>

              {oldCompletedRoutes.length > 0 && (
                <div className="space-y-3">
                  <button
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                    onClick={() => setShowCompleted((v) => !v)}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="font-medium">
                      {showCompleted
                        ? "Ocultar histórico anterior"
                        : `Ver histórico anterior (${oldCompletedRoutes.length})`}
                    </span>
                    <ChevronRight
                      className={`w-4 h-4 transition-transform ${showCompleted ? "rotate-90" : ""}`}
                    />
                  </button>
                  {showCompleted && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 opacity-50">
                      {oldCompletedRoutes.map((route, idx) => (
                        <RouteCard
                          key={route.id}
                          route={route}
                          index={idx}
                          allActiveRoutes={[]}
                          maxOrders={maxOrdersPerRoute}
                          onAssign={() => {}}
                          onComplete={() => {}}
                          onQrCode={() => setQrRoute(route)}
                          onMoveOrder={() => {}}
                          onDirectRemove={() => {}}
                          onOpenOrder={openOrderDetail}
                          completing={false}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : (
            !loading && (
              <div className="text-center py-10 border-2 border-dashed rounded-xl text-muted-foreground">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">
                  Nenhuma rota concluída hoje
                </p>
                <p className="text-xs mt-1">
                  Rotas finalizadas aparecerão nesta aba
                </p>
              </div>
            )
          ))}
      </div>

      <OrderDetailDialog
        orderId={selectedOrderId}
        open={isOrderDetailOpen}
        onOpenChange={setIsOrderDetailOpen}
      />

      {/* ── QR Code Modal ── */}
      <Dialog
        open={!!qrRoute}
        onOpenChange={(open) => {
          if (!open) setQrRoute(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              QR Code — {qrRoute?.name}
            </DialogTitle>
            <DialogDescription>
              Escaneie para abrir no Google Maps
            </DialogDescription>
          </DialogHeader>
          {qrRoute?.mapsUrl ? (
            <div className="space-y-3">
              <div className="flex justify-center p-4 bg-white rounded-xl border">
                <QRCodeSVG
                  value={qrRoute.mapsUrl}
                  size={210}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">
                  Paradas ({qrRoute.orders.length}):
                </p>
                {[...qrRoute.orders]
                  .sort((a, b) => a.stopOrder - b.stopOrder)
                  .map((o) => (
                    <div key={o.id} className="flex items-start gap-1.5">
                      <span className="font-bold text-primary shrink-0">
                        {o.stopOrder}.
                      </span>
                      <div>
                        <p>
                          {o.customerName ?? `Pedido #${o.orderId}`} ·{" "}
                          {o.deliveryAddress ?? "—"}
                        </p>
                        {o.deliveryCep && (
                          <p className="text-muted-foreground">
                            CEP: {o.deliveryCep}
                          </p>
                        )}
                        {o.paymentTiming === "on_delivery" && (
                          <p className="text-amber-600 font-medium">
                            💰 Cobrar R$ {o.totalAmount.toFixed(2)}
                            {o.needsChange === "true" && o.changeFor
                              ? ` · Troco p/ R$ ${o.changeFor.toFixed(2)}`
                              : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
              <a
                href={qrRoute.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button variant="outline" size="sm" className="w-full gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Abrir no Maps
                </Button>
              </a>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum endereço configurado
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Assign Modal ── */}
      <Dialog
        open={!!assignRoute}
        onOpenChange={(open) => {
          if (!open) {
            setAssignRoute(null);
            setSelectedCourierId(null);
            setCourierName("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" /> Assumir Rota
            </DialogTitle>
            <DialogDescription>
              Quem vai assumir <strong>{assignRoute?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {assignRoute && assignRoute.totalToReceive > 0 && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm space-y-1">
                <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <Banknote className="w-4 h-4" /> Valores a receber
                </p>
                <p>
                  Total a cobrar:{" "}
                  <strong>R$ {assignRoute.totalToReceive.toFixed(2)}</strong>
                </p>
                {assignRoute.totalChangeNeeded > 0 && (
                  <p>
                    Troco necessário:{" "}
                    <strong>
                      R$ {assignRoute.totalChangeNeeded.toFixed(2)}
                    </strong>
                  </p>
                )}
              </div>
            )}

            {/* Courier list */}
            {couriers.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Selecione o motoboy:
                </p>
                <div className="grid gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {couriers.map((c) => {
                    const isSelected = selectedCourierId === c.id;
                    const vehicleEmoji =
                      c.vehicle === "bike"
                        ? "🚲"
                        : c.vehicle === "carro"
                          ? "🚗"
                          : "🏍️";
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCourierId(c.id);
                          setCourierName("");
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border bg-card hover:bg-muted/50"
                        }`}
                      >
                        <span className="text-lg">{vehicleEmoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{c.name}</p>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      ou digite manualmente
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">
                Nenhum motoboy cadastrado.{" "}
                <a href="/motoboys" className="underline text-primary">
                  Cadastrar agora
                </a>
              </p>
            )}

            <Input
              placeholder="Nome do motoboy (avulso)"
              value={courierName}
              onChange={(e) => {
                setCourierName(e.target.value);
                if (e.target.value) setSelectedCourierId(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAssign()}
              data-testid="input-courier-name"
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setAssignRoute(null);
                  setSelectedCourierId(null);
                  setCourierName("");
                }}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={() => handleAssign()}
                disabled={
                  assigning || (!selectedCourierId && !courierName.trim())
                }
                data-testid="button-confirm-assign"
              >
                {assigning ? "Salvando..." : "Confirmar"}
              </Button>
            </div>

            {preparingConfirm && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 p-3 text-sm space-y-2">
                <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {
                    assignRoute?.orders.filter(
                      (o) => o.deliveryStatus === "preparing",
                    ).length
                  }{" "}
                  pedido(s) ainda em preparo
                </p>
                <p className="text-amber-700 dark:text-amber-400 text-xs">
                  O motoboy sairá com pedidos que ainda não estão prontos na
                  cozinha. Eles continuarão como "Em preparo" na rota até
                  ficarem prontos. Confirma?
                </p>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setPreparingConfirm(false)}
                  >
                    Voltar
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => handleAssign(true)}
                    disabled={assigning}
                  >
                    {assigning ? "Salvando..." : "Confirmar mesmo assim"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Pending to Route Modal ── */}
      <Dialog
        open={!!addPendingState}
        onOpenChange={(open) => {
          if (!open) setAddPendingState(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="w-5 h-5" />
              Adicionar à Rota
            </DialogTitle>
            <DialogDescription>
              Pedido de{" "}
              <strong>
                {addPendingState?.customerName ??
                  `#${addPendingState?.orderId}`}
              </strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {activeRoutes.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Escolha a rota de destino:
                </p>
                {activeRoutes.map((r) => {
                  const ts = getTimeStatus(r.dispatchDeadline);
                  return (
                    <Button
                      key={r.id}
                      variant="outline"
                      className="w-full justify-between gap-2 h-auto py-2.5"
                      onClick={() => handleAddPendingToRoute(r.id)}
                      disabled={addingToRoute}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: r.color }}
                        />
                        <div className="text-left min-w-0">
                          <p className="text-sm font-medium truncate">
                            {r.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.orders.length} pedido
                            {r.orders.length !== 1 ? "s" : ""} ·{" "}
                            {r.mainNeighborhood}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-xs ${URGENCY_TEXT[ts.urgency]}`}>
                          {ts.label}
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </Button>
                  );
                })}
                <div className="border-t pt-2">
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-red-300 text-[#D91F16] hover:bg-red-50 dark:border-red-800 dark:text-red-300"
                    onClick={() =>
                      addPendingState &&
                      handleCreateEmergency(addPendingState.orderId)
                    }
                    disabled={addingToRoute}
                  >
                    <Zap className="w-4 h-4" />
                    Criar rota solitária
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Não há rotas ativas. Criar uma rota solitária para este
                  pedido?
                </p>
                <Button
                  className="w-full gap-2"
                  onClick={() =>
                    addPendingState &&
                    handleCreateEmergency(addPendingState.orderId)
                  }
                  disabled={addingToRoute}
                >
                  <Zap className="w-4 h-4" />
                  Criar rota solitária
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setAddPendingState(null)}
              disabled={addingToRoute}
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Add to Route Modal ── */}
      <Dialog
        open={bulkAddOpen}
        onOpenChange={(open) => {
          if (!open) setBulkAddOpen(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Adicionar {pendingSelected.size} pedido
              {pendingSelected.size !== 1 ? "s" : ""} à rota
            </DialogTitle>
            <DialogDescription>Escolha a rota de destino</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {activeRoutes
              .filter((r) => r.status !== "completed")
              .map((r) => {
                const ts = getTimeStatus(r.dispatchDeadline);
                return (
                  <Button
                    key={r.id}
                    variant="outline"
                    className="w-full justify-between gap-2 h-auto py-2.5"
                    onClick={() => handleBulkAddToRoute(r.id)}
                    disabled={bulkAdding}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: r.color }}
                      />
                      <div className="text-left min-w-0">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.orders.length} pedido
                          {r.orders.length !== 1 ? "s" : ""} ·{" "}
                          {r.mainNeighborhood}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-xs ${URGENCY_TEXT[ts.urgency]}`}>
                        {ts.label}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </Button>
                );
              })}
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setBulkAddOpen(false)}
              disabled={bulkAdding}
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Move Order Modal (from route card) ── */}
      <Dialog
        open={!!moveOrderState}
        onOpenChange={(open) => {
          if (!open) setMoveOrderState(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" />
              Mover Pedido
            </DialogTitle>
            <DialogDescription>
              Pedido de{" "}
              <strong>
                {moveOrderState?.customerName ?? `#${moveOrderState?.orderId}`}
              </strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {routes.filter(
              (r) =>
                r.status !== "completed" && r.id !== moveOrderState?.routeId,
            ).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Mover para
                </p>
                {routes
                  .filter(
                    (r) =>
                      r.status !== "completed" &&
                      r.id !== moveOrderState?.routeId,
                  )
                  .map((r) => (
                    <Button
                      key={r.id}
                      variant="outline"
                      className="w-full justify-between gap-2"
                      onClick={() => handleMoveToRoute(r.id)}
                      disabled={movingOrder}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: r.color }}
                        />
                        <span className="truncate text-sm">{r.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          ({r.orders.length} ped.)
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                    </Button>
                  ))}
              </div>
            )}
            <div className="border-t pt-2 space-y-1.5">
              <Button
                variant="outline"
                className="w-full gap-2 border-red-300 text-[#D91F16] hover:bg-red-50 dark:border-red-800 dark:text-red-300"
                onClick={() =>
                  moveOrderState &&
                  handleCreateEmergency(moveOrderState.orderId, true)
                }
                disabled={movingOrder}
              >
                <Zap className="w-4 h-4" />
                Criar rota solitária
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2 text-muted-foreground"
                onClick={handleRemoveFromRoute}
                disabled={movingOrder}
              >
                <X className="w-4 h-4" />
                Remover (volta para aguardando)
              </Button>
            </div>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setMoveOrderState(null)}
              disabled={movingOrder}
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

// ─── PendingOrderRow ──────────────────────────────────────────────────────────

function PendingOrderRow({
  order,
  dispatchMinutes,
  activeRoutes,
  isLast,
  selected,
  onToggle,
  onAddToRoute,
  onEmergency,
  onOpenOrder,
}: {
  order: PendingDeliveryOrder;
  dispatchMinutes: number | null;
  activeRoutes: DeliveryRoute[];
  isLast: boolean;
  selected: boolean;
  onToggle: () => void;
  onAddToRoute: () => void;
  onEmergency: () => void;
  onOpenOrder: () => void;
}) {
  const deadlineMs =
    order.kitchenAcceptedAt && dispatchMinutes !== null
      ? new Date(order.kitchenAcceptedAt).getTime() + dispatchMinutes * 60_000
      : null;
  const timeStatus = deadlineMs
    ? getTimeStatus(new Date(deadlineMs).toISOString())
    : null;

  const ds = order.deliveryStatus as DeliveryOrderStatus | null;
  const dsLabel = ds ? DELIVERY_STATUS_LABELS[ds] : null;
  const dsColor = ds ? DELIVERY_STATUS_COLORS[ds] : "";
  const urgency = timeStatus?.urgency ?? "ok";
  const UrgencyIcon = URGENCY_ICON[urgency];

  return (
    <div
      className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors ${selected ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-slate-50"} ${!isLast ? "border-b border-border" : ""}`}
      onClick={onOpenOrder}
    >
      {/* Checkbox */}
      <button
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${selected ? "bg-primary border-primary" : "border-[#CBD5E1] hover:border-primary"}`}
        title={selected ? "Desmarcar" : "Selecionar"}
      >
        {selected && (
          <svg
            viewBox="0 0 10 8"
            className="w-2.5 h-2 fill-white"
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
      {/* Urgency dot */}
      <span
        className={`w-2.5 h-2.5 rounded-full shrink-0 ${timeStatus ? URGENCY_DOT[urgency] : "bg-gray-300"}`}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">
            Pedido #{order.id} · {order.customerName ?? "Cliente não informado"}
          </span>
          {dsLabel && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${dsColor}`}
            >
              {dsLabel}
            </span>
          )}
          {order.paymentTiming === "on_delivery" && (
            <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded-full shrink-0">
              💰 R$ {order.totalAmount.toFixed(2)} na entrega
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <OrderTimeBadge
            createdAt={order.createdAt}
            compact
            showIcon={false}
          />
          <span className="text-slate-300">·</span>
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {[order.deliveryNeighborhood, order.deliveryCep]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {order.customerPhone && (
            <>
              <span className="mx-1 opacity-40">·</span>
              <Phone className="w-3 h-3 shrink-0" />
              <span>{order.customerPhone}</span>
            </>
          )}
        </div>
      </div>

      {/* Timer */}
      <div className="shrink-0 text-right hidden sm:block">
        {timeStatus ? (
          <div
            className={`flex items-center gap-1 text-xs font-medium ${URGENCY_TEXT[urgency]}`}
          >
            <UrgencyIcon className="w-3 h-3" />
            {timeStatus.label}
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            Cozinha
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-0.5">
          R$ {order.deliveryFee.toFixed(2)}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {activeRoutes.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/5"
            onClick={(event) => {
              event.stopPropagation();
              onAddToRoute();
            }}
            title="Adicionar a uma rota existente"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Adicionar à rota</span>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs gap-1 text-[#D91F16] hover:text-[#D91F16] hover:bg-red-50 dark:text-red-300"
          onClick={(event) => {
            event.stopPropagation();
            onEmergency();
          }}
          title="Criar rota solitária"
        >
          <Zap className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Solitária</span>
        </Button>
      </div>
    </div>
  );
}

// ─── Route value color based on total delivery fee ────────────────────────────

const ROUTE_DISTANCE_TONES = {
  short: {
    accent: "bg-emerald-500",
    border: "border-emerald-200",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    text: "text-emerald-700",
    hex: "#059669",
  },
  medium: {
    accent: "bg-blue-500",
    border: "border-blue-200",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    text: "text-blue-700",
    hex: "#2563EB",
  },
  long: {
    accent: "bg-violet-500",
    border: "border-violet-200",
    badge: "bg-violet-50 text-violet-700 border-violet-200",
    text: "text-violet-700",
    hex: "#7C3AED",
  },
  extended: {
    accent: "bg-amber-500",
    border: "border-amber-200",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    text: "text-amber-700",
    hex: "#D97706",
  },
  far: {
    accent: "bg-red-500",
    border: "border-red-200",
    badge: "bg-red-50 text-red-700 border-red-200",
    text: "text-red-700",
    hex: "#DC2626",
  },
} as const;

type RouteDistanceTone = keyof typeof ROUTE_DISTANCE_TONES;

function getRouteDistanceTone(distKm: number): {
  key: RouteDistanceTone;
  label: string;
  classes: (typeof ROUTE_DISTANCE_TONES)[RouteDistanceTone];
} {
  if (distKm > 8)
    return {
      key: "far",
      label: "acima de 8 km",
      classes: ROUTE_DISTANCE_TONES.far,
    };
  if (distKm > 6)
    return {
      key: "extended",
      label: "6–8 km",
      classes: ROUTE_DISTANCE_TONES.extended,
    };
  if (distKm > 4)
    return { key: "long", label: "4–6 km", classes: ROUTE_DISTANCE_TONES.long };
  if (distKm > 2)
    return {
      key: "medium",
      label: "2–4 km",
      classes: ROUTE_DISTANCE_TONES.medium,
    };
  return {
    key: "short",
    label: "até 2 km",
    classes: ROUTE_DISTANCE_TONES.short,
  };
}

const ROUTE_DISTANCE_LEGEND = [
  { tone: ROUTE_DISTANCE_TONES.short.accent, label: "até 2 km" },
  { tone: ROUTE_DISTANCE_TONES.medium.accent, label: "2–4 km" },
  { tone: ROUTE_DISTANCE_TONES.long.accent, label: "4–6 km" },
  { tone: ROUTE_DISTANCE_TONES.extended.accent, label: "6–8 km" },
  { tone: ROUTE_DISTANCE_TONES.far.accent, label: "acima de 8 km" },
] as const;

// ─── RouteCard ────────────────────────────────────────────────────────────────

const COMPACT_MAX_ORDERS = 3;

function RouteCard({
  route,
  index,
  allActiveRoutes: _allActiveRoutes,
  maxOrders: _maxOrders,
  onAssign,
  onComplete,
  onQrCode,
  onMoveOrder,
  onDirectRemove,
  onOpenOrder,
  completing,
}: {
  route: DeliveryRoute;
  index: number;
  allActiveRoutes: DeliveryRoute[];
  maxOrders: number;
  onAssign: () => void;
  onComplete: () => void;
  onQrCode: () => void;
  onMoveOrder: (orderId: number, customerName: string | null) => void;
  onDirectRemove: (orderId: number) => void;
  onOpenOrder: (orderId: number) => void;
  completing: boolean;
}) {
  const isAvailable = route.status === "available";
  const isInProgress = route.status === "in_progress";
  const isCompleted = route.status === "completed";
  const sortedOrders = [...route.orders].sort(
    (a, b) => a.stopOrder - b.stopOrder,
  );
  const canMoveOrders = isAvailable || isInProgress;

  // Card expand/collapse (default: collapsed)
  const [expanded, setExpanded] = useState(false);
  // Per-order item expansion (only active when card is expanded)
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  const hiddenCount = Math.max(0, sortedOrders.length - COMPACT_MAX_ORDERS);
  const visibleOrders = expanded
    ? sortedOrders
    : sortedOrders.slice(0, COMPACT_MAX_ORDERS);

  const totalFridges = sortedOrders
    .flatMap((o) => o.items ?? [])
    .filter((i) => i.productName.toLowerCase().includes("refri"))
    .reduce((sum, i) => sum + i.quantity, 0);

  const timeStatus = !isCompleted
    ? getTimeStatus(route.dispatchDeadline)
    : null;
  const urgency = timeStatus?.urgency ?? "ok";
  const TimeIcon = URGENCY_ICON[urgency];

  const readyCount = route.orders.filter(
    (o) => o.deliveryStatus === "ready",
  ).length;
  const totalCount = route.orders.length;
  const allOrdersReady = totalCount > 0 && readyCount === totalCount;

  const maxDistKm =
    route.orders.length > 0
      ? Math.max(...route.orders.map((o) => o.estimatedDistanceKm ?? 5))
      : 5;
  const distanceTone = getRouteDistanceTone(maxDistKm);
  const readinessPct =
    totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;
  const otherNeighborhoods = route.includedNeighborhoods.filter(
    (n) => n !== route.mainNeighborhood,
  );

  const hasDetailedContent =
    !isCompleted &&
    (totalFridges > 0 ||
      sortedOrders.some((o) => o.paymentTiming === "on_delivery"));
  const showExpandToggle = sortedOrders.length >= 2 || hasDetailedContent;

  const handleToggleExpand = () => {
    setExpanded((v) => {
      if (v) setExpandedOrderId(null); // collapse resets order expansion
      return !v;
    });
  };

  return (
    <div
      className={`relative rounded-2xl overflow-hidden flex flex-col border bg-white shadow-sm transition-shadow hover:shadow-md ${distanceTone.classes.border}`}
      data-testid={`card-route-${route.id}`}
    >
      <div
        className={`absolute inset-y-0 left-0 w-1.5 ${distanceTone.classes.accent}`}
      />
      <div className="p-4 pl-5 flex flex-col gap-3 flex-1">
        {/* ── Header ── */}
        <div className="flex items-start gap-3">
          {/* Readiness pill */}
          <div
            className={`flex flex-col items-center justify-center shrink-0 rounded-xl border px-2.5 py-2 min-w-[58px] ${distanceTone.classes.badge}`}
          >
            <span className="text-xl font-black leading-none">
              {totalCount}
            </span>
            <span className="text-[10px] font-semibold text-[#0F172A] leading-tight mt-0.5">
              entrega{totalCount !== 1 ? "s" : ""}
            </span>
            <div className="w-full mt-1.5">
              <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden w-full">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${readinessPct}%`,
                    backgroundColor:
                      readinessPct === 100
                        ? "#22C55E"
                        : distanceTone.classes.hex,
                  }}
                />
              </div>
              <span className="text-[10px] text-[#64748B] block text-center mt-0.5">
                {readyCount}/{totalCount} prontos
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-snug text-[#0F172A]">
              <span className={`font-black ${distanceTone.classes.text}`}>
                {index + 1}
              </span>{" "}
              {route.mainNeighborhood}
            </h3>
            <div
              className="flex items-center gap-1 mt-0.5 text-xs"
              style={{ color: "#64748B" }}
            >
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="font-medium">{route.mainNeighborhood}</span>
              {otherNeighborhoods.length > 0 && (
                <span className="opacity-70 truncate">
                  · {otherNeighborhoods.join(", ")}
                </span>
              )}
            </div>
            {isInProgress && route.courierName && (
              <div className="flex items-center gap-1 mt-0.5 text-xs text-[#475569]">
                <User className="w-3 h-3 shrink-0" />
                <span className="font-medium">{route.courierName}</span>
              </div>
            )}
            <div
              className={`flex items-center gap-1 mt-1 text-xs ${distanceTone.classes.text}`}
            >
              <MapPin className="w-3 h-3 shrink-0" />
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${distanceTone.classes.badge}`}
              >
                ~{maxDistKm.toFixed(1)} km · {distanceTone.label}
              </span>
            </div>
          </div>

          {/* Time pill */}
          {timeStatus && !isCompleted && (
            <div
              className={`shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full
              ${urgency === "ok" ? "bg-emerald-100 text-emerald-700" : ""}
              ${urgency === "warning" ? "bg-amber-100 text-amber-700" : ""}
              ${urgency === "danger" ? "bg-red-100 text-red-700" : ""}
            `}
            >
              <TimeIcon className="w-3 h-3 shrink-0" />
              <span>{timeStatus.label}</span>
            </div>
          )}
          {isCompleted && route.completedAt && (
            <div className="shrink-0 flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {new Date(route.completedAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
        </div>

        {/* ── Orders list (compact: up to 3; expanded: all) ── */}
        <div className="rounded-xl overflow-hidden border border-[#E2E8F0] divide-y divide-[#E2E8F0]">
          {visibleOrders.map((order) => {
            const ds = order.deliveryStatus as DeliveryOrderStatus | null;
            const isReady = ds === "ready";
            const isPrep = ds === "preparing";
            const isOut = ds === "out_for_delivery";
            const isDelivered = ds === "delivered";
            const dotColor = isReady
              ? "bg-emerald-400"
              : isPrep
                ? "bg-amber-400"
                : isOut
                  ? "bg-blue-400"
                  : isDelivered
                    ? "bg-zinc-500"
                    : "bg-zinc-600";
            const dsLabel = ds ? DELIVERY_STATUS_LABELS[ds] : null;
            const PayIcon =
              order.paymentTiming === "on_delivery" &&
              order.deliveryPaymentMethod
                ? (PAYMENT_METHOD_ICONS[order.deliveryPaymentMethod] ??
                  Banknote)
                : null;
            const changeAmt =
              order.needsChange === "true" && order.changeFor
                ? Math.max(0, order.changeFor - order.totalAmount)
                : null;

            const isOrderExpanded =
              expanded && expandedOrderId === order.orderId;
            const orderFridges = (order.items ?? []).filter((i) =>
              i.productName.toLowerCase().includes("refri"),
            );
            const hasFridges = orderFridges.length > 0;

            return (
              <div
                key={order.id}
                className="overflow-hidden transition-all"
                style={{
                  borderColor: isOrderExpanded
                    ? distanceTone.classes.hex
                    : "transparent",
                }}
              >
                {/* Order row */}
                <div
                  className="group flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-xs transition-colors select-none hover:bg-slate-100"
                  style={{
                    backgroundColor: isOrderExpanded ? "#F8FAFC" : "#FFFFFF",
                  }}
                  onMouseEnter={(e) => {
                    if (!isOrderExpanded)
                      e.currentTarget.style.backgroundColor = "#F1F5F9";
                  }}
                  onMouseLeave={(e) => {
                    if (!isOrderExpanded)
                      e.currentTarget.style.backgroundColor = "#F8FAFC";
                  }}
                  onClick={() => onOpenOrder(order.orderId)}
                  data-testid={`route-order-${order.orderId}`}
                >
                  {/* Stop number */}
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black shrink-0 border"
                    style={{
                      backgroundColor: "#F8FAFC",
                      borderColor: distanceTone.classes.hex,
                      color: distanceTone.classes.hex,
                    }}
                  >
                    {order.stopOrder}
                  </div>

                  {/* Status dot */}
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`}
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="flex min-w-0 items-center gap-1.5 font-semibold text-[#0F172A]">
                      <span className="shrink-0 rounded-md bg-[#0F172A] px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                        #{order.orderId}
                      </span>
                      <span className="truncate">
                        {order.customerName ?? "Cliente não informado"}
                      </span>
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <OrderTimeBadge
                        createdAt={order.orderCreatedAt}
                        compact
                        showIcon={false}
                        className="text-[10px]"
                      />
                      {dsLabel && (
                        <span
                          className={`px-1.5 py-px rounded-full font-medium text-[10px] ${DELIVERY_STATUS_COLORS[ds!]}`}
                        >
                          {dsLabel}
                        </span>
                      )}
                      {order.paymentTiming === "on_delivery" && (
                        <span className="text-amber-600 font-semibold flex items-center gap-0.5">
                          {PayIcon && <PayIcon className="w-3 h-3 shrink-0" />}
                          Cobrar R$ {order.totalAmount.toFixed(2)}
                        </span>
                      )}
                      {hasFridges && (
                        <span className="text-blue-500 font-semibold flex items-center gap-0.5">
                          🥤 {orderFridges.reduce((s, i) => s + i.quantity, 0)}{" "}
                          refri
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: status + move + chevron */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {canMoveOrders && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all rounded-lg shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDirectRemove(order.orderId);
                        }}
                        title="Remover da rota"
                        data-testid={`button-remove-from-route-${order.orderId}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                    {canMoveOrders && expanded && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-[#94A3B8] hover:text-[#0F172A] hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all rounded-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveOrder(order.orderId, order.customerName);
                        }}
                        title="Mover pedido"
                      >
                        <ArrowRightLeft className="w-3 h-3" />
                      </Button>
                    )}
                    {expanded && (
                      <button
                        type="button"
                        className="rounded-md p-0.5 hover:bg-slate-200"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedOrderId(
                            isOrderExpanded ? null : order.orderId,
                          );
                        }}
                        title="Ver itens rápidos da entrega"
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-[#94A3B8] transition-transform shrink-0 ${isOrderExpanded ? "rotate-180" : ""}`}
                        />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded items panel (per-order, only when card is expanded) */}
                {isOrderExpanded && (
                  <div
                    className="px-3 pb-3 pt-1 space-y-1.5"
                    style={{ backgroundColor: "#F8FAFC" }}
                  >
                    <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide flex items-center gap-1">
                      <ShoppingBag className="w-3 h-3" /> Itens do pedido #
                      {order.orderId}
                    </p>
                    {(order.items ?? []).length === 0 ? (
                      <p className="text-[11px] text-[#94A3B8] italic">
                        Nenhum item registrado
                      </p>
                    ) : (
                      <div className="space-y-0.5">
                        {(order.items ?? []).map((item, itemIdx) => {
                          const isFridge = item.productName
                            .toLowerCase()
                            .includes("refri");
                          return (
                            <div
                              key={itemIdx}
                              className={`flex items-center justify-between text-[11px] px-2 py-1 rounded-md ${
                                isFridge
                                  ? "bg-blue-50 text-blue-800 font-semibold"
                                  : "text-[#334155]"
                              }`}
                            >
                              <span className="flex items-center gap-1">
                                {isFridge && <span>🥤</span>}
                                {item.productName}
                              </span>
                              <span
                                className={`font-bold shrink-0 ml-2 ${isFridge ? "text-blue-600" : "text-[#0F172A]"}`}
                              >
                                × {item.quantity}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-[#64748B] text-[10px] truncate pt-0.5">
                      📍 {order.deliveryAddress ?? "—"}
                      {order.deliveryNeighborhood
                        ? ` · ${order.deliveryNeighborhood}`
                        : ""}
                    </p>
                    {order.paymentTiming === "on_delivery" && (
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-md px-2 py-1">
                        <Banknote className="w-3 h-3 shrink-0" />
                        Cobrar R$ {order.totalAmount.toFixed(2)}
                        {changeAmt !== null && (
                          <span className="ml-1 text-orange-500">
                            · Troco R$ {changeAmt.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* "+N entregas" link when collapsed and there are hidden orders */}
          {!expanded && hiddenCount > 0 && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(true);
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium hover:bg-slate-50 transition-colors"
              data-testid={`btn-show-more-${route.id}`}
            >
              <Plus className="w-3 h-3" />+{hiddenCount} entrega
              {hiddenCount > 1 ? "s" : ""}
            </button>
          )}
        </div>

        {/* ── Readiness indicator (always visible) ── */}
        {isAvailable && (
          <div
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl ${
              allOrdersReady
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            {allOrdersReady ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium">
                  Todos prontos — pronto para sair!
                </span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  <strong>
                    {readyCount}/{totalCount}
                  </strong>{" "}
                  pedidos prontos na cozinha
                </span>
              </>
            )}
          </div>
        )}

        {/* ── Value info panel (always visible) ── */}
        <div
          className="rounded-xl px-3 py-2.5 text-xs space-y-1"
          style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[#64748B]">Valor da rota</span>
            <span className={`font-bold ${distanceTone.classes.text}`}>
              R$ {route.totalDeliveryFee.toFixed(2)}
            </span>
          </div>
          {route.totalToReceive > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">Receber na entrega</span>
              <span className="font-semibold text-amber-600">
                R$ {route.totalToReceive.toFixed(2)}
              </span>
            </div>
          )}
          {route.totalChangeNeeded > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">Troco necessário</span>
              <span className="font-semibold text-orange-500">
                R$ {route.totalChangeNeeded.toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[#64748B]">Pedidos</span>
            <span className="font-semibold text-[#0F172A]">{totalCount}</span>
          </div>
        </div>

        {/* ── Expandable: route summary with fridges + charges detail ── */}
        {expanded && hasDetailedContent && (
          <div
            className="rounded-xl border px-3 py-2 text-xs space-y-1.5"
            style={{ backgroundColor: "#F8FAFC", borderColor: "#E2E8F0" }}
          >
            <p className="font-semibold text-[#0F172A] text-[11px] uppercase tracking-wide">
              Resumo da rota
            </p>
            {totalFridges > 0 && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-blue-700 font-medium">
                  🥤 Refrigerantes
                </span>
                <span className="font-bold text-blue-700">
                  {totalFridges} un.
                </span>
              </div>
            )}
            {sortedOrders.filter((o) => o.paymentTiming === "on_delivery")
              .length > 0 && (
              <div className="border-t border-[#E2E8F0] pt-1.5">
                <p className="flex items-center gap-1 text-amber-700 font-semibold mb-1">
                  <Banknote className="w-3 h-3" /> Cobranças na entrega
                </p>
                {sortedOrders
                  .filter((o) => o.paymentTiming === "on_delivery")
                  .map((o) => {
                    const chg =
                      o.needsChange === "true" && o.changeFor
                        ? Math.max(0, o.changeFor - o.totalAmount)
                        : null;
                    return (
                      <div
                        key={o.orderId}
                        className="flex items-center justify-between py-0.5"
                      >
                        <span className="font-bold text-amber-800">
                          #{o.orderId}
                        </span>
                        <div className="text-right">
                          <span className="font-bold text-amber-700">
                            R$ {o.totalAmount.toFixed(2)}
                          </span>
                          {chg !== null && chg > 0 && (
                            <span className="text-orange-500 ml-1.5">
                              · Troco R$ {chg.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                <div className="border-t border-amber-200 mt-1 pt-1 flex items-center justify-between">
                  <span className="text-amber-700">Total</span>
                  <span className="font-bold text-amber-700">
                    R$ {route.totalToReceive.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Ver/Ocultar detalhes toggle ── */}
        {showExpandToggle && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              handleToggleExpand();
            }}
            className="flex items-center justify-center gap-1.5 text-xs font-medium transition-colors rounded-lg py-1.5 border border-[#E2E8F0] hover:bg-slate-50"
            style={{ color: "#64748B" }}
            data-testid={`btn-toggle-details-${route.id}`}
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
            {expanded ? "Ocultar detalhes" : "Ver detalhes"}
          </button>
        )}

        {/* ── Footer ── */}
        <div
          className="flex items-center gap-2 pt-1 mt-auto"
          style={{ borderTop: "1px solid #E2E8F0" }}
        >
          <div className="flex-1" />

          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 rounded-lg"
            onClick={(event) => {
              event.stopPropagation();
              onQrCode();
            }}
            data-testid={`button-qr-${route.id}`}
          >
            <QrCode className="w-3.5 h-3.5" />
          </Button>

          {isAvailable && (
            <Button
              size="sm"
              className="h-8 gap-1.5 rounded-lg font-semibold text-white border-0"
              style={{ backgroundColor: "#D91F16", color: "#FFFFFF" }}
              onClick={(event) => {
                event.stopPropagation();
                onAssign();
              }}
              title="Assumir esta rota"
              data-testid={`button-assign-${route.id}`}
            >
              <Play className="w-3.5 h-3.5" />
              Assumir Rota
            </Button>
          )}

          {isInProgress && (
            <Button
              size="sm"
              className="flex-1 h-8 gap-1.5 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white"
              onClick={(event) => {
                event.stopPropagation();
                onComplete();
              }}
              disabled={completing}
              data-testid={`button-complete-${route.id}`}
            >
              <Truck className="w-3.5 h-3.5" />
              {completing ? "Concluindo..." : "Entrega em Andamento"}
            </Button>
          )}

          {isCompleted && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Rota concluída
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
