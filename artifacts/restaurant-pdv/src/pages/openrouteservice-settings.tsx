import { useCallback, useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  Route,
  Save,
  ShieldCheck,
  TestTube2,
  Trash2,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface OrsStatus {
  configured: boolean;
  source: "store" | "platform" | "none";
  masked: string | null;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    let message = text || `HTTP ${response.status}`;
    try {
      const body = JSON.parse(text) as { error?: string; message?: string };
      message = body.error || body.message || message;
    } catch {
      // Keep raw response.
    }
    throw new Error(message);
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

function statusLabel(status: OrsStatus | null): string {
  if (!status?.configured) return "Nenhuma chave configurada";
  if (status.source === "store") return "Chave própria desta loja";
  return "Chave compartilhada da plataforma";
}

export default function OpenRouteServiceSettingsPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<OrsStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(
        await apiFetch<OrsStatus>("/settings/openrouteservice-key"),
      );
    } catch (error) {
      toast({
        title:
          error instanceof Error
            ? error.message
            : "Erro ao carregar configuração.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const saveKey = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "Cole a chave OpenRouteService antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const nextStatus = await apiFetch<OrsStatus>(
        "/settings/openrouteservice-key",
        {
          method: "PUT",
          body: JSON.stringify({ apiKey: apiKey.trim() }),
        },
      );
      setStatus(nextStatus);
      setApiKey("");
      setShowKey(false);
      toast({ title: "Chave própria salva com segurança para esta loja." });
    } catch (error) {
      toast({
        title:
          error instanceof Error ? error.message : "Erro ao salvar a chave.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const testKey = async () => {
    setTesting(true);
    try {
      await apiFetch<{ valid: boolean }>(
        "/settings/openrouteservice-key/test",
        {
          method: "POST",
          body: JSON.stringify({ apiKey: apiKey.trim() || undefined }),
        },
      );
      toast({ title: "Chave validada com sucesso no OpenRouteService." });
    } catch (error) {
      toast({
        title:
          error instanceof Error ? error.message : "A chave não foi validada.",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const removeKey = async () => {
    setRemoving(true);
    try {
      const nextStatus = await apiFetch<OrsStatus>(
        "/settings/openrouteservice-key",
        { method: "DELETE" },
      );
      setStatus(nextStatus);
      setApiKey("");
      toast({
        title:
          nextStatus.source === "platform"
            ? "Chave própria removida. A loja voltou para a chave compartilhada."
            : "Chave própria removida. O sistema usará estimativa por CEP.",
      });
    } catch (error) {
      toast({
        title:
          error instanceof Error ? error.message : "Erro ao remover a chave.",
        variant: "destructive",
      });
    } finally {
      setRemoving(false);
    }
  };

  const busy = loading || saving || testing || removing;

  return (
    <Layout>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            <Route className="h-8 w-8 text-primary" />
            API de Distância
          </h1>
          <p className="mt-1 text-muted-foreground">
            Configure uma chave OpenRouteService própria para a loja atual.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Situação da integração
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`rounded-xl border p-4 ${
                status?.configured
                  ? "border-green-500/30 bg-green-500/5"
                  : "border-amber-500/30 bg-amber-500/5"
              }`}
            >
              <p className="font-semibold">{statusLabel(status)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {loading
                  ? "Carregando..."
                  : status?.configured
                    ? `Chave ativa: ${status.masked ?? "configurada"}`
                    : "Sem chave válida, o Gestor Max continua funcionando com estimativa por CEP."}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-5 w-5 text-primary" />
              Chave própria da loja
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ors-api-key">OpenRouteService API Key</Label>
              <div className="relative">
                <Input
                  id="ors-api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="Cole aqui a chave gerada no OpenRouteService"
                  autoComplete="off"
                  className="pr-11"
                  data-testid="input-openrouteservice-key"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                A chave é criptografada no banco e nunca volta completa para o
                navegador. Cada loja usa a própria cota diária.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={saveKey}
                disabled={busy || !apiKey.trim()}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar chave própria"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={testKey}
                disabled={busy || (!apiKey.trim() && !status?.configured)}
                className="gap-2"
              >
                <TestTube2 className="h-4 w-4" />
                {testing ? "Testando..." : "Testar chave"}
              </Button>
              {status?.source === "store" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={removeKey}
                  disabled={busy}
                  className="gap-2 border-red-300 text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {removing ? "Removendo..." : "Remover chave"}
                </Button>
              )}
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              <p>
                A loja deve criar a própria conta e gerar sua chave em{" "}
                <a
                  href="https://openrouteservice.org/dev/#/signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary underline"
                >
                  openrouteservice.org
                </a>
                .
              </p>
              <p className="mt-2">
                Quando a cota da chave acabar ou a API ficar indisponível, o
                Gestor Max volta automaticamente para a estimativa por CEP.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
