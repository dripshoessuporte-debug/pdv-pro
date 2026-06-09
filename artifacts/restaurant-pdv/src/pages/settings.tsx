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
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAlertsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetKitchenQueueQueryKey,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";

const DEFAULT_DISPATCH_TIME_MINUTES = 20;
const MIN_DISPATCH_TIME_MINUTES = 1;
const MAX_DISPATCH_TIME_MINUTES = 180;

function parseDispatchTimeMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_DISPATCH_TIME_MINUTES;
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  if (
    !Number.isInteger(minutes) ||
    minutes < MIN_DISPATCH_TIME_MINUTES ||
    minutes > MAX_DISPATCH_TIME_MINUTES
  ) {
    return null;
  }
  return minutes;
}

function formatDispatchPreview(minutes: number | null): string {
  const previewMinutes = minutes ?? DEFAULT_DISPATCH_TIME_MINUTES;
  const deadline = new Date(2024, 0, 1, 18, previewMinutes, 0, 0);
  return deadline.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface StoreSettings {
  id: number;
  storeName: string;
  storePhone: string | null;
  storeEmail: string | null;
  storeCep: string | null;
  storeAddress: string | null;
  storeNumber: string | null;
  storeNeighborhood: string | null;
  storeCity: string | null;
  storeState: string | null;
  storeCountry: string | null;
  deliveryDispatchTimeMinutes: number;
  maxOrdersPerRoute: number;
  routeGroupingMode: "neighborhood" | "distance" | "hybrid";
  deliveryFeeMode: string;
  deliveryPricePerKm: number | null;
  baseDeliveryDistanceKm: number | null;
  baseDeliveryFee: number | null;
  additionalPricePerKm: number | null;
  minimumDeliveryFee: number | null;
  maximumDeliveryFee: number | null;
  distanceProvider: string;
  useDistanceCache: string;
  orsConfigured: boolean;
}

function normalizeCepDigits(cep: string): string {
  return cep.replace(/\D/g, "").slice(0, 8);
}

function normalizeUf(value: string): string {
  const uf = value.replace(/[^A-Za-z]/g, "").toUpperCase();
  return /^[A-Z]{2}$/.test(uf) ? uf : "";
}

async function lookupCep(cep: string): Promise<{
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
} | null> {
  const digits = normalizeCepDigits(cep);
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (data.erro) return null;
    const uf = normalizeUf(data.uf ?? "");
    if (!uf) return null;
    return {
      cep: digits,
      logradouro: data.logradouro ?? "",
      bairro: data.bairro ?? "",
      localidade: data.localidade ?? "",
      uf,
    };
  } catch {
    return null;
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    try {
      const data = JSON.parse(text) as { error?: string; message?: string };
      message = data.error || data.message || message;
    } catch {
      // Keep the raw response text when the API does not return JSON.
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

const DEV_ADMIN_KEY_STORAGE_KEY = "gestor-max-dev-admin-key";
const DEV_ADMIN_KEY_FALLBACK = "gestormax-dev";

function isDevAdminFallbackAllowed(): boolean {
  const hostname =
    typeof window === "undefined" ? "" : window.location.hostname.toLowerCase();
  const isReplitPreview = ["replit.dev", "replit.app", "repl.co"].some(
    (domain) => hostname.includes(domain),
  );

  return (
    import.meta.env.DEV === true ||
    import.meta.env.VITE_ENABLE_DEV_ROLE_SWITCHER === "true" ||
    import.meta.env.MODE !== "production" ||
    isReplitPreview
  );
}

function getStoredAdminResetKey(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(DEV_ADMIN_KEY_STORAGE_KEY)?.trim() ?? "";
}

function getAdminResetKey(): string {
  const storedAdminKey = getStoredAdminResetKey();
  if (storedAdminKey) return storedAdminKey;

  const configuredAdminKey = String(
    import.meta.env.VITE_ADMIN_RESET_KEY ??
      import.meta.env.VITE_ADMIN_API_KEY ??
      "",
  ).trim();
  if (configuredAdminKey) return configuredAdminKey;

  return isDevAdminFallbackAllowed() ? DEV_ADMIN_KEY_FALLBACK : "";
}

function getDevToolKeyFromInput(inputValue: string): string {
  const inputKey = inputValue.trim();
  if (inputKey) return inputKey;
  return isDevAdminFallbackAllowed() ? DEV_ADMIN_KEY_FALLBACK : "";
}

function persistDevToolKey(adminKey: string): void {
  if (typeof window === "undefined") return;
  if (adminKey) {
    window.localStorage.setItem(DEV_ADMIN_KEY_STORAGE_KEY, adminKey);
  } else {
    window.localStorage.removeItem(DEV_ADMIN_KEY_STORAGE_KEY);
  }
}

function getAdminResetHeaders(adminKey: string): HeadersInit | null {
  if (!adminKey) return null;
  return { "x-admin-key": adminKey };
}

function maskDevToolKey(adminKey: string): string {
  if (!adminKey) return "não informada";
  if (adminKey === DEV_ADMIN_KEY_FALLBACK) return DEV_ADMIN_KEY_FALLBACK;
  return `${adminKey.slice(0, 3)}•••`;
}

function getDevToolErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("rotas de desenvolvimento desativadas")) {
    return "As ferramentas dev foram bloqueadas pelo backend. Use a chave gestormax-dev no campo, clique em Salvar chave e tente novamente. Se continuar, o backend ainda não recebeu o hotfix requireDevToolAccess.";
  }
  if (lowerMessage.includes("chave administrativa inválida")) {
    return "Chave admin inválida. Para o Preview, use gestormax-dev.";
  }
  if (
    lowerMessage.includes("informe a chave admin") ||
    lowerMessage.includes("x-admin-key")
  ) {
    return "Informe a chave admin de teste. Para o Preview, use gestormax-dev.";
  }
  return message;
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [seedingDeliveries, setSeedingDeliveries] = useState(false);
  const [testingDevTools, setTestingDevTools] = useState(false);
  const [devAdminKeyInput, setDevAdminKeyInput] = useState(
    () =>
      getStoredAdminResetKey() ||
      (isDevAdminFallbackAllowed() ? DEV_ADMIN_KEY_FALLBACK : ""),
  );

  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeEmail, setStoreEmail] = useState("");
  const [storeCep, setStoreCep] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeNumber, setStoreNumber] = useState("");
  const [storeNeighborhood, setStoreNeighborhood] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [storeState, setStoreState] = useState("");
  const [storeCountry, setStoreCountry] = useState("Brasil");
  const [dispatchTime, setDispatchTime] = useState("20");
  const [maxOrders, setMaxOrders] = useState("4");
  const [routeGroupingMode, setRouteGroupingMode] = useState<
    "neighborhood" | "distance" | "hybrid"
  >("hybrid");
  const [deliveryFeeMode, setDeliveryFeeMode] = useState<
    "manual" | "per_km" | "distance_tier"
  >("manual");
  const [deliveryPricePerKm, setDeliveryPricePerKm] = useState("");
  const [baseDeliveryDistanceKm, setBaseDeliveryDistanceKm] = useState("");
  const [baseDeliveryFee, setBaseDeliveryFee] = useState("");
  const [additionalPricePerKm, setAdditionalPricePerKm] = useState("");
  const [minimumDeliveryFee, setMinimumDeliveryFee] = useState("");
  const [maximumDeliveryFee, setMaximumDeliveryFee] = useState("");
  const [distanceProvider, setDistanceProvider] = useState<
    "approximate_cep" | "openrouteservice"
  >("approximate_cep");
  const [useDistanceCache, setUseDistanceCache] = useState(true);
  const [orsConfigured, setOrsConfigured] = useState(false);
  const [cepLookupStatus, setCepLookupStatus] = useState<
    "idle" | "loading" | "found" | "not_found"
  >("idle");
  const currentDevToolKey = getDevToolKeyFromInput(devAdminKeyInput);
  const devToolKeyLabel = maskDevToolKey(currentDevToolKey);
  const showDevTools =
    import.meta.env.DEV ||
    import.meta.env.MODE !== "production" ||
    Boolean(getAdminResetKey()) ||
    Boolean(currentDevToolKey);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const s = await apiFetch<StoreSettings>("/settings");
      setStoreName(s.storeName ?? "");
      setStorePhone(s.storePhone ?? "");
      setStoreEmail(s.storeEmail ?? "");
      setStoreCep(s.storeCep ?? "");
      setStoreAddress(s.storeAddress ?? "");
      setStoreNumber(s.storeNumber ?? "");
      setStoreNeighborhood(s.storeNeighborhood ?? "");
      setStoreCity(s.storeCity ?? "");
      setStoreState(s.storeState ?? "");
      setStoreCountry(s.storeCountry ?? "Brasil");
      setDispatchTime(String(s.deliveryDispatchTimeMinutes));
      setMaxOrders(String(s.maxOrdersPerRoute));
      setRouteGroupingMode(
        (s.routeGroupingMode ?? "hybrid") as
          | "neighborhood"
          | "distance"
          | "hybrid",
      );
      const rawMode = s.deliveryFeeMode || "manual";
      setDeliveryFeeMode(
        (["manual", "per_km", "distance_tier"].includes(rawMode)
          ? rawMode
          : "manual") as "manual" | "per_km" | "distance_tier",
      );
      setDeliveryPricePerKm(
        s.deliveryPricePerKm != null ? String(s.deliveryPricePerKm) : "",
      );
      setBaseDeliveryDistanceKm(
        s.baseDeliveryDistanceKm != null
          ? String(s.baseDeliveryDistanceKm)
          : "",
      );
      setBaseDeliveryFee(
        s.baseDeliveryFee != null ? String(s.baseDeliveryFee) : "",
      );
      setAdditionalPricePerKm(
        s.additionalPricePerKm != null ? String(s.additionalPricePerKm) : "",
      );
      setMinimumDeliveryFee(
        s.minimumDeliveryFee != null ? String(s.minimumDeliveryFee) : "",
      );
      setMaximumDeliveryFee(
        s.maximumDeliveryFee != null ? String(s.maximumDeliveryFee) : "",
      );
      setDistanceProvider(
        (s.distanceProvider === "openrouteservice"
          ? "openrouteservice"
          : "approximate_cep") as "approximate_cep" | "openrouteservice",
      );
      setUseDistanceCache(s.useDistanceCache !== "false");
      setOrsConfigured(Boolean(s.orsConfigured));
    } catch {
      toast({
        title: "Erro ao carregar configurações",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const invalidateOperationalQueries = () => {
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetKitchenQueueQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getGetDashboardSummaryQueryKey(),
    });
    queryClient.invalidateQueries({ queryKey: ["/api/delivery/routes"] });
    queryClient.invalidateQueries({
      queryKey: ["/api/delivery/orders/pending"],
    });
  };

  const handleSaveDevAdminKey = () => {
    const key = getDevToolKeyFromInput(devAdminKeyInput);
    persistDevToolKey(key);
    setDevAdminKeyInput(key);
    toast({ title: "Chave admin de teste salva." });
  };

  const getCurrentDevToolHeaders = (): HeadersInit | null => {
    const key = getDevToolKeyFromInput(devAdminKeyInput);
    if (!key) return null;
    persistDevToolKey(key);
    setDevAdminKeyInput(key);
    return getAdminResetHeaders(key);
  };

  const handleTestDevTools = async () => {
    const adminHeaders = getCurrentDevToolHeaders();
    if (!adminHeaders) {
      toast({
        title:
          "Informe a chave admin de teste. Para o Preview, use gestormax-dev.",
        variant: "destructive",
      });
      return;
    }

    setTestingDevTools(true);
    try {
      const result = await apiFetch<{ usingFallback: boolean }>(
        "/dev/tool-status",
        {
          method: "GET",
          headers: adminHeaders,
        },
      );
      toast({
        title: result.usingFallback
          ? "Ferramentas dev liberadas com gestormax-dev."
          : "Ferramentas dev liberadas com chave administrativa.",
      });
    } catch (e) {
      toast({
        title: `Erro ao testar ferramentas dev: ${getDevToolErrorMessage(e)}`,
        variant: "destructive",
      });
    } finally {
      setTestingDevTools(false);
    }
  };

  const handleReset = async () => {
    const adminHeaders = getCurrentDevToolHeaders();
    if (!adminHeaders) {
      toast({
        title:
          "Chave admin inválida ou backend sem configuração dev. Use gestormax-dev no campo Chave admin de teste ou configure ADMIN_RESET_KEY no Replit.",
        variant: "destructive",
      });
      return;
    }

    setResetting(true);
    try {
      await apiFetch("/dev/reset", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ confirm: "ZERAR" }),
      });
      toast({
        title:
          "Dados zerados com sucesso! Você pode criar novos pedidos agora.",
      });
      setShowResetConfirm(false);
      invalidateOperationalQueries();
    } catch (e) {
      toast({
        title: `Erro ao zerar dados: ${getDevToolErrorMessage(e)}`,
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  };

  const handleSeedDeliveries = async () => {
    const adminHeaders = getCurrentDevToolHeaders();
    if (!adminHeaders) {
      toast({
        title:
          "Chave admin inválida ou backend sem configuração dev. Use gestormax-dev no campo Chave admin de teste ou configure ADMIN_RESET_KEY no Replit.",
        variant: "destructive",
      });
      return;
    }

    setSeedingDeliveries(true);
    try {
      const result = await apiFetch<{
        created: number;
        storeCepUsed?: string;
      }>("/dev/seed-curitiba-delivery-orders", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ confirm: "CRIAR", count: 20 }),
      });
      toast({
        title: `${result.created} entregas criadas usando o CEP da loja: ${
          result.storeCepUsed ?? "não informado"
        }`,
      });
      invalidateOperationalQueries();
    } catch (e) {
      toast({
        title: getDevToolErrorMessage(e),
        variant: "destructive",
      });
    } finally {
      setSeedingDeliveries(false);
    }
  };

  const validatedDispatchTime = parseDispatchTimeMinutes(dispatchTime);
  const dispatchPreviewTime = formatDispatchPreview(validatedDispatchTime);

  const handleSave = async () => {
    const dispatchTimeMinutes = parseDispatchTimeMinutes(dispatchTime);
    if (dispatchTimeMinutes === null) {
      toast({
        title: "Informe um tempo de saída entre 1 e 180 minutos.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/settings", {
        method: "PUT",
        body: JSON.stringify({
          storeName: storeName.trim() || "Minha Loja",
          storePhone: storePhone.trim() || null,
          storeEmail: storeEmail.trim() || null,
          storeCep: normalizeCepDigits(storeCep) || null,
          storeAddress: storeAddress.trim() || null,
          storeNumber: storeNumber.trim() || null,
          storeNeighborhood: storeNeighborhood.trim() || null,
          storeCity: storeCity.replace(/,\s*[A-Za-z]{2}$/, "").trim() || "",
          storeState: normalizeUf(storeState),
          storeCountry: storeCountry.trim() || "Brasil",
          deliveryDispatchTimeMinutes: dispatchTimeMinutes,
          maxOrdersPerRoute: parseInt(maxOrders, 10) || 4,
          routeGroupingMode,
          deliveryFeeMode,
          deliveryPricePerKm: deliveryPricePerKm.trim()
            ? parseFloat(deliveryPricePerKm)
            : null,
          baseDeliveryDistanceKm: baseDeliveryDistanceKm.trim()
            ? parseFloat(baseDeliveryDistanceKm)
            : null,
          baseDeliveryFee: baseDeliveryFee.trim()
            ? parseFloat(baseDeliveryFee)
            : null,
          additionalPricePerKm: additionalPricePerKm.trim()
            ? parseFloat(additionalPricePerKm)
            : null,
          minimumDeliveryFee: minimumDeliveryFee.trim()
            ? parseFloat(minimumDeliveryFee)
            : null,
          maximumDeliveryFee: maximumDeliveryFee.trim()
            ? parseFloat(maximumDeliveryFee)
            : null,
          distanceProvider,
          useDistanceCache,
        }),
      });
      setDispatchTime(String(dispatchTimeMinutes));
      invalidateOperationalQueries();
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: `Tempo de saída atualizado para ${dispatchTimeMinutes} minutos.`,
      });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Erro ao salvar configurações",
        variant: "destructive",
      });
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
            <RefreshCw
              className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
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
                  placeholder="Minha Loja"
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
                <Label>E-mail</Label>
                <Input
                  placeholder="contato@minhaloja.com"
                  value={storeEmail}
                  onChange={(e) => setStoreEmail(e.target.value)}
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
                      const digits = normalizeCepDigits(storeCep);
                      if (digits.length !== 8) return;
                      setStoreCep(digits);
                      setCepLookupStatus("loading");
                      const result = await lookupCep(digits);
                      if (result) {
                        setStoreCep(result.cep);
                        setStoreAddress(result.logradouro);
                        setStoreNeighborhood(result.bairro);
                        setStoreCity(result.localidade);
                        setStoreState(result.uf);
                        setCepLookupStatus("found");
                      } else {
                        setCepLookupStatus("not_found");
                      }
                    }}
                    maxLength={9}
                    data-testid="input-store-cep"
                  />
                  {cepLookupStatus === "loading" && (
                    <span className="absolute right-2.5 top-2.5 text-xs text-muted-foreground animate-pulse">
                      buscando...
                    </span>
                  )}
                  {cepLookupStatus === "found" && (
                    <span className="absolute right-2.5 top-2.5 text-xs text-green-600">
                      ✓ endereço preenchido
                    </span>
                  )}
                  {cepLookupStatus === "not_found" && (
                    <span className="absolute right-2.5 top-2.5 text-xs text-red-500">
                      CEP não encontrado
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Usado como origem para cálculo de entrega e geração de rotas.
                  Ao sair do campo, preenchemos o endereço automaticamente via
                  ViaCEP.
                </p>
              </div>
              <div>
                <Label>Endereço</Label>
                <Input
                  placeholder="Rua XV de Novembro, 500"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  data-testid="input-store-address"
                />
              </div>
              <div>
                <Label>Número</Label>
                <Input
                  placeholder="123"
                  value={storeNumber}
                  onChange={(e) => setStoreNumber(e.target.value)}
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
                  placeholder="Cidade"
                  value={storeCity}
                  onChange={(e) => setStoreCity(e.target.value)}
                  data-testid="input-store-city"
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Input
                  placeholder="UF"
                  value={storeState}
                  onChange={(e) => setStoreState(e.target.value)}
                />
              </div>
              <div>
                <Label>País</Label>
                <Input
                  placeholder="Brasil"
                  value={storeCountry}
                  onChange={(e) => setStoreCountry(e.target.value)}
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
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <Label
                      htmlFor="delivery-dispatch-time"
                      className="text-sm font-semibold"
                    >
                      Tempo para a entrega sair
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Define em quantos minutos o pedido deve sair para entrega
                      após entrar na cozinha. Esse prazo é usado para alertar
                      atrasos na tela Rotas.
                    </p>
                  </div>
                  <Input
                    id="delivery-dispatch-time"
                    type="number"
                    min="1"
                    max="180"
                    step="1"
                    placeholder="Ex: 30"
                    value={dispatchTime}
                    onChange={(e) => setDispatchTime(e.target.value)}
                    data-testid="input-dispatch-time"
                  />
                  <p className="text-xs font-medium text-primary">
                    Com esta configuração, um pedido enviado às 18:00 deve sair
                    até {dispatchPreviewTime}.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <div className="col-span-2">
                <Label>Modo de agrupamento de rotas</Label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={routeGroupingMode}
                  onChange={(e) =>
                    setRouteGroupingMode(
                      e.target.value as "neighborhood" | "distance" | "hybrid",
                    )
                  }
                >
                  <option value="hybrid">
                    Híbrido (bairro + distância + CEP)
                  </option>
                  <option value="neighborhood">Priorizar mesmo bairro</option>
                  <option value="distance">Priorizar distância/CEP</option>
                </select>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">
                Como o endereço da loja é usado:
              </p>
              <p>• Origem no Google Maps para todas as rotas geradas</p>
              <p>
                • Configure cidade e estado da loja para melhorar cálculo de
                entrega e rotas
              </p>
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
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {(
                  [
                    {
                      value: "manual" as const,
                      label: "✋ Manual",
                      desc: "Operador digita a taxa em cada pedido",
                    },
                    {
                      value: "per_km" as const,
                      label: "🚚 Por km",
                      desc: "Distância × valor por km, com mínimo/máximo",
                    },
                    {
                      value: "distance_tier" as const,
                      label: "📏 Faixa + extra",
                      desc: "Taxa fixa até X km, valor adicional acima",
                    },
                  ] as const
                ).map((opt) => {
                  const isActive = deliveryFeeMode === opt.value;
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
                      <p
                        className={`text-xs mt-0.5 ${isActive ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                      >
                        {opt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {(deliveryFeeMode === "distance_tier" ||
              deliveryFeeMode === "per_km") && (
              <>
                {!storeCep.replace(/\D/g, "").match(/^\d{8}$/) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                    ⚠️ Preencha o <strong>CEP da loja</strong> acima para ativar
                    o cálculo automático.
                  </p>
                )}
                <div className="space-y-4 border rounded-xl p-4 bg-muted/30">
                  {deliveryFeeMode === "per_km" && (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <Label>Valor por km (R$)</Label>
                        <Input
                          type="number"
                          step="0.50"
                          min="0"
                          placeholder="2,50"
                          value={deliveryPricePerKm}
                          onChange={(e) =>
                            setDeliveryPricePerKm(e.target.value)
                          }
                          data-testid="input-delivery-price-per-km"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Taxa = km real × este valor
                        </p>
                      </div>
                      <div>
                        <Label>Taxa mínima (R$)</Label>
                        <Input
                          type="number"
                          step="0.50"
                          min="0"
                          placeholder="7,00"
                          value={minimumDeliveryFee}
                          onChange={(e) =>
                            setMinimumDeliveryFee(e.target.value)
                          }
                          data-testid="input-minimum-delivery-fee"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Piso aplicado após o cálculo por km
                        </p>
                      </div>
                      <div>
                        <Label>Taxa máxima (R$)</Label>
                        <Input
                          type="number"
                          step="0.50"
                          min="0"
                          placeholder="25,00"
                          value={maximumDeliveryFee}
                          onChange={(e) =>
                            setMaximumDeliveryFee(e.target.value)
                          }
                          data-testid="input-maximum-delivery-fee"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Teto opcional configurado
                        </p>
                      </div>
                    </div>
                  )}

                  {deliveryFeeMode === "distance_tier" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Taxa mínima de entrega (R$)</Label>
                        <Input
                          type="number"
                          step="0.50"
                          min="0"
                          placeholder="7,00"
                          value={baseDeliveryFee}
                          onChange={(e) => setBaseDeliveryFee(e.target.value)}
                          data-testid="input-base-delivery-fee"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Valor cobrado até a distância incluída
                        </p>
                      </div>
                      <div>
                        <Label>Distância incluída (km)</Label>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          placeholder="2"
                          value={baseDeliveryDistanceKm}
                          onChange={(e) =>
                            setBaseDeliveryDistanceKm(e.target.value)
                          }
                          data-testid="input-base-delivery-distance-km"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Km já cobertos pela taxa mínima
                        </p>
                      </div>
                      <div>
                        <Label>Valor por km excedente (R$)</Label>
                        <Input
                          type="number"
                          step="0.50"
                          min="0"
                          placeholder="2,00"
                          value={additionalPricePerKm}
                          onChange={(e) =>
                            setAdditionalPricePerKm(e.target.value)
                          }
                          data-testid="input-additional-price-per-km"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Cobrado por km além da distância incluída
                        </p>
                      </div>
                      <div>
                        <Label>Taxa máxima (R$)</Label>
                        <Input
                          type="number"
                          step="0.50"
                          min="0"
                          placeholder="25,00"
                          value={maximumDeliveryFee}
                          onChange={(e) =>
                            setMaximumDeliveryFee(e.target.value)
                          }
                          data-testid="input-maximum-delivery-fee"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Teto opcional configurado
                        </p>
                      </div>
                      <div>
                        <Label>Taxa mínima (R$)</Label>
                        <Input
                          type="number"
                          step="0.50"
                          min="0"
                          placeholder="5,00"
                          value={minimumDeliveryFee}
                          onChange={(e) =>
                            setMinimumDeliveryFee(e.target.value)
                          }
                          data-testid="input-minimum-delivery-fee"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Piso opcional aplicado ao final
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Exemplo dinâmico */}
                  {deliveryFeeMode === "distance_tier" &&
                    baseDeliveryFee &&
                    baseDeliveryDistanceKm &&
                    additionalPricePerKm &&
                    (() => {
                      const bFee = parseFloat(baseDeliveryFee);
                      const bDist = parseFloat(baseDeliveryDistanceKm);
                      const add = parseFloat(additionalPricePerKm);
                      const max = maximumDeliveryFee
                        ? parseFloat(maximumDeliveryFee)
                        : null;
                      if (isNaN(bFee) || isNaN(bDist) || isNaN(add))
                        return null;
                      const rawEx3 = bFee + Math.max(0, 3 - bDist) * add;
                      const rawEx5 = bFee + Math.max(0, 5 - bDist) * add;
                      const ex3 = max === null ? rawEx3 : Math.min(rawEx3, max);
                      const ex5 = max === null ? rawEx5 : Math.min(rawEx5, max);
                      return (
                        <div className="rounded-lg bg-background border px-4 py-3 text-xs space-y-1.5">
                          <p className="font-semibold text-foreground mb-2">
                            Exemplos com esta configuração:
                          </p>
                          <div className="flex justify-between text-muted-foreground">
                            <span>Até {bDist} km (taxa mínima)</span>
                            <span className="font-semibold text-foreground">
                              R$ {bFee.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>3 km</span>
                            <span className="font-semibold text-foreground">
                              R$ {ex3.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>5 km</span>
                            <span className="font-semibold text-foreground">
                              R$ {ex5.toFixed(2)}
                            </span>
                          </div>
                          {maximumDeliveryFee && (
                            <div className="flex justify-between text-muted-foreground border-t pt-1 mt-1">
                              <span>Teto máximo</span>
                              <span className="font-semibold text-foreground">
                                R$ {parseFloat(maximumDeliveryFee).toFixed(2)}
                              </span>
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

        {/* Distance provider */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="w-4 h-4 text-primary" />
              Serviço de Distância
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="block mb-2">
                Método de cálculo de distância
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      value: "approximate_cep" as const,
                      label: "📍 Estimativa por CEP",
                      desc: "Rápida, sem chave de API. Precisão ≈ 1–3 km.",
                    },
                    {
                      value: "openrouteservice" as const,
                      label: "🗺️ OpenRouteService",
                      desc: "Distância de rota real via OpenStreetMap.",
                    },
                  ] as const
                ).map((opt) => {
                  const isActive = distanceProvider === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDistanceProvider(opt.value)}
                      className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:border-primary/50"
                      }`}
                      data-testid={`button-dist-provider-${opt.value}`}
                    >
                      <p className="font-medium">{opt.label}</p>
                      <p
                        className={`text-xs mt-0.5 ${isActive ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                      >
                        {opt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Always show ORS key status */}
            <div
              className={`rounded-lg border px-4 py-3 text-sm space-y-1.5 ${
                orsConfigured
                  ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20"
                  : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20"
              }`}
            >
              {orsConfigured ? (
                <p className="font-medium text-green-700 dark:text-green-300">
                  ✅ OpenRouteService configurado — cálculo de rota real
                  disponível
                </p>
              ) : (
                <p className="font-medium text-amber-700 dark:text-amber-300">
                  ⚠️ Chave não configurada — selecionar OpenRouteService usará
                  estimativa por CEP como fallback
                </p>
              )}
              {!orsConfigured && (
                <p className="text-xs text-muted-foreground">
                  Defina{" "}
                  <code className="font-mono bg-muted px-1 rounded">
                    OPENROUTESERVICE_API_KEY
                  </code>{" "}
                  nos Secrets do Replit com sua chave gratuita do{" "}
                  <a
                    href="https://openrouteservice.org/dev/#/signup"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-primary"
                  >
                    openrouteservice.org
                  </a>{" "}
                  e reinicie o servidor. Plano gratuito: 2 000 requisições/dia.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Cache de distâncias</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Evita consultas repetidas à API para o mesmo par de CEPs
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={useDistanceCache}
                onClick={() => setUseDistanceCache((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  useDistanceCache ? "bg-primary" : "bg-input"
                }`}
                data-testid="toggle-use-distance-cache"
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg transform transition-transform ${
                    useDistanceCache ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
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

        {/* Dev Tools */}
        {showDevTools && (
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
                  <TriangleAlert className="w-4 h-4 shrink-0" />O que será
                  apagado:
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
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="dev-admin-key">Chave admin de teste</Label>
                    <Input
                      id="dev-admin-key"
                      value={devAdminKeyInput}
                      onChange={(e) => setDevAdminKeyInput(e.target.value)}
                      placeholder="Ex: gestormax-dev"
                      data-testid="input-dev-admin-key"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSaveDevAdminKey}
                    data-testid="button-save-dev-admin-key"
                  >
                    Salvar chave
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Para testes no Replit Preview, use: gestormax-dev. Essa
                  ferramenta será removida ou protegida antes da publicação.
                </p>
                <p className="text-xs font-medium text-muted-foreground">
                  Chave usada nas ferramentas dev: {devToolKeyLabel}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2"
                  onClick={handleTestDevTools}
                  disabled={resetting || seedingDeliveries || testingDevTools}
                  data-testid="button-test-dev-tools"
                >
                  <RefreshCw className="w-4 h-4" />
                  {testingDevTools
                    ? "Testando ferramentas..."
                    : "Testar ferramentas dev"}
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
                  onClick={() => setShowResetConfirm(true)}
                  disabled={resetting || seedingDeliveries || testingDevTools}
                  data-testid="button-reset-data"
                >
                  <Trash2 className="w-4 h-4" />
                  Zerar todos os dados do PDV
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={handleSeedDeliveries}
                  disabled={resetting || seedingDeliveries || testingDevTools}
                  data-testid="button-seed-curitiba-deliveries"
                >
                  <Package className="w-4 h-4" />
                  {seedingDeliveries
                    ? "Criando deliveries..."
                    : "Criar 20 deliveries de teste"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
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
                Esta ação irá apagar{" "}
                <strong>
                  todos os pedidos, rotas, tickets de cozinha e pagamentos
                </strong>{" "}
                do sistema.
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
