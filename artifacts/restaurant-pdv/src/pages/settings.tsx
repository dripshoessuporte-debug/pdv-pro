import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Settings as SettingsIcon,
  Store,
  Truck,
  Save,
  RefreshCw,
  Clock,
  Package,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StoreSettings {
  id: number;
  storeName: string;
  storePhone: string | null;
  storeCep: string | null;
  storeAddress: string | null;
  storeNeighborhood: string | null;
  storeCity: string | null;
  deliveryDispatchTimeMinutes: number;
  maxOrdersPerRoute: number;
  deliveryFeeMode: string;
  deliveryPricePerKm: number | null;
  baseDeliveryDistanceKm: number | null;
  baseDeliveryFee: number | null;
  additionalPricePerKm: number | null;
  minimumDeliveryFee: number | null;
  maximumDeliveryFee: number | null;
}

async function lookupCep(cep: string): Promise<{ logradouro: string; bairro: string; localidade: string; uf: string } | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return null;
    const data = await res.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (data.erro) return null;
    return {
      logradouro: data.logradouro ?? "",
      bairro: data.bairro ?? "",
      localidade: data.localidade ?? "",
      uf: data.uf ?? "",
    };
  } catch {
    return null;
  }
}

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

export default function Settings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeCep, setStoreCep] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeNeighborhood, setStoreNeighborhood] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [dispatchTime, setDispatchTime] = useState("20");
  const [maxOrders, setMaxOrders] = useState("4");
  const [deliveryFeeMode, setDeliveryFeeMode] = useState<"manual" | "per_km" | "distance_tier">("manual");
  const [deliveryPricePerKm, setDeliveryPricePerKm] = useState("");
  const [baseDeliveryDistanceKm, setBaseDeliveryDistanceKm] = useState("");
  const [baseDeliveryFee, setBaseDeliveryFee] = useState("");
  const [additionalPricePerKm, setAdditionalPricePerKm] = useState("");
  const [minimumDeliveryFee, setMinimumDeliveryFee] = useState("");
  const [maximumDeliveryFee, setMaximumDeliveryFee] = useState("");
  const [cepLookupStatus, setCepLookupStatus] = useState<"idle" | "loading" | "found" | "not_found">("idle");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const s = await apiFetch<StoreSettings>("/settings");
      setStoreName(s.storeName ?? "");
      setStorePhone(s.storePhone ?? "");
      setStoreCep(s.storeCep ?? "");
      setStoreAddress(s.storeAddress ?? "");
      setStoreNeighborhood(s.storeNeighborhood ?? "");
      setStoreCity(s.storeCity ?? "");
      setDispatchTime(String(s.deliveryDispatchTimeMinutes));
      setMaxOrders(String(s.maxOrdersPerRoute));
      setDeliveryFeeMode((s.deliveryFeeMode as "manual" | "per_km" | "distance_tier") || "manual");
      setDeliveryPricePerKm(s.deliveryPricePerKm != null ? String(s.deliveryPricePerKm) : "");
      setBaseDeliveryDistanceKm(s.baseDeliveryDistanceKm != null ? String(s.baseDeliveryDistanceKm) : "");
      setBaseDeliveryFee(s.baseDeliveryFee != null ? String(s.baseDeliveryFee) : "");
      setAdditionalPricePerKm(s.additionalPricePerKm != null ? String(s.additionalPricePerKm) : "");
      setMinimumDeliveryFee(s.minimumDeliveryFee != null ? String(s.minimumDeliveryFee) : "");
      setMaximumDeliveryFee(s.maximumDeliveryFee != null ? String(s.maximumDeliveryFee) : "");
    } catch {
      toast({ title: "Erro ao carregar configurações", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleReset = async () => {
    setResetting(true);
    try {
      await apiFetch("/dev/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: "ZERAR" }),
      });
      toast({ title: "Dados zerados com sucesso! Você pode criar novos pedidos agora." });
      setShowResetConfirm(false);
    } catch (e) {
      toast({
        title: `Erro ao zerar dados: ${e instanceof Error ? e.message : "Desconhecido"}`,
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/settings", {
        method: "PUT",
        body: JSON.stringify({
          storeName: storeName.trim() || "Meu Restaurante",
          storePhone: storePhone.trim() || null,
          storeCep: storeCep.trim() || null,
          storeAddress: storeAddress.trim() || null,
          storeNeighborhood: storeNeighborhood.trim() || null,
          storeCity: storeCity.trim() || null,
          deliveryDispatchTimeMinutes: parseInt(dispatchTime, 10) || 20,
          maxOrdersPerRoute: parseInt(maxOrders, 10) || 4,
          deliveryFeeMode,
          deliveryPricePerKm: deliveryPricePerKm.trim() ? parseFloat(deliveryPricePerKm) : null,
          baseDeliveryDistanceKm: baseDeliveryDistanceKm.trim() ? parseFloat(baseDeliveryDistanceKm) : null,
          baseDeliveryFee: baseDeliveryFee.trim() ? parseFloat(baseDeliveryFee) : null,
          additionalPricePerKm: additionalPricePerKm.trim() ? parseFloat(additionalPricePerKm) : null,
          minimumDeliveryFee: minimumDeliveryFee.trim() ? parseFloat(minimumDeliveryFee) : null,
          maximumDeliveryFee: maximumDeliveryFee.trim() ? parseFloat(maximumDeliveryFee) : null,
        }),
      });
      toast({ title: "Configurações salvas com sucesso!" });
    } catch {
      toast({ title: "Erro ao salvar configurações", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <SettingsIcon className="w-8 h-8 text-primary" />
              Configurações
            </h1>
            <p className="text-muted-foreground mt-1">
              Dados da loja e parâmetros de entrega
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadSettings}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Recarregar
          </Button>
        </div>

        {/* Store Info */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="w-5 h-5 text-primary" />
              Dados da Loja
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nome da Loja</Label>
                <Input
                  placeholder="Meu Restaurante"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  data-testid="input-store-name"
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  placeholder="(41) 99999-9999"
                  value={storePhone}
                  onChange={(e) => setStorePhone(e.target.value)}
                  data-testid="input-store-phone"
                />
              </div>
              <div>
                <Label>CEP</Label>
                <div className="relative">
                  <Input
                    placeholder="80010-010"
                    value={storeCep}
                    onChange={(e) => setStoreCep(e.target.value)}
                    onBlur={async () => {
                      const digits = storeCep.replace(/\D/g, "");
                      if (digits.length !== 8) return;
                      setCepLookupStatus("loading");
                      const result = await lookupCep(storeCep);
                      if (result) {
                        if (!storeAddress) setStoreAddress(result.logradouro);
                        if (!storeNeighborhood) setStoreNeighborhood(result.bairro);
                        if (!storeCity) setStoreCity(`${result.localidade}, ${result.uf}`);
                        setCepLookupStatus("found");
                      } else {
                        setCepLookupStatus("not_found");
                      }
                    }}
                    maxLength={9}
                    data-testid="input-store-cep"
                  />
                  {cepLookupStatus === "loading" && (
                    <span className="absolute right-2.5 top-2.5 text-xs text-muted-foreground animate-pulse">buscando...</span>
                  )}
                  {cepLookupStatus === "found" && (
                    <span className="absolute right-2.5 top-2.5 text-xs text-green-600">✓ endereço preenchido</span>
                  )}
                  {cepLookupStatus === "not_found" && (
                    <span className="absolute right-2.5 top-2.5 text-xs text-red-500">CEP não encontrado</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Ao sair do campo, preenchemos o endereço automaticamente via ViaCEP.</p>
              </div>
              <div className="col-span-2">
                <Label>Endereço</Label>
                <Input
                  placeholder="Rua XV de Novembro, 500"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  data-testid="input-store-address"
                />
              </div>
              <div>
                <Label>Bairro</Label>
                <Input
                  placeholder="Centro"
                  value={storeNeighborhood}
                  onChange={(e) => setStoreNeighborhood(e.target.value)}
                  data-testid="input-store-neighborhood"
                />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input
                  placeholder="Curitiba, PR"
                  value={storeCity}
                  onChange={(e) => setStoreCity(e.target.value)}
                  data-testid="input-store-city"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Settings */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="w-5 h-5 text-primary" />
              Parâmetros de Entrega
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Tempo padrão para saída (minutos)
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="120"
                  placeholder="20"
                  value={dispatchTime}
                  onChange={(e) => setDispatchTime(e.target.value)}
                  data-testid="input-dispatch-time"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Prazo estimado para o motoboy sair com a rota
                </p>
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Limite máximo de pedidos por rota
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  placeholder="4"
                  value={maxOrders}
                  onChange={(e) => setMaxOrders(e.target.value)}
                  data-testid="input-max-orders"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Máximo de pedidos agrupados por rota
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">Como o endereço da loja é usado:</p>
              <p>• Origem no Google Maps para todas as rotas geradas</p>
              <p>• Curitiba, PR é usado como fallback se o endereço não estiver cadastrado</p>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Fee Calculation */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="w-5 h-5 text-primary" />
              Cálculo de Taxa de Entrega
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="block mb-2">Modo de cálculo</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: "manual" as const,        label: "✋ Manual",                          desc: "Operador digita a taxa em cada pedido" },
                  { value: "distance_tier" as const,  label: "📏 Por distância (taxa fixa + extra)", desc: "Taxa fixa até X km, valor adicional acima" },
                ] as const).map((opt) => {
                  const isActive = deliveryFeeMode === opt.value ||
                    (opt.value === "distance_tier" && deliveryFeeMode === "per_km");
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDeliveryFeeMode(opt.value)}
                      className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:border-primary/50"
                      }`}
                      data-testid={`button-fee-mode-${opt.value}`}
                    >
                      <p className="font-medium">{opt.label}</p>
                      <p className={`text-xs mt-0.5 ${isActive ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {(deliveryFeeMode === "distance_tier" || deliveryFeeMode === "per_km") && (
              <>
                {!storeCep.replace(/\D/g, "").match(/^\d{8}$/) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                    ⚠️ Preencha o <strong>CEP da loja</strong> acima para ativar o cálculo automático.
                  </p>
                )}
                <div className="space-y-4 border rounded-xl p-4 bg-muted/30">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Taxa fixa inicial (R$)</Label>
                      <Input
                        type="number"
                        step="0.50"
                        min="0"
                        placeholder="7,00"
                        value={baseDeliveryFee}
                        onChange={(e) => setBaseDeliveryFee(e.target.value)}
                        data-testid="input-base-delivery-fee"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Cobrada até a distância incluída</p>
                    </div>
                    <div>
                      <Label>Distância incluída (km)</Label>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        placeholder="2"
                        value={baseDeliveryDistanceKm}
                        onChange={(e) => setBaseDeliveryDistanceKm(e.target.value)}
                        data-testid="input-base-delivery-distance-km"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Raio coberto pela taxa fixa</p>
                    </div>
                    <div>
                      <Label>Valor por km excedente (R$)</Label>
                      <Input
                        type="number"
                        step="0.50"
                        min="0"
                        placeholder="2,00"
                        value={additionalPricePerKm}
                        onChange={(e) => setAdditionalPricePerKm(e.target.value)}
                        data-testid="input-additional-price-per-km"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Cobrado por km além da distância incluída</p>
                    </div>
                    <div>
                      <Label>Taxa máxima (R$)</Label>
                      <Input
                        type="number"
                        step="0.50"
                        min="0"
                        placeholder="25,00"
                        value={maximumDeliveryFee}
                        onChange={(e) => setMaximumDeliveryFee(e.target.value)}
                        data-testid="input-maximum-delivery-fee"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Teto de segurança (recomendado)</p>
                    </div>
                  </div>

                  {/* Exemplo dinâmico */}
                  {baseDeliveryFee && baseDeliveryDistanceKm && additionalPricePerKm && (() => {
                    const bFee  = parseFloat(baseDeliveryFee);
                    const bDist = parseFloat(baseDeliveryDistanceKm);
                    const add   = parseFloat(additionalPricePerKm);
                    const max   = maximumDeliveryFee ? parseFloat(maximumDeliveryFee) : 30;
                    if (isNaN(bFee) || isNaN(bDist) || isNaN(add)) return null;
                    const ex3 = Math.min(bFee + Math.max(0, 3 - bDist) * add, max);
                    const ex5 = Math.min(bFee + Math.max(0, 5 - bDist) * add, max);
                    return (
                      <div className="rounded-lg bg-background border px-4 py-3 text-xs space-y-1.5">
                        <p className="font-semibold text-foreground mb-2">Exemplos com esta configuração:</p>
                        <div className="flex justify-between text-muted-foreground">
                          <span>Até {bDist} km</span>
                          <span className="font-semibold text-foreground">R$ {bFee.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>3 km</span>
                          <span className="font-semibold text-foreground">R$ {ex3.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>5 km</span>
                          <span className="font-semibold text-foreground">R$ {ex5.toFixed(2)}</span>
                        </div>
                        {maximumDeliveryFee && (
                          <div className="flex justify-between text-muted-foreground border-t pt-1 mt-1">
                            <span>Teto máximo</span>
                            <span className="font-semibold text-foreground">R$ {parseFloat(maximumDeliveryFee).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            size="lg"
            className="gap-2"
            data-testid="button-save-settings"
          >
            <Save className="w-5 h-5" />
            {saving ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </div>

        {/* Reset Data */}
        <Card className="border-red-200 dark:border-red-900/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-400">
              <Trash2 className="w-4 h-4" />
              Zerar Dados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-800 dark:text-red-300 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <TriangleAlert className="w-4 h-4 shrink-0" />
                O que será apagado:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-xs ml-1">
                <li>Todos os pedidos e itens de pedidos</li>
                <li>Todas as rotas de delivery e atribuições</li>
                <li>Tickets de cozinha e pagamentos</li>
              </ul>
              <p className="text-xs mt-2 font-medium">
                Mantido: clientes, cardápio, mesas, configurações, caixa.
              </p>
            </div>
            <Button
              variant="outline"
              className="gap-2 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
              onClick={() => setShowResetConfirm(true)}
              disabled={resetting}
              data-testid="button-reset-data"
            >
              <Trash2 className="w-4 h-4" />
              Zerar todos os dados do PDV
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <TriangleAlert className="w-5 h-5" />
              Confirmar exclusão de dados
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Esta ação irá apagar <strong>todos os pedidos, rotas, tickets de cozinha e pagamentos</strong> do sistema.
              </span>
              <span className="block font-semibold text-foreground">
                Essa operação não pode ser desfeita.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleReset}
              disabled={resetting}
              data-testid="button-confirm-reset"
            >
              {resetting ? "Zerando..." : "Sim, zerar tudo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
