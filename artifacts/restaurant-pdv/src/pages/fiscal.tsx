import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  LockKeyhole,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FiscalAccess = {
  feature: "fiscal";
  allowed: true;
  storeId: number;
  plan: string | null;
  status: string | null;
};

type FiscalAccessError = {
  error: string;
  code?: string;
  requiredPlan?: string;
  plan?: string | null;
  status?: string | null;
};

export default function FiscalPage() {
  const [access, setAccess] = useState<FiscalAccess | null>(null);
  const [accessError, setAccessError] = useState<FiscalAccessError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/fiscal/access", {
      credentials: "include",
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as
          | FiscalAccess
          | FiscalAccessError;
        if (!response.ok) throw data;
        return data as FiscalAccess;
      })
      .then((data) => {
        if (!cancelled) {
          setAccess(data);
          setAccessError(null);
        }
      })
      .catch((error: FiscalAccessError) => {
        if (!cancelled) {
          setAccess(null);
          setAccessError({
            error:
              typeof error?.error === "string"
                ? error.error
                : "Não foi possível verificar o acesso ao módulo fiscal.",
            code: error?.code,
            requiredPlan: error?.requiredPlan,
            plan: error?.plan,
            status: error?.status,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Fiscal</h1>
              <p className="mt-1 text-muted-foreground">
                NFC-e integrada ao Gestor Max PRO.
              </p>
            </div>
          </div>
        </div>

        {loading && (
          <Card>
            <CardContent className="flex min-h-44 items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Verificando o plano da loja...
            </CardContent>
          </Card>
        )}

        {!loading && access && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
                Acesso fiscal liberado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sua loja possui o Gestor Max PRO e está habilitada para iniciar
                a configuração fiscal.
              </p>
              <div className="rounded-xl border bg-background/70 p-4">
                <div className="text-sm font-semibold">Configuração fiscal</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Ainda não iniciada. O próximo passo será cadastrar os dados da
                  empresa e as regras fiscais antes de qualquer emissão real.
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border px-3 py-1">
                  Plano: PRO
                </span>
                <span className="rounded-full border px-3 py-1">
                  Status: {access.status === "trialing" ? "Teste ativo" : "Ativo"}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && accessError && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                {accessError.code === "SUBSCRIPTION_INACTIVE" ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <LockKeyhole className="h-5 w-5" />
                )}
                {accessError.code === "SUBSCRIPTION_INACTIVE"
                  ? "Plano PRO sem acesso ativo"
                  : "Recurso exclusivo do Gestor Max PRO"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-muted-foreground">
                {accessError.error}
              </p>
              {accessError.status && (
                <div className="rounded-xl border bg-background/70 p-4 text-sm">
                  Status atual da assinatura: <strong>{accessError.status}</strong>
                </div>
              )}
              <Button asChild className="bg-primary hover:bg-primary/90">
                <Link href="/plans">Conhecer o plano PRO</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
