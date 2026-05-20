import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Settings as SettingsIcon,
  Store,
  Truck,
  Save,
  RefreshCw,
  Clock,
  Package,
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

  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeCep, setStoreCep] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeNeighborhood, setStoreNeighborhood] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [dispatchTime, setDispatchTime] = useState("20");
  const [maxOrders, setMaxOrders] = useState("4");

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
    } catch {
      toast({ title: "Erro ao carregar configurações", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

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
                <Input
                  placeholder="80010-010"
                  value={storeCep}
                  onChange={(e) => setStoreCep(e.target.value)}
                  maxLength={9}
                  data-testid="input-store-cep"
                />
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
      </div>
    </Layout>
  );
}
