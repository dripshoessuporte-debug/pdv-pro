import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

type RouteStatus = "available" | "in_progress" | "completed";

interface RouteOrder {
  id: number;
  routeId: number;
  orderId: number;
  stopOrder: number;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryNeighborhood: string | null;
  deliveryFee: number;
  deliveryStatus: string | null;
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

// ─── API helpers ─────────────────────────────────────────────────────────────

const API = "/api";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Routes() {
  const { toast } = useToast();
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // QR Code modal
  const [qrRoute, setQrRoute] = useState<DeliveryRoute | null>(null);

  // Assign modal
  const [assignRoute, setAssignRoute] = useState<DeliveryRoute | null>(null);
  const [courierName, setCourierName] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Completing
  const [completing, setCompleting] = useState<number | null>(null);

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
    const interval = setInterval(fetchRoutes, 30_000);
    return () => clearInterval(interval);
  }, [fetchRoutes]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { created } = await apiFetch<{ created: number }>("/delivery/routes/generate", {
        method: "POST",
      });
      await fetchRoutes();
      if (created === 0) {
        toast({ title: "Nenhum pedido pronto para entrega encontrado" });
      } else {
        toast({ title: `${created} rota${created !== 1 ? "s" : ""} gerada${created !== 1 ? "s" : ""} com sucesso!` });
      }
    } catch (e) {
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast({ title: `Erro: ${msg}`, variant: "destructive" });
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast({ title: `Erro: ${msg}`, variant: "destructive" });
    } finally {
      setCompleting(null);
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
            <Button
              variant="outline"
              onClick={fetchRoutes}
              disabled={loading}
              size="sm"
            >
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
              {generating ? "Gerando rotas..." : "Gerar Rotas"}
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        {routes.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Disponíveis", count: routes.filter((r) => r.status === "available").length, color: "text-blue-600" },
              { label: "Em andamento", count: routes.filter((r) => r.status === "in_progress").length, color: "text-amber-600" },
              { label: "Concluídas hoje", count: completedRoutes.length, color: "text-green-600" },
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

        {/* Empty state */}
        {!loading && routes.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed rounded-xl text-muted-foreground">
            <Truck className="w-14 h-14 mx-auto mb-4 opacity-20" />
            <p className="text-xl font-semibold mb-2">Nenhuma rota criada</p>
            <p className="text-sm max-w-sm mx-auto mb-6">
              Marque pedidos delivery como "Pronto para entrega" na cozinha e clique em <strong>Gerar Rotas</strong>.
            </p>
            <Button onClick={handleGenerate} disabled={generating} size="lg">
              <Sparkles className="w-5 h-5 mr-2" />
              {generating ? "Gerando..." : "Gerar Rotas Agora"}
            </Button>
          </div>
        )}

        {/* Active routes */}
        {activeRoutes.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Rotas Ativas</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {activeRoutes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  onAssign={() => { setAssignRoute(route); setCourierName(""); }}
                  onComplete={() => handleComplete(route)}
                  onQrCode={() => setQrRoute(route)}
                  completing={completing === route.id}
                />
              ))}
            </div>
          </div>
        )}

        {/* Completed routes */}
        {completedRoutes.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-muted-foreground">
              Rotas Concluídas Hoje
            </h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 opacity-70">
              {completedRoutes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  onAssign={() => {}}
                  onComplete={() => {}}
                  onQrCode={() => setQrRoute(route)}
                  completing={false}
                />
              ))}
            </div>
          </div>
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
          {qrRoute?.mapsUrl && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Escaneie para abrir a rota no Google Maps
              </p>
              <div className="flex justify-center p-4 bg-white rounded-xl border">
                <QRCodeSVG
                  value={qrRoute.mapsUrl}
                  size={220}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Paradas ({qrRoute.orders.length}):</p>
                {qrRoute.orders
                  .sort((a, b) => a.stopOrder - b.stopOrder)
                  .map((o) => (
                    <p key={o.id} className="flex items-center gap-1">
                      <span className="font-bold text-primary">{o.stopOrder}.</span>
                      {o.customerName ?? "—"} · {o.deliveryAddress ?? "—"}
                    </p>
                  ))}
              </div>
              <a
                href={qrRoute.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button variant="outline" className="w-full gap-2">
                  <MapPin className="w-4 h-4" />
                  Abrir no Google Maps
                </Button>
              </a>
            </div>
          )}
          {!qrRoute?.mapsUrl && (
            <p className="text-muted-foreground text-center py-4">
              Link do Google Maps não disponível para esta rota.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Modal */}
      <Dialog open={!!assignRoute} onOpenChange={(open) => { if (!open) setAssignRoute(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Assumir Rota
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Informe o nome do motoboy que vai assumir a rota{" "}
              <strong>{assignRoute?.name}</strong>.
            </p>
            <div>
              <Input
                placeholder="Nome do motoboy"
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAssign()}
                autoFocus
                data-testid="input-courier-name"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setAssignRoute(null)}
              >
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
  completing,
}: {
  route: DeliveryRoute;
  onAssign: () => void;
  onComplete: () => void;
  onQrCode: () => void;
  completing: boolean;
}) {
  const isAvailable = route.status === "available";
  const isInProgress = route.status === "in_progress";
  const isCompleted = route.status === "completed";
  const sortedOrders = [...route.orders].sort((a, b) => a.stopOrder - b.stopOrder);

  return (
    <Card
      className="overflow-hidden border-2 transition-shadow hover:shadow-lg"
      style={{ borderColor: route.color + "80" }}
      data-testid={`card-route-${route.id}`}
    >
      {/* Color stripe + header */}
      <div
        className="h-2 w-full"
        style={{ backgroundColor: route.color }}
      />
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-lg leading-tight">{route.name}</h3>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[route.status]}`}>
                {STATUS_LABELS[route.status]}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">
                {route.mainNeighborhood}
                {route.includedNeighborhoods.length > 1 && (
                  <span className="ml-1 text-xs">
                    + {route.includedNeighborhoods.filter((n) => n !== route.mainNeighborhood).join(", ")}
                  </span>
                )}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1 justify-end text-sm font-semibold">
              <Package className="w-4 h-4" />
              {route.orders.length} {route.orders.length === 1 ? "pedido" : "pedidos"}
            </div>
            <div className="flex items-center gap-1 justify-end text-sm text-green-600 dark:text-green-400 font-medium mt-0.5">
              <DollarSign className="w-3.5 h-3.5" />
              R$ {route.totalDeliveryFee.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Courier info */}
        {route.courierName && (
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
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
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Orders list */}
        <div className="space-y-2">
          {sortedOrders.map((order) => (
            <div
              key={order.id}
              className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/40 text-sm"
              data-testid={`route-order-${order.orderId}`}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5"
                style={{ backgroundColor: route.color }}
              >
                {order.stopOrder}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold truncate">
                    {order.customerName ?? `Pedido #${order.orderId}`}
                  </span>
                  {order.customerPhone && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="w-3 h-3" />
                      {order.customerPhone}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground truncate text-xs mt-0.5">
                  <MapPin className="w-3 h-3 inline mr-0.5" />
                  {order.deliveryAddress ?? "—"}{order.deliveryNeighborhood ? ` · ${order.deliveryNeighborhood}` : ""}
                </p>
              </div>
              <div className="text-xs font-medium text-green-600 dark:text-green-400 shrink-0">
                R$ {order.deliveryFee.toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
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
              variant="default"
              className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700"
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
