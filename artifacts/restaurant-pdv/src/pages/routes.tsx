import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Truck, RefreshCw, Sparkles, MapPin, Package, DollarSign, User, Phone,
  Banknote, CreditCard, Smartphone, QrCode, Play, CheckCircle2, Clock,
  AlertTriangle, AlertCircle, Hash, Plus, Minus, ArrowRightLeft, Zap, X,
  ChevronRight, Timer, PlusCircle, Lock,
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

// ─── Types ───────────────────────────────────────────────────────────────────

type RouteStatus = "available" | "in_progress" | "completed";
type DeliveryOrderStatus = "pending" | "preparing" | "ready" | "out_for_delivery" | "delivered";

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
  totalAmount: number;
  deliveryStatus: string | null;
  paymentTiming: string | null;
  needsChange: string | null;
  changeFor: number | null;
  deliveryPaymentMethod: string | null;
  deliveryPaymentNotes: string | null;
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
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

const DELIVERY_STATUS_LABELS: Record<DeliveryOrderStatus, string> = {
  pending: "Aguardando",
  preparing: "Preparando",
  ready: "Pronto",
  out_for_delivery: "A caminho",
  delivered: "Entregue",
};

const DELIVERY_STATUS_COLORS: Record<DeliveryOrderStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  preparing: "bg-amber-100 text-amber-700",
  ready: "bg-emerald-100 text-emerald-700",
  out_for_delivery: "bg-blue-100 text-blue-700",
  delivered: "bg-purple-100 text-purple-700",
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Routes() {
  const { toast } = useToast();
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingDeliveryOrder[]>([]);
  const [dispatchMinutes, setDispatchMinutes] = useState(20);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingDispatch, setSavingDispatch] = useState(false);
  const [, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const [qrRoute, setQrRoute] = useState<DeliveryRoute | null>(null);
  const [assignRoute, setAssignRoute] = useState<DeliveryRoute | null>(null);
  const [courierName, setCourierName] = useState("");
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null);
  const [couriers, setCouriers] = useState<{ id: number; name: string; vehicle: string }[]>([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!assignRoute) return;
    apiFetch<{ id: number; name: string; vehicle: string }[]>("/couriers")
      .then(setCouriers)
      .catch(() => setCouriers([]));
  }, [assignRoute]);
  const [completing, setCompleting] = useState<number | null>(null);
  const [moveOrderState, setMoveOrderState] = useState<MoveOrderState | null>(null);
  const [movingOrder, setMovingOrder] = useState(false);
  const [addPendingState, setAddPendingState] = useState<AddPendingState | null>(null);
  const [addingToRoute, setAddingToRoute] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

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
      const data = await apiFetch<PendingDeliveryOrder[]>("/delivery/orders/pending");
      setPendingOrders(data);
    } catch {
      // silently ignore
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const s = await apiFetch<{ deliveryDispatchTimeMinutes: number }>("/settings");
      setDispatchMinutes(s.deliveryDispatchTimeMinutes);
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
        { method: "POST" }
      );
      await Promise.all([fetchRoutes(), fetchPendingOrders()]);
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

  const handleUpdateDispatchTime = async (delta: number) => {
    const newMinutes = Math.max(5, Math.min(120, dispatchMinutes + delta));
    setDispatchMinutes(newMinutes);
    setSavingDispatch(true);
    try {
      await apiFetch("/settings", {
        method: "PUT",
        body: JSON.stringify({ deliveryDispatchTimeMinutes: newMinutes }),
      });
      await fetchPendingOrders();
    } catch {
      toast({ title: "Erro ao atualizar prazo", variant: "destructive" });
      setDispatchMinutes(dispatchMinutes);
    } finally {
      setSavingDispatch(false);
    }
  };

  const handleAssign = async () => {
    if (!assignRoute) return;
    const hasSelection = selectedCourierId !== null || courierName.trim();
    if (!hasSelection) return;
    setAssigning(true);
    try {
      const body = selectedCourierId
        ? { courierId: selectedCourierId }
        : { courierName: courierName.trim() };
      await apiFetch(`/delivery/routes/${assignRoute.id}/assign`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await fetchRoutes();
      const name = couriers.find((c) => c.id === selectedCourierId)?.name ?? courierName.trim();
      toast({ title: `Rota assumida por ${name}!` });
      setAssignRoute(null);
      setCourierName("");
      setSelectedCourierId(null);
    } catch (e) {
      toast({ title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  const handleComplete = async (route: DeliveryRoute) => {
    setCompleting(route.id);
    try {
      await apiFetch(`/delivery/routes/${route.id}/complete`, { method: "POST" });
      await fetchRoutes();
      toast({ title: "Rota concluída! Pedidos marcados como entregues." });
    } catch (e) {
      toast({ title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`, variant: "destructive" });
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
        body: JSON.stringify({ orderId: moveOrderState.orderId, targetRouteId }),
      });
      await Promise.all([fetchRoutes(), fetchPendingOrders()]);
      toast({ title: "Pedido movido!" });
      setMoveOrderState(null);
    } catch (e) {
      toast({ title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`, variant: "destructive" });
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
      toast({ title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`, variant: "destructive" });
    } finally {
      setMovingOrder(false);
    }
  };

  const handleCreateEmergency = async (orderId: number, fromMoveDialog?: boolean) => {
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
      toast({ title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`, variant: "destructive" });
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
      toast({ title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`, variant: "destructive" });
    } finally {
      setAddingToRoute(false);
    }
  };

  const activeRoutes = routes.filter((r) => r.status !== "completed");
  const completedRoutes = routes.filter((r) => r.status === "completed");

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
              Delivery em tempo real — agrupe pedidos em rotas quando estiver pronto
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-muted rounded-lg px-2.5 py-1.5 text-sm">
              <Timer className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground text-xs">Prazo:</span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0"
                onClick={() => handleUpdateDispatchTime(-5)}
                disabled={savingDispatch || dispatchMinutes <= 5}>
                <Minus className="w-3 h-3" />
              </Button>
              <span className="font-semibold w-14 text-center text-xs">
                {savingDispatch ? "..." : `${dispatchMinutes} min`}
              </span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0"
                onClick={() => handleUpdateDispatchTime(5)}
                disabled={savingDispatch || dispatchMinutes >= 120}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button onClick={handleGroupRoutes} disabled={generating} className="gap-1.5"
              data-testid="button-generate-routes">
              <Sparkles className="w-4 h-4" />
              {generating ? "Agrupando..." : "Rotas Prontas"}
            </Button>
          </div>
        </div>

        {/* ── Stats strip ── */}
        {(routes.length > 0 || pendingOrders.length > 0) && (
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { label: "Aguardando rota", count: pendingOrders.length, color: "text-orange-500", dot: "bg-orange-400" },
              { label: "Disponíveis", count: activeRoutes.filter((r) => r.status === "available").length, color: "text-blue-500", dot: "bg-blue-400" },
              { label: "Em andamento", count: activeRoutes.filter((r) => r.status === "in_progress").length, color: "text-amber-500", dot: "bg-amber-400" },
              { label: "Concluídas hoje", count: completedRoutes.length, color: "text-emerald-600", dot: "bg-emerald-400" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                <span className={`text-xl font-bold ${s.color}`}>{s.count}</span>
                <span className="text-xs text-muted-foreground">{s.label}</span>
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
        {!loading && routes.length === 0 && pendingOrders.length === 0 && (
          <div className="text-center py-16 border-2 border-dashed rounded-xl text-muted-foreground">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-lg font-semibold mb-1">Nenhum pedido delivery</p>
            <p className="text-sm max-w-xs mx-auto">
              Pedidos de delivery aparecem aqui assim que registrados. Use{" "}
              <strong>Rotas Prontas</strong> para agrupá-los.
            </p>
          </div>
        )}

        {/* ── Pending orders (compact list) ── */}
        {!loading && pendingOrders.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-base font-semibold">Aguardando Rota</h2>
              <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                {pendingOrders.length}
              </Badge>
              {activeRoutes.length > 0 ? (
                <span className="text-xs text-muted-foreground hidden sm:block">
                  — selecione <strong>Adicionar à Rota</strong> ou clique em <strong>Rotas Prontas</strong>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground hidden sm:block">
                  — clique em <strong>Rotas Prontas</strong> para agrupar
                </span>
              )}
            </div>

            <div className="rounded-xl border border-border overflow-hidden bg-card">
              {pendingOrders.map((order, idx) => (
                <PendingOrderRow
                  key={order.id}
                  order={order}
                  dispatchMinutes={dispatchMinutes}
                  activeRoutes={activeRoutes}
                  isLast={idx === pendingOrders.length - 1}
                  onAddToRoute={() => setAddPendingState({ orderId: order.id, customerName: order.customerName })}
                  onEmergency={() => handleCreateEmergency(order.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Active routes ── */}
        {activeRoutes.length > 0 && (
          <section>
            <h2 className="text-base font-semibold mb-2">
              Rotas Ativas
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({activeRoutes.length})
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {activeRoutes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  allActiveRoutes={activeRoutes}
                  onAssign={() => { setAssignRoute(route); setCourierName(""); }}
                  onComplete={() => handleComplete(route)}
                  onQrCode={() => setQrRoute(route)}
                  onMoveOrder={(orderId, customerName) =>
                    setMoveOrderState({ orderId, routeId: route.id, customerName })
                  }
                  completing={completing === route.id}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Completed routes ── */}
        {completedRoutes.length > 0 && (
          <section>
            <button
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
              onClick={() => setShowCompleted((v) => !v)}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-medium">
                {showCompleted ? "Ocultar concluídas" : `Ver rotas concluídas (${completedRoutes.length})`}
              </span>
              <ChevronRight className={`w-4 h-4 transition-transform ${showCompleted ? "rotate-90" : ""}`} />
            </button>
            {showCompleted && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-3 opacity-60">
                {completedRoutes.map((route) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    allActiveRoutes={[]}
                    onAssign={() => {}}
                    onComplete={() => {}}
                    onQrCode={() => setQrRoute(route)}
                    onMoveOrder={() => {}}
                    completing={false}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* ── QR Code Modal ── */}
      <Dialog open={!!qrRoute} onOpenChange={(open) => { if (!open) setQrRoute(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              QR Code — {qrRoute?.name}
            </DialogTitle>
            <DialogDescription>Escaneie para abrir no Google Maps</DialogDescription>
          </DialogHeader>
          {qrRoute?.mapsUrl ? (
            <div className="space-y-3">
              <div className="flex justify-center p-4 bg-white rounded-xl border">
                <QRCodeSVG value={qrRoute.mapsUrl} size={210} level="M" includeMargin={false} />
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Paradas ({qrRoute.orders.length}):</p>
                {[...qrRoute.orders]
                  .sort((a, b) => a.stopOrder - b.stopOrder)
                  .map((o) => (
                    <div key={o.id} className="flex items-start gap-1.5">
                      <span className="font-bold text-primary shrink-0">{o.stopOrder}.</span>
                      <div>
                        <p>{o.customerName ?? `Pedido #${o.orderId}`} · {o.deliveryAddress ?? "—"}</p>
                        {o.deliveryCep && <p className="text-muted-foreground">CEP: {o.deliveryCep}</p>}
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
              <a href={qrRoute.mapsUrl} target="_blank" rel="noopener noreferrer" className="block">
                <Button variant="outline" size="sm" className="w-full gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Abrir no Maps
                </Button>
              </a>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum endereço configurado</p>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Assign Modal ── */}
      <Dialog open={!!assignRoute} onOpenChange={(open) => {
        if (!open) { setAssignRoute(null); setSelectedCourierId(null); setCourierName(""); }
      }}>
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
                <p>Total a cobrar: <strong>R$ {assignRoute.totalToReceive.toFixed(2)}</strong></p>
                {assignRoute.totalChangeNeeded > 0 && (
                  <p>Troco necessário: <strong>R$ {assignRoute.totalChangeNeeded.toFixed(2)}</strong></p>
                )}
              </div>
            )}

            {/* Courier list */}
            {couriers.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Selecione o motoboy:</p>
                <div className="grid gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {couriers.map((c) => {
                    const isSelected = selectedCourierId === c.id;
                    const vehicleEmoji = c.vehicle === "bike" ? "🚲" : c.vehicle === "carro" ? "🚗" : "🏍️";
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setSelectedCourierId(c.id); setCourierName(""); }}
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
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">ou digite manualmente</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">
                Nenhum motoboy cadastrado. <a href="/motoboys" className="underline text-primary">Cadastrar agora</a>
              </p>
            )}

            <Input
              placeholder="Nome do motoboy (avulso)"
              value={courierName}
              onChange={(e) => { setCourierName(e.target.value); if (e.target.value) setSelectedCourierId(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleAssign()}
              data-testid="input-courier-name"
            />

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setAssignRoute(null); setSelectedCourierId(null); setCourierName(""); }}>Cancelar</Button>
              <Button className="flex-1" onClick={handleAssign}
                disabled={assigning || (!selectedCourierId && !courierName.trim())}
                data-testid="button-confirm-assign">
                {assigning ? "Salvando..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Pending to Route Modal ── */}
      <Dialog open={!!addPendingState} onOpenChange={(open) => { if (!open) setAddPendingState(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="w-5 h-5" />
              Adicionar à Rota
            </DialogTitle>
            <DialogDescription>
              Pedido de{" "}
              <strong>{addPendingState?.customerName ?? `#${addPendingState?.orderId}`}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {activeRoutes.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">Escolha a rota de destino:</p>
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
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                        <div className="text-left min-w-0">
                          <p className="text-sm font-medium truncate">{r.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.orders.length} pedido{r.orders.length !== 1 ? "s" : ""} · {r.mainNeighborhood}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-xs ${URGENCY_TEXT[ts.urgency]}`}>{ts.label}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </Button>
                  );
                })}
                <div className="border-t pt-2">
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400"
                    onClick={() => addPendingState && handleCreateEmergency(addPendingState.orderId)}
                    disabled={addingToRoute}
                  >
                    <Zap className="w-4 h-4" />
                    Criar rota solitária
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Não há rotas ativas. Criar uma rota solitária para este pedido?</p>
                <Button
                  className="w-full gap-2"
                  onClick={() => addPendingState && handleCreateEmergency(addPendingState.orderId)}
                  disabled={addingToRoute}
                >
                  <Zap className="w-4 h-4" />
                  Criar rota solitária
                </Button>
              </>
            )}
            <Button variant="ghost" className="w-full" onClick={() => setAddPendingState(null)} disabled={addingToRoute}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Move Order Modal (from route card) ── */}
      <Dialog open={!!moveOrderState} onOpenChange={(open) => { if (!open) setMoveOrderState(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" />
              Mover Pedido
            </DialogTitle>
            <DialogDescription>
              Pedido de <strong>{moveOrderState?.customerName ?? `#${moveOrderState?.orderId}`}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {routes.filter((r) => r.status !== "completed" && r.id !== moveOrderState?.routeId).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mover para</p>
                {routes
                  .filter((r) => r.status !== "completed" && r.id !== moveOrderState?.routeId)
                  .map((r) => (
                    <Button
                      key={r.id}
                      variant="outline"
                      className="w-full justify-between gap-2"
                      onClick={() => handleMoveToRoute(r.id)}
                      disabled={movingOrder}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                        <span className="truncate text-sm">{r.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">({r.orders.length} ped.)</span>
                      </div>
                      <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                    </Button>
                  ))}
              </div>
            )}
            <div className="border-t pt-2 space-y-1.5">
              <Button
                variant="outline"
                className="w-full gap-2 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400"
                onClick={() => moveOrderState && handleCreateEmergency(moveOrderState.orderId, true)}
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
            <Button variant="ghost" className="w-full" onClick={() => setMoveOrderState(null)} disabled={movingOrder}>
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
  onAddToRoute,
  onEmergency,
}: {
  order: PendingDeliveryOrder;
  dispatchMinutes: number;
  activeRoutes: DeliveryRoute[];
  isLast: boolean;
  onAddToRoute: () => void;
  onEmergency: () => void;
}) {
  const deadlineMs = order.kitchenAcceptedAt
    ? new Date(order.kitchenAcceptedAt).getTime() + dispatchMinutes * 60_000
    : null;
  const timeStatus = deadlineMs ? getTimeStatus(new Date(deadlineMs).toISOString()) : null;

  const ds = order.deliveryStatus as DeliveryOrderStatus | null;
  const dsLabel = ds ? DELIVERY_STATUS_LABELS[ds] : null;
  const dsColor = ds ? DELIVERY_STATUS_COLORS[ds] : "";
  const urgency = timeStatus?.urgency ?? "ok";
  const UrgencyIcon = URGENCY_ICON[urgency];

  return (
    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors ${!isLast ? "border-b border-border" : ""}`}>
      {/* Urgency dot */}
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${timeStatus ? URGENCY_DOT[urgency] : "bg-gray-300"}`} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">
            {order.customerName ?? `Pedido #${order.id}`}
          </span>
          {dsLabel && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${dsColor}`}>
              {dsLabel}
            </span>
          )}
          {order.paymentTiming === "on_delivery" && (
            <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded-full shrink-0">
              💰 R$ {order.totalAmount.toFixed(2)} na entrega
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {[order.deliveryNeighborhood, order.deliveryCep].filter(Boolean).join(" · ")}
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
          <div className={`flex items-center gap-1 text-xs font-medium ${URGENCY_TEXT[urgency]}`}>
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
            onClick={onAddToRoute}
            title="Adicionar a uma rota existente"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Adicionar à rota</span>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs gap-1 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:text-orange-400"
          onClick={onEmergency}
          title="Criar rota solitária"
        >
          <Zap className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Solitária</span>
        </Button>
      </div>
    </div>
  );
}

// ─── Rarity system based on total delivery fee ────────────────────────────────

function getRarity(fee: number): { color: string; glow: string; label: string } {
  if (fee > 50) return { color: "#eab308", glow: "rgba(234,179,8,0.35)",  label: "Ouro"  };
  if (fee > 20) return { color: "#a855f7", glow: "rgba(168,85,247,0.35)", label: "Roxo"  };
  if (fee > 10) return { color: "#22c55e", glow: "rgba(34,197,94,0.35)",  label: "Verde" };
  return          { color: "#3b82f6", glow: "rgba(59,130,246,0.35)",  label: "Azul"  };
}

// ─── RouteCard ────────────────────────────────────────────────────────────────

function RouteCard({
  route,
  allActiveRoutes,
  onAssign,
  onComplete,
  onQrCode,
  onMoveOrder,
  completing,
}: {
  route: DeliveryRoute;
  allActiveRoutes: DeliveryRoute[];
  onAssign: () => void;
  onComplete: () => void;
  onQrCode: () => void;
  onMoveOrder: (orderId: number, customerName: string | null) => void;
  completing: boolean;
}) {
  const isAvailable = route.status === "available";
  const isInProgress = route.status === "in_progress";
  const isCompleted = route.status === "completed";
  const sortedOrders = [...route.orders].sort((a, b) => a.stopOrder - b.stopOrder);
  const canMoveOrders = isAvailable || isInProgress;

  const timeStatus = !isCompleted ? getTimeStatus(route.dispatchDeadline) : null;
  const urgency = timeStatus?.urgency ?? "ok";
  const TimeIcon = URGENCY_ICON[urgency];

  const readyCount = route.orders.filter((o) => o.deliveryStatus === "ready").length;
  const deliveredCount = route.orders.filter((o) => o.deliveryStatus === "delivered").length;
  const totalCount = route.orders.length;
  const allOrdersReady = totalCount > 0 && readyCount === totalCount;

  const rarity = getRarity(route.totalDeliveryFee);

  const progressRatio = isCompleted ? 1 : isInProgress ? 1 : (totalCount > 0 ? deliveredCount / totalCount : 0);
  const ringR = 20;
  const ringCirc = 2 * Math.PI * ringR;
  const ringOffset = ringCirc * (1 - progressRatio);
  const ringColor = isCompleted ? "#22c55e" : rarity.color;

  const otherNeighborhoods = route.includedNeighborhoods.filter((n) => n !== route.mainNeighborhood);

  return (
    <div
      className="rounded-2xl border-2 overflow-hidden flex flex-col bg-zinc-100 text-zinc-900 transition-shadow"
      data-testid={`card-route-${route.id}`}
      style={{
        borderColor: rarity.color,
        boxShadow: `0 0 28px 6px ${rarity.glow}, 0 4px 16px -4px rgba(0,0,0,0.4)`,
      }}
    >
      <div className="p-4 flex flex-col gap-3 flex-1">

        {/* ── Header ── */}
        <div className="flex items-start gap-3">
          {/* Circular progress ring around stop count */}
          <div className="relative w-12 h-12 shrink-0">
            <svg
              className="absolute inset-0 w-full h-full -rotate-90"
              viewBox="0 0 48 48"
            >
              {/* Track */}
              <circle
                cx="24" cy="24" r={ringR}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-secondary"
              />
              {/* Progress */}
              <circle
                cx="24" cy="24" r={ringR}
                fill="none"
                stroke={ringColor}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={ringCirc}
                strokeDashoffset={ringOffset}
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            {/* Number */}
            <div
              className="absolute inset-0 flex items-center justify-center font-black text-sm"
              style={{
                color: rarity.color,
                textShadow: `0 0 8px ${rarity.glow}, 0 0 20px ${rarity.glow}`,
                WebkitTextStroke: `0.5px ${rarity.color}`,
              }}
            >
              {totalCount}
            </div>
            {/* Color dot */}
            <span
              className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-card"
              style={{ backgroundColor: route.color }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-snug">{route.name}</h3>
            <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="font-medium">{route.mainNeighborhood}</span>
              {otherNeighborhoods.length > 0 && (
                <span className="opacity-60 truncate">· {otherNeighborhoods.join(", ")}</span>
              )}
            </div>
          </div>

          {/* Time pill */}
          {timeStatus && !isCompleted && (
            <div className={`shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full
              ${urgency === "ok" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : ""}
              ${urgency === "warning" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : ""}
              ${urgency === "danger" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : ""}
            `}>
              <TimeIcon className="w-3 h-3 shrink-0" />
              <span>{timeStatus.label}</span>
            </div>
          )}
          {isCompleted && route.completedAt && (
            <div className="shrink-0 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {new Date(route.completedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>

        {/* ── Orders list — dark rows ── */}
        <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-200 dark:divide-zinc-700">
          {sortedOrders.map((order) => {
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
              order.paymentTiming === "on_delivery" && order.deliveryPaymentMethod
                ? (PAYMENT_METHOD_ICONS[order.deliveryPaymentMethod] ?? Banknote)
                : null;
            const changeAmt =
              order.needsChange === "true" && order.changeFor
                ? Math.max(0, order.changeFor - order.totalAmount)
                : null;

            return (
              <div
                key={order.id}
                className="flex items-center gap-2.5 px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 transition-colors text-xs group rounded-lg mx-1 my-0.5"
                data-testid={`route-order-${order.orderId}`}
              >
                {/* Stop number */}
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black shrink-0 border"
                  style={{
                    backgroundColor: "transparent",
                    borderColor: rarity.color,
                    color: rarity.color,
                    boxShadow: `0 0 6px ${rarity.glow}`,
                  }}
                >
                  {order.stopOrder}
                </div>

                {/* Status dot */}
                <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">{order.customerName ?? `Pedido #${order.orderId}`}</p>
                  <p className="text-zinc-400 truncate">
                    {order.deliveryAddress ?? "—"}
                    {order.deliveryNeighborhood ? ` · ${order.deliveryNeighborhood}` : ""}
                  </p>
                  {order.paymentTiming === "on_delivery" && (
                    <div className="text-amber-700 font-semibold flex items-center gap-1 mt-0.5">
                      {PayIcon && <PayIcon className="w-3 h-3 shrink-0" />}
                      Cobrar R$ {order.totalAmount.toFixed(2)}
                      {changeAmt !== null && ` · Troco R$ ${changeAmt.toFixed(2)}`}
                    </div>
                  )}
                </div>

                {/* Right: status label + move button */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {dsLabel && (
                    <span className={`px-1.5 py-px rounded-full font-medium text-[10px] ${DELIVERY_STATUS_COLORS[ds!]}`}>
                      {dsLabel}
                    </span>
                  )}
                  {canMoveOrders && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg"
                      onClick={() => onMoveOrder(order.orderId, order.customerName)}
                      title="Mover pedido"
                    >
                      <ArrowRightLeft className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Readiness indicator ── */}
        {isAvailable && (
          <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl
            ${allOrdersReady
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
              : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
            }`}
          >
            {allOrdersReady ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium">Todos prontos — pronto para sair!</span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span><strong>{readyCount}/{totalCount}</strong> pedidos prontos na cozinha</span>
              </>
            )}
          </div>
        )}

        {/* ── Cobrança summary ── */}
        {sortedOrders.some((o) => o.paymentTiming === "on_delivery") && !isCompleted && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs space-y-0.5">
            <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5" />
              Resumo de cobrança
            </p>
            <p>Total: <strong>R$ {route.totalToReceive.toFixed(2)}</strong></p>
            {route.totalChangeNeeded > 0 && (
              <p>Troco: <strong>R$ {route.totalChangeNeeded.toFixed(2)}</strong></p>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="flex items-center gap-2 pt-1 mt-auto border-t border-border/40">
          <div className="flex-1 text-xs flex items-center gap-2">
            <span className="text-emerald-600 font-semibold">
              Taxa R$ {route.totalDeliveryFee.toFixed(2)}
            </span>
            {route.totalToReceive > 0 && (
              <span className="text-amber-600">
                · Cobrar R$ {route.totalToReceive.toFixed(2)}
              </span>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 rounded-lg"
            onClick={onQrCode}
            data-testid={`button-qr-${route.id}`}
          >
            <QrCode className="w-3.5 h-3.5" />
          </Button>

          {isAvailable && (
            <Button
              size="sm"
              className="h-8 gap-1.5 rounded-lg font-semibold text-white border-0"
              style={{ backgroundColor: rarity.color }}
              onClick={onAssign}
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
              onClick={onComplete}
              disabled={completing}
              data-testid={`button-complete-${route.id}`}
            >
              <Truck className="w-3.5 h-3.5" />
              {completing ? "Concluindo..." : "Entrega em Andamento"}
            </Button>
          )}

          {isCompleted && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Rota concluída
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
