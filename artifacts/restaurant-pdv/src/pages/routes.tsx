import { useState, useEffect, useCallback, useRef } from "react";
import { Layout } from "@/components/layout";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Truck,
  MapPin,
  Phone,
  User,
  QrCode,
  Play,
  CheckCircle2,
  RefreshCw,
  Package,
  DollarSign,
  Sparkles,
  Clock,
  Plus,
  Minus,
  Banknote,
  CreditCard,
  Smartphone,
  AlertTriangle,
  AlertCircle,
  Hash,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

type RouteStatus = "available" | "in_progress" | "completed";

type DeliveryOrderStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered";

interface RouteOrder {
  id: number;
  routeId: number;
  orderId: number;
  stopOrder: number;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryNeighborhood: string | null;
  deliveryCep: string | null;
  deliveryFee: number;
  deliveryStatus: DeliveryOrderStatus | null;
  totalAmount: number;
  paymentTiming: "now" | "on_delivery";
  deliveryPaymentMethod: string | null;
  needsChange: string | null;
  changeFor: number | null;
  deliveryPaymentNotes: string | null;
  orderCreatedAt: string | null;
}

interface DeliveryRoute {
  id: number;
  name: string;
  mainNeighborhood: string;
  includedNeighborhoods: string[];
  status: RouteStatus;
  color: string;
  courierName: string | null;
  storeOrigin: string;
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
  ready: "bg-green-100 text-green-700",
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
  if (!dispatchDeadline) return { label: "Sem prazo definido", urgency: "ok" };

  const diffMs = new Date(dispatchDeadline).getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60_000);

  if (diffMin > 5) return { label: `Sai em até ${diffMin} min`, urgency: "ok" };
  if (diffMin > 0) return { label: `Faltam ${diffMin} min`, urgency: "warning" };
  return { label: `Atrasado há ${Math.abs(diffMin)} min`, urgency: "danger" };
}

const TIME_URGENCY_STYLES: Record<
  TimeUrgency,
  { text: string; bg: string; icon: typeof Clock }
> = {
  ok: {
    text: "text-green-700 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800",
    icon: Clock,
  },
  warning: {
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800",
    icon: AlertTriangle,
  },
  danger: {
    text: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800",
    icon: AlertCircle,
  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Routes() {
  const { toast } = useToast();
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [, setTick] = useState(0); // force re-render for timer
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const [qrRoute, setQrRoute] = useState<DeliveryRoute | null>(null);
  const [assignRoute, setAssignRoute] = useState<DeliveryRoute | null>(null);
  const [courierName, setCourierName] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [completing, setCompleting] = useState<number | null>(null);
  const [adjusting, setAdjusting] = useState<number | null>(null);

  const fetchRoutes = useCallback(async () => {
    try {
      const data = await apiFetch<DeliveryRoute[]>("/delivery/routes");
      setRoutes(data);
    } catch {
      toast({ title: "Erro ao carregar rotas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRoutes();
    const pollInterval = setInterval(fetchRoutes, 30_000);
    // Timer tick every 30 seconds for deadline countdown
    timerRef.current = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      clearInterval(pollInterval);
      clearInterval(timerRef.current);
    };
  }, [fetchRoutes]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { created } = await apiFetch<{ created: number }>(
        "/delivery/routes/generate",
        { method: "POST" }
      );
      await fetchRoutes();
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

  const handleAssign = async () => {
    if (!assignRoute || !courierName.trim()) return;
    setAssigning(true);
    try {
      await apiFetch(`/delivery/routes/${assignRoute.id}/assign`, {
        method: "POST",
        body: JSON.stringify({ courierName: courierName.trim() }),
      });
      await fetchRoutes();
      toast({ title: `Rota assumida por ${courierName.trim()}!` });
      setAssignRoute(null);
      setCourierName("");
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
      await apiFetch(`/delivery/routes/${route.id}/complete`, { method: "POST" });
      await fetchRoutes();
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

  const handleAdjustTime = async (routeId: number, minutesDelta: number) => {
    setAdjusting(routeId);
    try {
      const updated = await apiFetch<DeliveryRoute>(
        `/delivery/routes/${routeId}/adjust-time`,
        { method: "POST", body: JSON.stringify({ minutesDelta }) }
      );
      setRoutes((prev) => prev.map((r) => (r.id === routeId ? updated : r)));
    } catch {
      toast({ title: "Erro ao ajustar prazo", variant: "destructive" });
    } finally {
      setAdjusting(null);
    }
  };

  const activeRoutes = routes.filter((r) => r.status !== "completed");
  const completedRoutes = routes.filter((r) => r.status === "completed");

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Truck className="w-8 h-8 text-primary" />
              Painel de Rotas
            </h1>
            <p className="text-muted-foreground mt-1">
              Gerencie as rotas de entrega para motoboys
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={fetchRoutes} disabled={loading} size="sm">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generating}
              size="lg"
              className="gap-2"
              data-testid="button-generate-routes"
            >
              <Sparkles className="w-5 h-5" />
              {generating ? "Gerando..." : "Gerar Rotas"}
            </Button>
          </div>
        </div>

        {/* Stats */}
        {routes.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                label: "Disponíveis",
                count: routes.filter((r) => r.status === "available").length,
                color: "text-blue-600",
              },
              {
                label: "Em andamento",
                count: routes.filter((r) => r.status === "in_progress").length,
                color: "text-amber-600",
              },
              {
                label: "Concluídas",
                count: completedRoutes.length,
                color: "text-green-600",
              },
            ].map((s) => (
              <Card key={s.label} className="text-center py-3">
                <p className={`text-3xl font-bold ${s.color}`}>{s.count}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16 text-muted-foreground">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />
            <p>Carregando rotas...</p>
          </div>
        )}

        {/* Empty */}
        {!loading && routes.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed rounded-xl text-muted-foreground">
            <Truck className="w-14 h-14 mx-auto mb-4 opacity-20" />
            <p className="text-xl font-semibold mb-2">Nenhuma rota criada</p>
            <p className="text-sm max-w-sm mx-auto mb-6">
              Pedidos delivery em preparação ou prontos aparecem aqui. Clique em{" "}
              <strong>Gerar Rotas</strong> para agrupar automaticamente.
            </p>
            <Button onClick={handleGenerate} disabled={generating} size="lg">
              <Sparkles className="w-5 h-5 mr-2" />
              {generating ? "Gerando..." : "Gerar Rotas Agora"}
            </Button>
          </div>
        )}

        {/* Active routes */}
        {activeRoutes.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Rotas Ativas</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {activeRoutes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  onAssign={() => {
                    setAssignRoute(route);
                    setCourierName("");
                  }}
                  onComplete={() => handleComplete(route)}
                  onQrCode={() => setQrRoute(route)}
                  onAdjustTime={(delta) => handleAdjustTime(route.id, delta)}
                  completing={completing === route.id}
                  adjusting={adjusting === route.id}
                />
              ))}
            </div>
          </section>
        )}

        {/* Completed */}
        {completedRoutes.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-muted-foreground">Rotas Concluídas</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 opacity-65">
              {completedRoutes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  onAssign={() => {}}
                  onComplete={() => {}}
                  onQrCode={() => setQrRoute(route)}
                  onAdjustTime={() => {}}
                  completing={false}
                  adjusting={false}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* QR Code Modal */}
      <Dialog open={!!qrRoute} onOpenChange={(open) => { if (!open) setQrRoute(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              QR Code — {qrRoute?.name}
            </DialogTitle>
          </DialogHeader>
          {qrRoute?.mapsUrl ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Escaneie para abrir a rota no Google Maps
              </p>
              <div className="flex justify-center p-4 bg-white rounded-xl border">
                <QRCodeSVG value={qrRoute.mapsUrl} size={220} level="M" includeMargin={false} />
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
                <Button variant="outline" className="w-full gap-2">
                  <MapPin className="w-4 h-4" /> Abrir no Google Maps
                </Button>
              </a>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              Link do Google Maps não disponível.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Modal */}
      <Dialog open={!!assignRoute} onOpenChange={(open) => { if (!open) setAssignRoute(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" /> Assumir Rota
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Motoboy que vai assumir <strong>{assignRoute?.name}</strong>:
            </p>
            {assignRoute && assignRoute.totalToReceive > 0 && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm space-y-1">
                <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <Banknote className="w-4 h-4" /> Valores a receber na entrega
                </p>
                <p>Total a cobrar: <strong>R$ {assignRoute.totalToReceive.toFixed(2)}</strong></p>
                {assignRoute.totalChangeNeeded > 0 && (
                  <p>Troco necessário: <strong>R$ {assignRoute.totalChangeNeeded.toFixed(2)}</strong></p>
                )}
              </div>
            )}
            <Input
              placeholder="Nome do motoboy"
              value={courierName}
              onChange={(e) => setCourierName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAssign()}
              autoFocus
              data-testid="input-courier-name"
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setAssignRoute(null)}>
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={handleAssign}
                disabled={assigning || !courierName.trim()}
                data-testid="button-confirm-assign"
              >
                {assigning ? "Salvando..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

// ─── RouteCard ────────────────────────────────────────────────────────────────

function RouteCard({
  route,
  onAssign,
  onComplete,
  onQrCode,
  onAdjustTime,
  completing,
  adjusting,
}: {
  route: DeliveryRoute;
  onAssign: () => void;
  onComplete: () => void;
  onQrCode: () => void;
  onAdjustTime: (delta: number) => void;
  completing: boolean;
  adjusting: boolean;
}) {
  const isAvailable = route.status === "available";
  const isInProgress = route.status === "in_progress";
  const isCompleted = route.status === "completed";
  const sortedOrders = [...route.orders].sort((a, b) => a.stopOrder - b.stopOrder);

  const timeStatus = !isCompleted ? getTimeStatus(route.dispatchDeadline) : null;
  const timeStyle = timeStatus ? TIME_URGENCY_STYLES[timeStatus.urgency] : null;
  const TimeIcon = timeStyle?.icon ?? Clock;

  const onDeliveryOrders = sortedOrders.filter((o) => o.paymentTiming === "on_delivery");

  // Unique CEP prefixes (first 5 digits) for display
  const cepPrefixes = [
    ...new Set(
      sortedOrders
        .map((o) => (o.deliveryCep ?? "").replace(/\D/g, "").slice(0, 5))
        .filter(Boolean)
    ),
  ].slice(0, 4);

  return (
    <Card
      className="overflow-hidden border border-border shadow-sm hover:shadow-md transition-shadow"
      style={{ borderLeft: `4px solid ${route.color}` }}
      data-testid={`card-route-${route.id}`}
    >
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Colored dot indicator */}
              <span
                className="w-3 h-3 rounded-full shrink-0 mt-0.5"
                style={{ backgroundColor: route.color }}
              />
              <h3 className="font-bold text-lg leading-tight truncate">{route.name}</h3>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[route.status]}`}>
                {STATUS_LABELS[route.status]}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-1 flex-wrap text-sm text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>{route.mainNeighborhood}</span>
              {route.includedNeighborhoods.length > 1 && (
                <span className="text-xs">
                  + {route.includedNeighborhoods.filter((n) => n !== route.mainNeighborhood).join(", ")}
                </span>
              )}
            </div>
            {cepPrefixes.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mt-0.5">
                <Hash className="w-3 h-3 text-muted-foreground shrink-0" />
                {cepPrefixes.map((pfx) => (
                  <span key={pfx} className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {pfx}xxx
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="text-right shrink-0 space-y-0.5">
            <div className="flex items-center gap-1 justify-end text-sm font-semibold">
              <Package className="w-4 h-4" />
              {route.orders.length} {route.orders.length === 1 ? "pedido" : "pedidos"}
            </div>
            <div className="flex items-center gap-1 justify-end text-sm text-green-600 dark:text-green-400 font-medium">
              <DollarSign className="w-3.5 h-3.5" />
              Taxa: R$ {route.totalDeliveryFee.toFixed(2)}
            </div>
            {route.totalToReceive > 0 && (
              <div className="flex items-center gap-1 justify-end text-sm text-amber-600 dark:text-amber-400 font-medium">
                <Banknote className="w-3.5 h-3.5" />
                Cobrar: R$ {route.totalToReceive.toFixed(2)}
              </div>
            )}
            {route.totalChangeNeeded > 0 && (
              <div className="flex items-center gap-1 justify-end text-xs text-orange-600 dark:text-orange-400">
                Troco: R$ {route.totalChangeNeeded.toFixed(2)}
              </div>
            )}
          </div>
        </div>

        {/* Courier */}
        {route.courierName && (
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground flex-wrap">
            <User className="w-3.5 h-3.5" />
            <span>Motoboy: <strong>{route.courierName}</strong></span>
            {route.startedAt && (
              <span className="flex items-center gap-1 text-xs">
                <Clock className="w-3 h-3" />
                {new Date(route.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        )}
        {isCompleted && route.completedAt && (
          <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 mt-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Concluída às {new Date(route.completedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}

        {/* Time Alert */}
        {timeStatus && timeStyle && !isCompleted && (
          <div className={`mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium ${timeStyle.bg} ${timeStyle.text}`}>
            <div className="flex items-center gap-2">
              <TimeIcon className="w-4 h-4 shrink-0" />
              {timeStatus.label}
            </div>
            {!isCompleted && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 hover:bg-black/10"
                  onClick={() => onAdjustTime(-5)}
                  disabled={adjusting}
                  title="-5 min"
                >
                  <Minus className="w-3 h-3" />
                </Button>
                <span className="text-xs opacity-60">5</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 hover:bg-black/10"
                  onClick={() => onAdjustTime(5)}
                  disabled={adjusting}
                  title="+5 min"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* Orders list */}
        <div className="space-y-2">
          {sortedOrders.map((order) => {
            const ds = order.deliveryStatus as DeliveryOrderStatus | null;
            const dsLabel = ds ? DELIVERY_STATUS_LABELS[ds] : null;
            const dsColor = ds ? DELIVERY_STATUS_COLORS[ds] : "";
            const PayIcon =
              order.paymentTiming === "on_delivery" && order.deliveryPaymentMethod
                ? PAYMENT_METHOD_ICONS[order.deliveryPaymentMethod] ?? Banknote
                : null;

            const changeAmount =
              order.needsChange === "true" && order.changeFor
                ? Math.max(0, order.changeFor - order.totalAmount)
                : null;

            return (
              <div
                key={order.id}
                className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/40 text-sm"
                data-testid={`route-order-${order.orderId}`}
              >
                {/* Stop number */}
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5"
                  style={{ backgroundColor: route.color }}
                >
                  {order.stopOrder}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">
                      {order.customerName ?? `Pedido #${order.orderId}`}
                    </span>
                    {dsLabel && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${dsColor}`}>
                        {dsLabel}
                      </span>
                    )}
                  </div>
                  {order.customerPhone && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="w-3 h-3" />
                      {order.customerPhone}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground truncate">
                    <MapPin className="w-3 h-3 inline mr-0.5" />
                    {order.deliveryAddress ?? "—"}
                    {order.deliveryNeighborhood ? ` · ${order.deliveryNeighborhood}` : ""}
                  </p>
                  {order.deliveryCep && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      CEP: {order.deliveryCep}
                    </p>
                  )}

                  {/* Payment on delivery */}
                  {order.paymentTiming === "on_delivery" && (
                    <div className="mt-1 pt-1 border-t border-dashed border-amber-200 dark:border-amber-800 space-y-0.5">
                      <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 font-medium">
                        {PayIcon && <PayIcon className="w-3 h-3" />}
                        Pagar na entrega · {PAYMENT_METHOD_LABELS[order.deliveryPaymentMethod ?? ""] ?? order.deliveryPaymentMethod}
                      </div>
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                        Total: R$ {order.totalAmount.toFixed(2)}
                      </p>
                      {changeAmount !== null && (
                        <p className="text-xs text-orange-700 dark:text-orange-400">
                          Troco para R$ {order.changeFor!.toFixed(2)} · Levar: R$ {changeAmount.toFixed(2)}
                        </p>
                      )}
                      {order.deliveryPaymentNotes && (
                        <p className="text-xs text-muted-foreground italic">{order.deliveryPaymentNotes}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Fee */}
                <div className="text-xs font-medium text-green-600 dark:text-green-400 shrink-0">
                  R$ {order.deliveryFee.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Delivery summary for courier */}
        {onDeliveryOrders.length > 0 && !isCompleted && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-2.5 text-xs space-y-1">
            <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <Banknote className="w-3.5 h-3.5" />
              Resumo de cobrança — {onDeliveryOrders.length} pedido{onDeliveryOrders.length !== 1 ? "s" : ""} na entrega
            </p>
            <p>Total a cobrar: <strong>R$ {route.totalToReceive.toFixed(2)}</strong></p>
            {route.totalChangeNeeded > 0 && (
              <p>Troco a levar: <strong>R$ {route.totalChangeNeeded.toFixed(2)}</strong></p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onQrCode}
            data-testid={`button-qr-${route.id}`}
          >
            <QrCode className="w-4 h-4" />
            QR Code
          </Button>
          {isAvailable && (
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              onClick={onAssign}
              data-testid={`button-assign-${route.id}`}
            >
              <Play className="w-4 h-4" />
              Assumir Rota
            </Button>
          )}
          {isInProgress && (
            <Button
              size="sm"
              className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700 text-white"
              onClick={onComplete}
              disabled={completing}
              data-testid={`button-complete-${route.id}`}
            >
              <CheckCircle2 className="w-4 h-4" />
              {completing ? "Concluindo..." : "Concluir Rota"}
            </Button>
          )}
          {isCompleted && (
            <div className="flex-1 flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Rota concluída
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
