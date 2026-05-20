import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bike, Phone, Plus, Pencil, BarChart2, ToggleLeft, ToggleRight,
  CheckCircle2, Package, DollarSign, MapPin, Clock, X, UserX,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Courier {
  id: number;
  name: string;
  phone: string | null;
  vehicle: string;
  active: string;
  createdAt: string;
}

interface RouteReport {
  routeId: number;
  routeName: string;
  mainNeighborhood: string;
  completedAt: string | null;
  startedAt: string | null;
  deliveryCount: number;
  totalFee: number;
}

interface CourierReport {
  courier: Courier;
  routes: RouteReport[];
  totalDeliveries: number;
  totalEarnings: number;
}

const VEHICLE_LABELS: Record<string, string> = {
  moto: "Moto",
  bike: "Bike",
  carro: "Carro",
};

const VEHICLE_ICONS: Record<string, string> = {
  moto: "🏍️",
  bike: "🚲",
  carro: "🚗",
};

const BASE = "/api";
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export default function Motoboys() {
  const { toast } = useToast();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // Modal states
  const [editTarget, setEditTarget] = useState<Courier | null | "new">(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formVehicle, setFormVehicle] = useState("moto");
  const [saving, setSaving] = useState(false);

  // Report modal
  const [reportTarget, setReportTarget] = useState<Courier | null>(null);
  const [report, setReport] = useState<CourierReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const fetchCouriers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Courier[]>(`/couriers${showAll ? "?all=true" : ""}`);
      setCouriers(data);
    } catch {
      toast({ title: "Erro ao carregar motoboys", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [showAll, toast]);

  useEffect(() => { fetchCouriers(); }, [fetchCouriers]);

  const openNew = () => {
    setEditTarget("new");
    setFormName("");
    setFormPhone("");
    setFormVehicle("moto");
  };

  const openEdit = (c: Courier) => {
    setEditTarget(c);
    setFormName(c.name);
    setFormPhone(c.phone ?? "");
    setFormVehicle(c.vehicle);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (editTarget === "new") {
        await apiFetch<Courier>("/couriers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim(), phone: formPhone.trim() || null, vehicle: formVehicle }),
        });
        toast({ title: "Motoboy cadastrado!" });
      } else if (editTarget) {
        await apiFetch<Courier>(`/couriers/${editTarget.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim(), phone: formPhone.trim() || null, vehicle: formVehicle }),
        });
        toast({ title: "Dados atualizados!" });
      }
      setEditTarget(null);
      fetchCouriers();
    } catch (e) {
      toast({ title: `Erro: ${e instanceof Error ? e.message : "Desconhecido"}`, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: Courier) => {
    const newActive = c.active === "true" ? "false" : "true";
    try {
      await apiFetch(`/couriers/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: newActive }),
      });
      toast({ title: newActive === "true" ? "Motoboy ativado!" : "Motoboy desativado!" });
      fetchCouriers();
    } catch {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    }
  };

  const openReport = async (c: Courier) => {
    setReportTarget(c);
    setReport(null);
    setLoadingReport(true);
    try {
      const data = await apiFetch<CourierReport>(`/couriers/${c.id}/report`);
      setReport(data);
    } catch {
      toast({ title: "Erro ao carregar relatório", variant: "destructive" });
    } finally {
      setLoadingReport(false);
    }
  };

  const activeCouriers = couriers.filter((c) => c.active === "true");
  const inactiveCouriers = couriers.filter((c) => c.active !== "true");

  return (
    <Layout>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bike className="w-6 h-6 text-primary" />
            Motoboys
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Cadastro e histórico de entregas dos motoboys
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Só ativos" : "Ver todos"}
          </Button>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Motoboy
          </Button>
        </div>
      </div>

      {/* ── Active couriers ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : activeCouriers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Bike className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhum motoboy cadastrado ainda.</p>
            <Button onClick={openNew} className="gap-2 mt-1">
              <Plus className="w-4 h-4" />
              Cadastrar primeiro motoboy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeCouriers.map((c) => (
            <CourierCard
              key={c.id}
              courier={c}
              onEdit={() => openEdit(c)}
              onReport={() => openReport(c)}
              onToggle={() => toggleActive(c)}
            />
          ))}
        </div>
      )}

      {/* ── Inactive couriers ── */}
      {showAll && inactiveCouriers.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <UserX className="w-4 h-4" />
            Desativados ({inactiveCouriers.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {inactiveCouriers.map((c) => (
              <CourierCard
                key={c.id}
                courier={c}
                onEdit={() => openEdit(c)}
                onReport={() => openReport(c)}
                onToggle={() => toggleActive(c)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bike className="w-5 h-5" />
              {editTarget === "new" ? "Novo Motoboy" : "Editar Motoboy"}
            </DialogTitle>
            <DialogDescription>
              {editTarget === "new" ? "Cadastre um novo motoboy." : `Editando: ${(editTarget as Courier)?.name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="courier-name">Nome *</Label>
              <Input
                id="courier-name"
                placeholder="Ex: João da Silva"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="courier-phone">Telefone</Label>
              <Input
                id="courier-phone"
                placeholder="(41) 99999-9999"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Veículo</Label>
              <Select value={formVehicle} onValueChange={setFormVehicle}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="moto">🏍️ Moto</SelectItem>
                  <SelectItem value="bike">🚲 Bike</SelectItem>
                  <SelectItem value="carro">🚗 Carro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setEditTarget(null)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !formName.trim()}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Report Modal ── */}
      <Dialog open={!!reportTarget} onOpenChange={(open) => { if (!open) { setReportTarget(null); setReport(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5" />
              Relatório — {reportTarget?.name}
            </DialogTitle>
            <DialogDescription>
              Histórico completo de entregas realizadas
            </DialogDescription>
          </DialogHeader>

          {loadingReport ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="text-muted-foreground text-sm">Carregando relatório...</div>
            </div>
          ) : report ? (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold">{report.routes.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Rotas concluídas</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold">{report.totalDeliveries}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Entregas totais</p>
                </div>
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    R$ {report.totalEarnings.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total em taxas</p>
                </div>
              </div>

              {/* Route list */}
              {report.routes.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <Package className="w-8 h-8 opacity-30" />
                  <p className="text-sm">Nenhuma rota concluída ainda.</p>
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden border border-border divide-y divide-border">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 bg-muted/60 text-xs font-semibold text-muted-foreground">
                    <span>Rota / Bairro</span>
                    <span className="text-center">Entregas</span>
                    <span className="text-right">Taxa</span>
                    <span className="text-right">Data</span>
                  </div>
                  {report.routes.map((r) => (
                    <div key={r.routeId} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2.5 text-sm hover:bg-muted/30 transition-colors">
                      <div>
                        <p className="font-medium">{r.routeName}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5" />
                          {r.mainNeighborhood}
                        </p>
                      </div>
                      <div className="flex items-center justify-center">
                        <span className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full font-medium">
                          <Package className="w-3 h-3" />
                          {r.deliveryCount}
                        </span>
                      </div>
                      <div className="flex items-center justify-end">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                          R$ {r.totalFee.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-end text-xs text-muted-foreground">
                        {r.completedAt
                          ? new Date(r.completedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                          : "—"}
                      </div>
                    </div>
                  ))}
                  {/* Total row */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2.5 bg-muted/40 font-semibold text-sm">
                    <span>Total</span>
                    <span className="text-center">{report.totalDeliveries}</span>
                    <span className="text-right text-emerald-600 dark:text-emerald-400">
                      R$ {report.totalEarnings.toFixed(2)}
                    </span>
                    <span />
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function CourierCard({
  courier,
  onEdit,
  onReport,
  onToggle,
}: {
  courier: Courier;
  onEdit: () => void;
  onReport: () => void;
  onToggle: () => void;
}) {
  const isActive = courier.active === "true";
  const vehicleEmoji = VEHICLE_ICONS[courier.vehicle] ?? "🏍️";
  const vehicleLabel = VEHICLE_LABELS[courier.vehicle] ?? courier.vehicle;

  return (
    <div className={`rounded-2xl border bg-card shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-3 ${!isActive ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-xl shrink-0">
          {vehicleEmoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm leading-snug truncate">{courier.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
              isActive
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}>
              {isActive ? "Ativo" : "Inativo"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{vehicleLabel}</p>
          {courier.phone && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Phone className="w-3 h-3" />
              {courier.phone}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 mt-auto pt-1 border-t border-border/40">
        <Button variant="ghost" size="sm" className="flex-1 h-8 gap-1.5 text-xs" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" />
          Editar
        </Button>
        <Button variant="ghost" size="sm" className="flex-1 h-8 gap-1.5 text-xs" onClick={onReport}>
          <BarChart2 className="w-3.5 h-3.5" />
          Relatório
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-8 w-8 p-0 ${isActive ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"}`}
          onClick={onToggle}
          title={isActive ? "Desativar" : "Ativar"}
        >
          {isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
